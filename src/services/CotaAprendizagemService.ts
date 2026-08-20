/**
 * CotaAprendizagemService — coleta o faturamento mensal do SCI e classifica o
 * porte dos clientes (ME / EPP / Demais) para saber quem está sujeito à cota
 * de aprendizagem.
 *
 * Base legal: LC 123/2006 art. 3º + IN SIT/MTE 146/2018 art. 3º, I.
 * Especificação: `Regra/regras-cota-aprendizagem.md`. As regras em si estão em
 * `cotaAprendizagem.rules.ts` (funções puras, testadas sem banco).
 *
 * ESCOPO: só a classificação de porte. Não calcula número de aprendizes.
 *
 * ─── Duas decisões que valem explicação ──────────────────────────────────────
 *
 * 1. COLETA PRÓPRIA, e não reuso de `irpf_faturamento_detalhado`. O cache do
 *    IRPF tem dois escritores incompatíveis (um grava com SOMAMATRIZFILIAL=1
 *    sob codigo_empresa=1, o outro com =0 por estabelecimento), e somá-lo pode
 *    contar a filial duas vezes. Além disso ele só cobre [anoAtual-2,
 *    anoAtual-1] — o ano corrente, que é o que a regra dos 20% precisa, nunca
 *    é buscado. Detalhes na migration 038.
 *
 * 2. `SOMAMATRIZFILIAL = 1`. A LC 123 mede a receita bruta da PESSOA JURÍDICA,
 *    não do estabelecimento — matriz e filiais somam.
 *    ATENÇÃO PARA A FASE 2: a COTA em si é apurada POR ESTABELECIMENTO
 *    (IN 146/2018, doc §3.4). Quem for calcular número de aprendizes NÃO pode
 *    herdar este número consolidado.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { executeQuery, mysqlPool } from '../config/mysql';
import { comLockSci } from './sciLock';
import EmailService from './EmailService';
import {
  montarHtmlCota,
  montarHtmlEnquadramento,
  separarSecoes,
  calcularTotalizadores,
  labelCompetencia,
  TITULO_ENQUADRAMENTO,
  TITULO_COTA,
} from './cotaAprendizagem.email';
import {
  classificar,
  detectarEventos,
  diagnosticar,
  divergenciaComSimples,
  ehSociedadeDeAdvogados,
  receitaZeradaSuspeita,
  mesReferencia,
  bdrefDe,
  parseValorParaCentavos,
  centavosParaReais,
  MOTOR_VERSAO,
  type MesReceita,
  type Porte,
  type ResultadoClassificacao,
  type Evento,
  type Diagnostico,
} from './cotaAprendizagem.rules';

const execAsync = promisify(exec);

// Parâmetros da SP_BI_FAT(EMPRESA, PLANO, QUADRO, DATA_INI, DATA_FIM, SOMAMATRIZFILIAL).
// QUADRO=2 devolve os 7 componentes de receita em BDORDEM; BDORDEM=7 é o
// faturamento total — a MESMA métrica que a aba Faturamento SCI já exibe.
const SP_PLANO = 2;
const SP_QUADRO = 2;
const SP_SOMA_MATRIZ_FILIAL = 1;
const SP_BDORDEM_FATURAMENTO_TOTAL = 7;
const SCI_TIMEOUT_MS = 150000;

/**
 * Qual componente da SP_BI_FAT é tratado como "receita bruta".
 *
 * A LC 123 art. 3º §1º define receita bruta excluindo vendas canceladas e
 * descontos incondicionais, e sem receita não-operacional — e o
 * `faturamento_total` (BDORDEM=7) inclui `outras_receitas`. Fica parametrizado
 * para que, se o fiscal concluir que a base correta é outra, se troque aqui e
 * reapure sem reescrever o serviço. Gravado em cada linha coletada.
 */
const BASE_RECEITA = process.env['COTA_BASE_RECEITA'] || 'faturamento_total';

// A antecipação do enquadramento é contada do mês em que a RBA passou de
// R$ 5,76 mi. Gravado na coluna para deixar explícito no registro qual mês
// originou a data de efeito.
const CRITERIO_MES_EXCESSO = 'MES_20PCT';

/**
 * A apuração é uma só e gera DOIS avisos, com públicos distintos:
 *
 *   ENQUADRAMENTO → Fiscal. Mudança de porte ME/EPP/Demais.
 *   COTA          → Departamento Pessoal. Quem deve contratar aprendiz.
 *
 * Listas separadas de propósito: mandar tudo para todo mundo faria cada time
 * garimpar no meio do assunto do outro — e o motivo de ter separado os e-mails
 * se perderia no destinatário.
 *
 * Ambas caem em `ti@` por padrão: sem configuração explícita, é melhor o aviso
 * chegar a quem administra o sistema do que a um setor errado.
 */
const listaDeEnv = (v: string | undefined, padrao: string): string[] =>
  (v || padrao)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const COTA_ALERT_RECIPIENTS = listaDeEnv(
  process.env['COTA_ALERT_EMAILS'],
  'ti@central-rnc.com.br'
);

export const ENQUADRAMENTO_ALERT_RECIPIENTS = listaDeEnv(
  process.env['ENQUADRAMENTO_ALERT_EMAILS'],
  'ti@central-rnc.com.br'
);

export type TipoAviso = 'ENQUADRAMENTO' | 'COTA';

export interface ResultadoEnvio {
  tipo: TipoAviso;
  enviado: boolean;
  motivo?: string;
  erro?: string;
  bdref: number | null;
  destinatarios: string[];
}

/** Destinatários do aviso, respeitando um override explícito da chamada. */
function destinatariosDe(tipo: TipoAviso, override?: string[]): string[] {
  if (override?.length) return override;
  return tipo === 'ENQUADRAMENTO' ? ENQUADRAMENTO_ALERT_RECIPIENTS : COTA_ALERT_RECIPIENTS;
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface ClienteCota {
  id: string;
  razao_social: string;
  cnpj: string;
  codigo_sci: number | null;
  uf: string | null;
  porte_declarado: string | null;
  abertura: string | null;
}

export interface LinhaClassificacao extends ClienteCota {
  ano: number;
  mes: number;
  bdref: number;
  rbaa: number | null;
  rba: number | null;
  porte: Porte;
  porte_base: Porte;
  motivo: string;
  sujeita_cota: boolean | null;
  excede_teto_epp: boolean;
  excede_teto_me: boolean;
  mes_excesso_limite: number | null;
  mes_excesso_20pct: number | null;
  data_efeito: string | null;
  meses_faltantes: number;
  meses_faltantes_lista: string | null;
  dado_confiavel: boolean;
  impedimento_societario: boolean;
  inicio_atividade: boolean;
  revisar_juridico: boolean;
  /** Códigos do porquê da revisão: SOCIO_PJ, SOCIO_EXTERIOR, SOCIO_OAB, … */
  revisar_motivos: string[];
  porte_anterior: Porte | null;
  mudou: boolean;
  eventos: Evento[];
  /**
   * Sociedade de advogados: o porte "Demais" do CNPJ é imposto pelo registro
   * na OAB, não é cadastro atrasado. Derivado na leitura, como o diagnóstico —
   * a classificação não usa isto, porque o porte sempre veio da receita.
   */
  sociedade_advogados: boolean;
  /**
   * Leitura pronta da situação: onde está, para onde vai e em que prazo.
   * Derivado na leitura (não é coluna) — assim mudar a redação não exige
   * reapurar nem migrar nada.
   */
  diagnostico: Diagnostico;
}

export interface ResumoSincronizacao {
  bdref: number;
  ano: number;
  mes: number;
  total: number;
  processados: number;
  semCodigoSci: number;
  erros: number;
  mudancas: number;
  semDados: number;
  duracaoMs: number;
}

/** Resultado de uma reclassificação — sem SCI, então sem `semCodigoSci`. */
export interface ResumoReclassificacao {
  bdref: number;
  ano: number;
  mes: number;
  total: number;
  mudancas: number;
  semDados: number;
  duracaoMs: number;
}

export interface StatusSincronizacao {
  rodando: boolean;
  processados: number;
  total: number;
  bdref: number | null;
  iniciadoEm: number | null;
  ultimoResumo: ResumoSincronizacao | null;
}

// ─── Helpers puros locais ────────────────────────────────────────────────────

/** Último dia do mês em `YYYY-MM-DD` (formato aceito pelo Firebird aqui). */
function ultimoDiaDoMes(ano: number, mes: number): string {
  const dia = new Date(ano, mes, 0).getDate(); // dia 0 do mês seguinte
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** `mysql2` devolve DECIMAL como string — normalizar sempre. */
function numeroOuNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Coluna DATE do MySQL → 'YYYY-MM-DD'.
 *
 * Dois erros que esta função existe para evitar, os dois já observados:
 *
 * 1. `String(date).slice(0,10)` devolve lixo ("Tue Mar 31") — corta o formato
 *    textual do JS, não a data ISO.
 * 2. Ler os componentes em horário LOCAL devolve o DIA ANTERIOR. O pool deste
 *    projeto está fixado em `timezone: '+00:00'` (src/config/mysql.ts:28),
 *    então o driver materializa a DATE como meia-noite UTC; em UTC−3 isso é
 *    21h do dia anterior no relógio local. Uma data de efeito 01/04 aparecia
 *    como 31/03 — justamente o mês em que a obrigação começa.
 *
 * Por isso a leitura é em UTC: é o fuso em que o driver entregou o valor.
 * DATE não carrega hora nem fuso, então não há conversão a fazer — só ler os
 * componentes no mesmo fuso em que foram escritos.
 */
export function dataParaIso(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    const ano = v.getUTCFullYear();
    const mes = String(v.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(v.getUTCDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }
  return String(v).slice(0, 10);
}

/** Competência anterior a (ano, mes), para comparar e detectar virada. */
function competenciaAnterior(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

/**
 * Reconstrói o diagnóstico a partir da linha já gravada.
 *
 * O diagnóstico é derivado na LEITURA e não gravado em coluna: assim ajustar a
 * redação de uma frase não exige reapurar a base nem criar migration. O motor
 * puro é a única fonte da regra — aqui só remontamos a entrada dele.
 */
function diagnosticarDaLinha(r: any): Diagnostico {
  const rbaReais = numeroOuNull(r.rba);
  const resultadoParcial: ResultadoClassificacao = {
    porte: r.porte as Porte,
    porteBase: r.porte_base as Porte,
    motivo: r.motivo,
    sujeitaCota: r.sujeita_cota === null ? null : Number(r.sujeita_cota) === 1,
    rbaCentavos: rbaReais === null ? null : Math.round(rbaReais * 100),
    serie: [],
    excedeTetoEpp: Number(r.excede_teto_epp) === 1,
    excedeTetoMe: Number(r.excede_teto_me) === 1,
    mesExcessoLimite: numeroOuNull(r.mes_excesso_limite),
    mesExcesso20pct: numeroOuNull(r.mes_excesso_20pct),
    mesFatoAplicado: numeroOuNull(r.mes_excesso_20pct),
    dataEfeito: dataParaIso(r.data_efeito),
    mesesFaltantes: [],
    dadoConfiavel: Number(r.dado_confiavel) === 1,
    revisarJuridico: Number(r.revisar_juridico) === 1,
    impedimentoSocietario: Number(r.impedimento_societario) === 1,
  };
  return diagnosticar({ resultado: resultadoParcial, ano: Number(r.ano) });
}

// ─── Serviço ─────────────────────────────────────────────────────────────────

export class CotaAprendizagemService {
  private rodando = false;
  /** Guarda própria: a reclassificação é rápida, mas escreve nas mesmas linhas. */
  private reclassificando = false;
  private processados = 0;
  private total = 0;
  private bdrefAtual: number | null = null;
  private iniciadoEm: number | null = null;
  private ultimoResumo: ResumoSincronizacao | null = null;

  get status(): StatusSincronizacao {
    return {
      rodando: this.rodando,
      processados: this.processados,
      total: this.total,
      bdref: this.bdrefAtual,
      iniciadoEm: this.iniciadoEm,
      ultimoResumo: this.ultimoResumo,
    };
  }

  /**
   * Consulta o SCI e devolve o faturamento mensal consolidado (matriz+filiais)
   * do ano anterior até o mês de referência do ano corrente.
   *
   * Uma chamada só cobre os dois anos — metade do custo de uma por ano, e a SP
   * é lenta e serializada pelo lock.
   */
  private async coletarDoSci(
    codigoSci: number,
    anoAnterior: number,
    anoRef: number,
    mesRef: number
  ): Promise<Map<number, number>> {
    const ini = `${anoAnterior}-01-01`;
    const fim = ultimoDiaDoMes(anoRef, mesRef);

    const sql =
      `SELECT t.BDREF, ` +
      `SUM(CASE WHEN t.BDORDEM = ${SP_BDORDEM_FATURAMENTO_TOTAL} THEN t.BDVALOR ELSE 0 END) AS FAT ` +
      `FROM SP_BI_FAT(${codigoSci}, ${SP_PLANO}, ${SP_QUADRO}, '${ini}', '${fim}', ${SP_SOMA_MATRIZ_FILIAL}) t ` +
      `GROUP BY t.BDREF ORDER BY t.BDREF`;

    const scriptPath = path.join(__dirname, '../../python/catalog/executar_sql.py');
    const b64 = Buffer.from(sql, 'utf-8').toString('base64');

    const { stdout } = await comLockSci(() =>
      execAsync(`python "${scriptPath}" --base64 ${b64}`, {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: SCI_TIMEOUT_MS,
      })
    );

    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new Error('Resposta inválida do SCI.');
    }
    if (!parsed?.success) throw new Error(parsed?.error || 'Falha na consulta ao SCI.');

    // bdref (YYYYMM) -> faturamento
    const porBdref = new Map<number, number>();
    for (const r of (parsed.rows as any[]) || []) {
      const bdref = Number(r[0]);
      const valor = Number(r[1]) || 0;
      if (!Number.isFinite(bdref)) continue;
      porBdref.set(bdref, (porBdref.get(bdref) || 0) + valor);
    }
    return porBdref;
  }

  /** Grava o coletado, sem apagar nada: UPSERT por (cliente, ano, mes). */
  private async persistirFaturamento(
    clienteId: string,
    codigoSci: number,
    porBdref: Map<number, number>
  ): Promise<void> {
    if (porBdref.size === 0) return;

    const valores: any[][] = [];
    for (const [bdref, faturamento] of porBdref) {
      const ano = Math.floor(bdref / 100);
      const mes = bdref % 100;
      if (mes < 1 || mes > 12) continue;
      valores.push([clienteId, codigoSci, ano, mes, bdref, faturamento, BASE_RECEITA]);
    }
    if (valores.length === 0) return;

    const ph = valores.map(() => '(?,?,?,?,?,?,?)').join(',');
    await mysqlPool.query(
      `INSERT INTO cota_faturamento_mensal
         (cliente_id, codigo_sci, ano, mes, bdref, faturamento, base_receita)
       VALUES ${ph}
       ON DUPLICATE KEY UPDATE
         faturamento = VALUES(faturamento),
         base_receita = VALUES(base_receita),
         codigo_sci = VALUES(codigo_sci)`,
      valores.flat()
    );
  }

  /** Lê do banco os meses já coletados de um cliente num ano. */
  private async lerMeses(clienteId: string, ano: number): Promise<MesReceita[]> {
    const rows = await executeQuery<{ mes: number; faturamento: string }>(
      `SELECT mes, faturamento FROM cota_faturamento_mensal
       WHERE cliente_id = ? AND ano = ? ORDER BY mes`,
      [clienteId, ano]
    );
    return rows.map((r) => ({
      mes: Number(r.mes),
      centavos: parseValorParaCentavos(r.faturamento),
    }));
  }

  /**
   * Filiais que NÃO devem ser apuradas — a matriz já responde pela PJ inteira.
   *
   * Medido direto no SCI (SP_BI_FAT com os dois valores de SOMAMATRIZFILIAL):
   *
   *   consulta pelo código da MATRIZ com =1  → matriz + todas as filiais do
   *                                            grupo, ou seja, o total da PJ
   *   consulta pelo código de uma FILIAL     → só aquela filial
   *
   * Conferido na CUSTOM BOX: matriz sozinha R$ 87.128,71 em jan/2026, filial
   * R$ 397.592,17, e a matriz com =1 devolve R$ 484.720,88 — a soma exata. Como
   * o número da matriz JÁ É o da PJ, manter a filial na apuração não acrescenta
   * faturamento: acrescenta uma segunda linha para a mesma empresa e classifica
   * um estabelecimento isolado, quando o porte da LC 123 é da pessoa jurídica.
   *
   * QUEM É A MATRIZ VEM DO CADASTRO (`tipo_estabelecimento`), nunca do sufixo do
   * CNPJ: há matriz cadastrada como 0002 e 0003 nesta base, e supor que 0001 é
   * sempre a matriz deixaria essas PJs inteiras de fora.
   *
   * A raiz do CNPJ entra só para AGRUPAR os estabelecimentos de uma mesma PJ —
   * não para decidir quem é matriz.
   *
   * Filial cuja matriz não está cadastrada NÃO é suprimida: ela é a única
   * representante daquela PJ aqui, e removê-la faria a empresa sumir da
   * apuração. Esse caso ganha a ressalva `MATRIZ_NAO_CADASTRADA`.
   */
  private async filiaisSuprimidas(): Promise<Set<string>> {
    const rows = await executeQuery<{ id: string }>(
      `SELECT f.id
       FROM clientes f
       WHERE f.ativo = 1
         AND UPPER(COALESCE(f.tipo_estabelecimento,'')) = 'FILIAL'
         AND LENGTH(COALESCE(f.cnpj_limpo,'')) = 14
         AND EXISTS (
           SELECT 1 FROM clientes m
           WHERE UPPER(COALESCE(m.tipo_estabelecimento,'')) = 'MATRIZ'
             AND LENGTH(COALESCE(m.cnpj_limpo,'')) = 14
             AND LEFT(m.cnpj_limpo, 8) = LEFT(f.cnpj_limpo, 8)
             AND m.ativo = 1
         )`
    );
    return new Set(rows.map((r) => r.id));
  }

  /** Filiais sem matriz cadastrada — representam a PJ sozinhas, por falta de opção. */
  private async filiaisSemMatriz(): Promise<Set<string>> {
    const rows = await executeQuery<{ id: string }>(
      `SELECT f.id
       FROM clientes f
       WHERE f.ativo = 1
         AND UPPER(COALESCE(f.tipo_estabelecimento,'')) = 'FILIAL'
         AND LENGTH(COALESCE(f.cnpj_limpo,'')) = 14
         AND NOT EXISTS (
           SELECT 1 FROM clientes m
           WHERE UPPER(COALESCE(m.tipo_estabelecimento,'')) = 'MATRIZ'
             AND LENGTH(COALESCE(m.cnpj_limpo,'')) = 14
             AND LEFT(m.cnpj_limpo, 8) = LEFT(f.cnpj_limpo, 8)
             AND m.ativo = 1
         )`
    );
    return new Set(rows.map((r) => r.id));
  }

  /**
   * Clientes que têm ao menos um sócio com documento de 14 dígitos (CNPJ).
   *
   * É uma SUSPEITA de impedimento societário (LC 123 art. 3º §4º, I), não uma
   * conclusão: o §4º tem onze incisos e os que dependem da receita global de
   * empresas fora da base do escritório são inderiváveis daqui. Quem usa isso
   * só liga `revisar_juridico` — o porte não muda por inferência.
   *
   * Filtra `ausente_no_cartao = 0` porque sócio que saiu do QSA continua na
   * tabela, apenas marcado (migration 036) — sem esse filtro a suspeita
   * apareceria por causa de quem já não é mais sócio.
   */
  private async clientesComSocioPJ(): Promise<Set<string>> {
    const rows = await executeQuery<{ cliente_id: string }>(
      `SELECT DISTINCT cs.cliente_id
       FROM clientes_socios cs
       WHERE LENGTH(REPLACE(COALESCE(cs.cpf,''), ' ', '')) = 14
         AND COALESCE(cs.ausente_no_cartao, 0) = 0`
    );
    return new Set(rows.map((r) => r.cliente_id));
  }

  /**
   * Clientes cujo quadro societário pede conferência jurídica, por motivo.
   *
   * Hoje há UM motivo societário: **sócio pessoa jurídica** (art. 3º §4º, I).
   * Basta existir qualquer PJ no quadro — não importa a natureza dela — para a
   * empresa perder o direito ao enquadramento como ME/EPP, e a vedação é "para
   * nenhum efeito legal", não só tributário.
   *
   * DOIS MOTIVOS FORAM RETIRADOS por não serem impedimento ao enquadramento:
   *
   *  - **Sócio no exterior.** O art. 3º não veda por domicílio de sócio. A
   *    vedação existe no art. 17, II, e alcança apenas o INGRESSO no Simples
   *    Nacional — outra coisa. Uma empresa com sócio no exterior segue ME/EPP
   *    (no Lucro Presumido, por exemplo) e, portanto, segue isenta da cota.
   *    Sócio PJ domiciliado no exterior continua acusado, mas pelo inciso I:
   *    o que impede é ser PJ, não onde ela mora.
   *  - **Sócio advogado / OAB.** Não há vedação a sócio advogado no art. 3º
   *    nem no 17: a advocacia está no Anexo IV do Simples (LC 123 art. 18,
   *    §5º-C) e a sociedade goza dos mesmos benefícios de ME/EPP dentro dos
   *    limites de receita. O que ela NÃO tem é o enquadramento CADASTRAL —
   *    o registro é só na OAB (Lei 8.906/94 art. 15, §1º), fora dos órgãos
   *    que o art. 3º da LC 123 exige, então o CNPJ fica em "Demais" para
   *    sempre. Ver `ehSociedadeDeAdvogados` em cotaAprendizagem.rules.ts.
   *
   * Marcar os dois enchia a fila do jurídico com casos que a lei não questiona
   * — e fila cheia de falso positivo é fila que ninguém confere.
   *
   * Como no resto da feature, isto SINALIZA e não decide: a qualificação vem
   * de um retrato da ReceitaWS e o §4º tem onze incisos, vários deles
   * inderiváveis daqui. O filtro de `ausente_no_cartao` evita acusar sócio que
   * já saiu do quadro.
   */
  private async clientesParaRevisar(): Promise<Map<string, Set<string>>> {
    const motivos = new Map<string, Set<string>>();
    const registrar = (clienteId: string, motivo: string) => {
      if (!motivos.has(clienteId)) motivos.set(clienteId, new Set());
      motivos.get(clienteId)!.add(motivo);
    };

    // Documento de 14 dígitos = CNPJ. Conferido na base: os documentos de sócio
    // são gravados só com dígitos (11 ou 14), então não há CPF pontuado —
    // que também teria 14 caracteres — caindo aqui por engano.
    const rows = await executeQuery<{ cliente_id: string; doc: string }>(
      `SELECT cs.cliente_id, REPLACE(COALESCE(cs.cpf,''), ' ', '') AS doc
       FROM clientes_socios cs
       WHERE COALESCE(cs.ausente_no_cartao, 0) = 0`
    );

    for (const r of rows) {
      if (r.doc.length === 14) registrar(r.cliente_id, 'SOCIO_PJ');
    }

    return motivos;
  }

  /** Classificação da competência anterior, para detectar virada. */
  private async lerClassificacaoAnterior(
    clienteId: string,
    ano: number,
    mes: number
  ): Promise<{ porte: Porte; excedeTetoEpp: boolean; excedeTetoMe: boolean } | null> {
    const ant = competenciaAnterior(ano, mes);
    const rows = await executeQuery<any>(
      `SELECT porte, excede_teto_epp, excede_teto_me
       FROM cota_classificacao_mensal
       WHERE cliente_id = ? AND ano = ? AND mes = ? LIMIT 1`,
      [clienteId, ant.ano, ant.mes]
    );
    const r = rows[0];
    if (!r) return null;
    return {
      porte: r.porte as Porte,
      excedeTetoEpp: Number(r.excede_teto_epp) === 1,
      excedeTetoMe: Number(r.excede_teto_me) === 1,
    };
  }

  private async persistirClassificacao(
    cliente: ClienteCota,
    ano: number,
    mes: number,
    r: ResultadoClassificacao,
    rbaaCentavos: number | null,
    porteAnterior: Porte | null,
    mudou: boolean,
    impedimento: boolean,
    inicioAtividade: boolean,
    revisarMotivos: string[] = []
  ): Promise<void> {
    // A revisão é pedida por qualquer motivo levantado aqui OU pelo próprio
    // motor (que sinaliza a divergência entre os dois meses de excesso).
    const precisaRevisar = revisarMotivos.length > 0 || r.revisarJuridico;
    await mysqlPool.query(
      `INSERT INTO cota_classificacao_mensal
         (cliente_id, ano, mes, bdref, rbaa, rba, porte, porte_base, motivo, sujeita_cota,
          excede_teto_epp, excede_teto_me, mes_excesso_limite, mes_excesso_20pct,
          criterio_mes_excesso, data_efeito, meses_faltantes, meses_faltantes_lista,
          dado_confiavel, impedimento_societario, inicio_atividade, revisar_juridico,
          revisar_motivos, porte_anterior, mudou, fonte, motor_versao)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         rbaa = VALUES(rbaa), rba = VALUES(rba), porte = VALUES(porte),
         porte_base = VALUES(porte_base), motivo = VALUES(motivo),
         sujeita_cota = VALUES(sujeita_cota),
         excede_teto_epp = VALUES(excede_teto_epp), excede_teto_me = VALUES(excede_teto_me),
         mes_excesso_limite = VALUES(mes_excesso_limite),
         mes_excesso_20pct = VALUES(mes_excesso_20pct),
         criterio_mes_excesso = VALUES(criterio_mes_excesso),
         data_efeito = VALUES(data_efeito),
         meses_faltantes = VALUES(meses_faltantes),
         meses_faltantes_lista = VALUES(meses_faltantes_lista),
         dado_confiavel = VALUES(dado_confiavel),
         impedimento_societario = VALUES(impedimento_societario),
         inicio_atividade = VALUES(inicio_atividade),
         revisar_juridico = VALUES(revisar_juridico),
         revisar_motivos = VALUES(revisar_motivos),
         porte_anterior = VALUES(porte_anterior), mudou = VALUES(mudou),
         fonte = VALUES(fonte), motor_versao = VALUES(motor_versao)`,
      [
        cliente.id,
        ano,
        mes,
        bdrefDe(ano, mes),
        rbaaCentavos === null ? null : centavosParaReais(rbaaCentavos),
        r.rbaCentavos === null ? null : centavosParaReais(r.rbaCentavos),
        r.porte,
        r.porteBase,
        r.motivo,
        r.sujeitaCota === null ? null : r.sujeitaCota ? 1 : 0,
        r.excedeTetoEpp ? 1 : 0,
        r.excedeTetoMe ? 1 : 0,
        r.mesExcessoLimite,
        r.mesExcesso20pct,
        CRITERIO_MES_EXCESSO,
        r.dataEfeito,
        r.mesesFaltantes.length,
        r.mesesFaltantes.length > 0 ? r.mesesFaltantes.join(',') : null,
        r.dadoConfiavel ? 1 : 0,
        impedimento ? 1 : 0,
        inicioAtividade ? 1 : 0,
        precisaRevisar ? 1 : 0,
        revisarMotivos.length > 0 ? revisarMotivos.join(',') : null,
        porteAnterior,
        mudou ? 1 : 0,
        'sci',
        MOTOR_VERSAO,
      ]
    );
  }

  /**
   * Roda a apuração: coleta o SCI, classifica e grava o histórico.
   *
   * Processa SEQUENCIALMENTE de propósito. Com o lock global do SCI, disparar
   * várias em paralelo não paraleliza nada — só enfileira promessas cujo
   * timeout de 150s corre NA FILA, produzindo timeouts espúrios.
   */
  async sincronizar(opts?: {
    clienteIds?: string[];
    mesReferencia?: { ano: number; mes: number };
    hoje?: Date;
    /** Default false — o e-mail é do job mensal, não de reprocessos pontuais. */
    enviarEmail?: boolean;
  }): Promise<ResumoSincronizacao> {
    if (this.rodando) {
      throw Object.assign(new Error('Sincronização já em andamento.'), { status: 409 });
    }

    const inicio = Date.now();
    const ref = opts?.mesReferencia ?? mesReferencia(opts?.hoje ?? new Date());
    const { ano, mes } = ref;
    const anoAnterior = ano - 1;

    this.rodando = true;
    this.processados = 0;
    this.total = 0;
    this.bdrefAtual = bdrefDe(ano, mes);
    this.iniciadoEm = inicio;

    const resumo: ResumoSincronizacao = {
      bdref: bdrefDe(ano, mes),
      ano,
      mes,
      total: 0,
      processados: 0,
      semCodigoSci: 0,
      erros: 0,
      mudancas: 0,
      semDados: 0,
      duracaoMs: 0,
    };

    try {
      // Cliente inativo (saiu da carteira) nao e apurado: nao entra na tela,
      // no aviso nem na planilha, e cada consulta ao SCI custa segundos.
      const filtro = opts?.clienteIds?.length
        ? `WHERE ativo = 1 AND id IN (${opts.clienteIds.map(() => '?').join(',')})`
        : 'WHERE ativo = 1';
      const clientes = await executeQuery<any>(
        `SELECT id, razao_social, cnpj_limpo, codigo_sci, uf, porte, abertura, regime_tributario
         FROM clientes ${filtro}
         ORDER BY razao_social ASC`,
        opts?.clienteIds?.length ? opts.clienteIds : []
      );

      const comSocioPJ = await this.clientesComSocioPJ();
      const motivosRevisao = await this.clientesParaRevisar();
      const suprimidas = await this.filiaisSuprimidas();
      const semMatriz = await this.filiaisSemMatriz();

      // Filial cuja matriz está cadastrada nem chega a ser consultada: o número
      // da matriz já é o da PJ inteira, e cada consulta ao SCI custa segundos.
      const clientesApuraveis = clientes.filter((c: any) => !suprimidas.has(c.id));

      resumo.total = clientesApuraveis.length;
      this.total = clientesApuraveis.length;

      for (const c of clientesApuraveis) {
        this.processados++;
        resumo.processados++;

        const cliente: ClienteCota = {
          id: c.id,
          razao_social: c.razao_social,
          cnpj: c.cnpj_limpo,
          codigo_sci: numeroOuNull(c.codigo_sci),
          uf: c.uf ?? null,
          porte_declarado: c.porte ?? null,
          abertura: dataParaIso(c.abertura),
        };

        // `codigo_sci` é VARCHAR e vem vazio / com espaço / não numérico.
        const codigoSci = cliente.codigo_sci;
        if (!codigoSci || Number.isNaN(codigoSci)) {
          resumo.semCodigoSci++;
          continue;
        }

        try {
          const porBdref = await this.coletarDoSci(codigoSci, anoAnterior, ano, mes);
          await this.persistirFaturamento(cliente.id, codigoSci, porBdref);

          const mesesAnterior = await this.lerMeses(cliente.id, anoAnterior);
          const mesesCorrente = await this.lerMeses(cliente.id, ano);

          // RBAA só existe se o ano anterior estiver completo. Ano anterior
          // pela metade não é "receita baixa" — é receita desconhecida.
          const rbaaCentavos =
            mesesAnterior.length === 12
              ? mesesAnterior.reduce((s, m) => s + m.centavos, 0)
              : null;

          const inicioAtividade =
            cliente.abertura !== null && Number(cliente.abertura.slice(0, 4)) === ano;

          const resultado = classificar({
            ano,
            rbaaCentavos,
            mesesAnoCorrente: mesesCorrente,
            ateMes: mes,
            impedimentoSuspeita: comSocioPJ.has(cliente.id),
            inicioAtividade,
          });

          const anterior = await this.lerClassificacaoAnterior(cliente.id, ano, mes);
          const anteriorComoResultado = anterior
            ? ({
                ...resultado,
                porte: anterior.porte,
                excedeTetoEpp: anterior.excedeTetoEpp,
                excedeTetoMe: anterior.excedeTetoMe,
              } as ResultadoClassificacao)
            : null;

          const eventos = detectarEventos(anteriorComoResultado, resultado);
          const mudou = eventos.some(
            (e) => e.tipo === 'VIRADA_PORTE' || e.tipo === 'REGRESSAO'
          );

          // Motivos de revisão: os do quadro societário mais os que a própria
          // classificação levantou.
          const motivos = new Set(motivosRevisao.get(cliente.id) ?? []);
          if (inicioAtividade) motivos.add('INICIO_ATIVIDADE');
          // O teto do Simples é o mesmo teto de EPP, então cadastro e
          // faturamento estão falando do mesmo fato — e discordaram.
          if (
            divergenciaComSimples({
              regimeTributario: c.regime_tributario,
              rbaCentavos: resultado.rbaCentavos,
            })
          ) {
            motivos.add('SIMPLES_ACIMA_TETO');
          }
          // Zero do SCI pode ser ausência de dado, e RBAA zerada classifica a
          // empresa como ME — isto é, isenta — a partir dela.
          const zerada = receitaZeradaSuspeita({
            ano,
            aberturaIso: cliente.abertura,
            rbaaCentavos,
            rbaCentavos: resultado.rbaCentavos,
            mesesFaltantes: resultado.mesesFaltantes,
          });
          if (zerada.anoAnterior) motivos.add('RECEITA_ZERADA_ANTERIOR');
          if (zerada.anoCorrente) motivos.add('RECEITA_ZERADA_CORRENTE');
          if (zerada.semFaturamento) motivos.add('SEM_FATURAMENTO_SCI');
          if (semMatriz.has(cliente.id)) motivos.add('MATRIZ_NAO_CADASTRADA');

          await this.persistirClassificacao(
            cliente,
            ano,
            mes,
            resultado,
            rbaaCentavos,
            anterior?.porte ?? null,
            mudou,
            comSocioPJ.has(cliente.id),
            inicioAtividade,
            [...motivos]
          );

          if (mudou) resumo.mudancas++;
          if (resultado.porte === 'SEM_DADOS') resumo.semDados++;
        } catch (err: any) {
          resumo.erros++;
          console.error(
            `[Cota Aprendizagem] Erro no cliente ${cliente.razao_social} (SCI ${codigoSci}):`,
            err?.message || err
          );
          // Continua nos demais — um cliente com erro no SCI não pode derrubar
          // a apuração inteira.
        }
      }

      resumo.duracaoMs = Date.now() - inicio;
      this.ultimoResumo = resumo;
      console.log(
        `[Cota Aprendizagem] Competência ${resumo.bdref} — motor ${MOTOR_VERSAO}: ` +
          `${resumo.processados}/${resumo.total} processados, ${resumo.mudancas} mudança(s), ` +
          `${resumo.semDados} sem dados, ${resumo.semCodigoSci} sem código SCI, ${resumo.erros} erro(s).`
      );

      if (opts?.enviarEmail) {
        // Falha de e-mail não invalida a apuração, que já está gravada.
        try {
          const envios = await this.enviarResumoMensal({ bdref: resumo.bdref });
          for (const r of envios.filter((e) => !e.enviado)) {
            console.log(`[Cota Aprendizagem] Aviso ${r.tipo} não enviado: ${r.motivo}`);
          }
        } catch (err: any) {
          console.error('[Cota Aprendizagem] Erro ao enviar o resumo:', err?.message || err);
        }
      }

      return resumo;
    } finally {
      this.rodando = false;
    }
  }

  /**
   * Reclassifica a competência SEM consultar o SCI.
   *
   * A apuração tem duas etapas de custo muito diferente: buscar o faturamento
   * no SCI (lenta, serializada pelo lock, minutos para a base inteira) e
   * aplicar as regras sobre ele (instantânea, tudo em MySQL). Quem edita o
   * cadastro — regime tributário, quadro societário, data de abertura — só
   * precisa da SEGUNDA. Rodar a coleta inteira para isso era pagar meia hora de
   * SCI por uma mudança que não tem nada a ver com faturamento.
   *
   * Vale também quando a REGRA muda: uma competência já coletada volta a ficar
   * correta em segundos, sem tocar no SCI.
   *
   * Só reprocessa quem JÁ tem linha na competência. Cliente nunca apurado
   * continua fora: sem faturamento coletado, classificá-lo produziria
   * "SEM_DADOS" e inventaria um registro que ninguém pediu.
   */
  async reclassificar(opts?: {
    bdref?: number;
    clienteIds?: string[];
  }): Promise<ResumoReclassificacao> {
    if (this.rodando) {
      throw Object.assign(new Error('Há uma sincronização com o SCI em andamento.'), {
        status: 409,
      });
    }
    if (this.reclassificando) {
      throw Object.assign(new Error('Reclassificação já em andamento.'), { status: 409 });
    }

    const inicio = Date.now();
    const alvo =
      opts?.bdref ??
      (
        await executeQuery<{ bdref: number }>(
          `SELECT MAX(bdref) AS bdref FROM cota_classificacao_mensal`
        )
      )[0]?.bdref ??
      null;

    if (!alvo) {
      throw Object.assign(new Error('Nenhuma apuração para reclassificar.'), { status: 404 });
    }

    const bdref = Number(alvo);
    const ano = Math.floor(bdref / 100);
    const mes = bdref % 100;
    const anoAnterior = ano - 1;

    this.reclassificando = true;
    try {
      const filtroCliente = opts?.clienteIds?.length
        ? ` AND cc.cliente_id IN (${opts.clienteIds.map(() => '?').join(',')})`
        : '';
      const clientes = await executeQuery<any>(
        `SELECT c.id, c.razao_social, c.cnpj_limpo, c.codigo_sci, c.uf, c.porte,
                c.abertura, c.regime_tributario
         FROM cota_classificacao_mensal cc
         INNER JOIN clientes c ON c.id = cc.cliente_id
         WHERE cc.bdref = ?${filtroCliente}
           AND c.ativo = 1
           AND NOT (
             UPPER(COALESCE(c.tipo_estabelecimento,'')) = 'FILIAL'
             AND LENGTH(COALESCE(c.cnpj_limpo,'')) = 14
             AND EXISTS (
               SELECT 1 FROM clientes m
               WHERE UPPER(COALESCE(m.tipo_estabelecimento,'')) = 'MATRIZ'
                 AND LENGTH(COALESCE(m.cnpj_limpo,'')) = 14
                 AND LEFT(m.cnpj_limpo, 8) = LEFT(c.cnpj_limpo, 8)
                 AND m.ativo = 1
             )
           )
         ORDER BY c.razao_social ASC`,
        [bdref, ...(opts?.clienteIds ?? [])]
      );

      const ids = clientes.map((c: any) => c.id);
      if (ids.length === 0) {
        return {
          bdref,
          ano,
          mes,
          total: 0,
          mudancas: 0,
          semDados: 0,
          duracaoMs: Date.now() - inicio,
        };
      }

      // Em lote, não por cliente: com 200+ clientes, duas consultas resolvem o
      // que seriam 600 idas ao banco.
      const ph = ids.map(() => '?').join(',');
      const faturamento = await executeQuery<any>(
        `SELECT cliente_id, ano, mes, faturamento
         FROM cota_faturamento_mensal
         WHERE cliente_id IN (${ph}) AND ano IN (?, ?)`,
        [...ids, anoAnterior, ano]
      );
      const porClienteAno = new Map<string, MesReceita[]>();
      for (const f of faturamento) {
        const chave = `${f.cliente_id}:${f.ano}`;
        if (!porClienteAno.has(chave)) porClienteAno.set(chave, []);
        porClienteAno.get(chave)!.push({
          mes: Number(f.mes),
          centavos: parseValorParaCentavos(f.faturamento),
        });
      }

      const ant = competenciaAnterior(ano, mes);
      const anteriores = await executeQuery<any>(
        `SELECT cliente_id, porte, excede_teto_epp, excede_teto_me
         FROM cota_classificacao_mensal
         WHERE ano = ? AND mes = ? AND cliente_id IN (${ph})`,
        [ant.ano, ant.mes, ...ids]
      );
      const porClienteAnterior = new Map<string, any>(
        anteriores.map((a: any) => [a.cliente_id, a])
      );

      const comSocioPJ = await this.clientesComSocioPJ();
      const motivosRevisao = await this.clientesParaRevisar();
      const semMatriz = await this.filiaisSemMatriz();

      const resumo: ResumoReclassificacao = {
        bdref,
        ano,
        mes,
        total: clientes.length,
        mudancas: 0,
        semDados: 0,
        duracaoMs: 0,
      };

      for (const c of clientes) {
        const cliente: ClienteCota = {
          id: c.id,
          razao_social: c.razao_social,
          cnpj: c.cnpj_limpo,
          codigo_sci: numeroOuNull(c.codigo_sci),
          uf: c.uf ?? null,
          porte_declarado: c.porte ?? null,
          abertura: dataParaIso(c.abertura),
        };

        const mesesAnterior = porClienteAno.get(`${c.id}:${anoAnterior}`) ?? [];
        const mesesCorrente = porClienteAno.get(`${c.id}:${ano}`) ?? [];

        // Mesma regra da coleta: ano anterior incompleto não é receita baixa,
        // é receita desconhecida.
        const rbaaCentavos =
          mesesAnterior.length === 12
            ? mesesAnterior.reduce((s, m) => s + m.centavos, 0)
            : null;

        const inicioAtividade =
          cliente.abertura !== null && Number(cliente.abertura.slice(0, 4)) === ano;

        const resultado = classificar({
          ano,
          rbaaCentavos,
          mesesAnoCorrente: mesesCorrente,
          ateMes: mes,
          impedimentoSuspeita: comSocioPJ.has(cliente.id),
          inicioAtividade,
        });

        const anterior = porClienteAnterior.get(cliente.id);
        const anteriorComoResultado = anterior
          ? ({
              ...resultado,
              porte: anterior.porte as Porte,
              excedeTetoEpp: Number(anterior.excede_teto_epp) === 1,
              excedeTetoMe: Number(anterior.excede_teto_me) === 1,
            } as ResultadoClassificacao)
          : null;

        const eventos = detectarEventos(anteriorComoResultado, resultado);
        const mudou = eventos.some((e) => e.tipo === 'VIRADA_PORTE' || e.tipo === 'REGRESSAO');

        const motivos = new Set(motivosRevisao.get(cliente.id) ?? []);
        if (inicioAtividade) motivos.add('INICIO_ATIVIDADE');
        if (
          divergenciaComSimples({
            regimeTributario: c.regime_tributario,
            rbaCentavos: resultado.rbaCentavos,
          })
        ) {
          motivos.add('SIMPLES_ACIMA_TETO');
        }
        const zerada = receitaZeradaSuspeita({
          ano,
          aberturaIso: cliente.abertura,
          rbaaCentavos,
          rbaCentavos: resultado.rbaCentavos,
          mesesFaltantes: resultado.mesesFaltantes,
        });
        if (zerada.anoAnterior) motivos.add('RECEITA_ZERADA_ANTERIOR');
        if (zerada.anoCorrente) motivos.add('RECEITA_ZERADA_CORRENTE');
          if (zerada.semFaturamento) motivos.add('SEM_FATURAMENTO_SCI');
          if (semMatriz.has(cliente.id)) motivos.add('MATRIZ_NAO_CADASTRADA');

        await this.persistirClassificacao(
          cliente,
          ano,
          mes,
          resultado,
          rbaaCentavos,
          (anterior?.porte as Porte) ?? null,
          mudou,
          comSocioPJ.has(cliente.id),
          inicioAtividade,
          [...motivos]
        );

        if (mudou) resumo.mudancas++;
        if (resultado.porte === 'SEM_DADOS') resumo.semDados++;
      }

      resumo.duracaoMs = Date.now() - inicio;
      console.log(
        `[Cota Aprendizagem] Reclassificação de ${bdref} — motor ${MOTOR_VERSAO}: ` +
          `${resumo.total} cliente(s) em ${resumo.duracaoMs}ms, ${resumo.mudancas} mudança(s).`
      );
      return resumo;
    } finally {
      this.reclassificando = false;
    }
  }

  /** Lista a classificação de uma competência (default: a mais recente). */
  async classificacao(bdref?: number): Promise<{
    bdref: number | null;
    clientes: LinhaClassificacao[];
    resumo: {
      total: number;
      sujeitas: number;
      isentas: number;
      semDados: number;
      mudancas: number;
      projecoes: number;
      revisarJuridico: number;
    };
  }> {
    const alvo =
      bdref ??
      (
        await executeQuery<{ bdref: number }>(
          `SELECT MAX(bdref) AS bdref FROM cota_classificacao_mensal`
        )
      )[0]?.bdref ??
      null;

    if (!alvo) {
      return {
        bdref: null,
        clientes: [],
        resumo: {
          total: 0,
          sujeitas: 0,
          isentas: 0,
          semDados: 0,
          mudancas: 0,
          projecoes: 0,
          revisarJuridico: 0,
        },
      };
    }

    // Cliente inativo e filial suprimida saem também na LEITURA, e não só na
    // apuração: as
    // linhas gravadas antes desta regra continuam no histórico (a tabela é
    // UPSERT e nunca apaga), e sem isto elas voltariam a aparecer duplicando a
    // PJ na tela, no e-mail e na planilha.
    const rows = await executeQuery<any>(
      `SELECT cc.*, c.razao_social, c.cnpj_limpo, c.codigo_sci, c.uf, c.porte AS porte_declarado,
              c.abertura, c.natureza_juridica, c.atividade_principal_code,
              c.atividade_principal_text
       FROM cota_classificacao_mensal cc
       INNER JOIN clientes c ON c.id = cc.cliente_id
       WHERE cc.bdref = ?
         AND c.ativo = 1
         AND NOT (
           UPPER(COALESCE(c.tipo_estabelecimento,'')) = 'FILIAL'
           AND LENGTH(COALESCE(c.cnpj_limpo,'')) = 14
           AND EXISTS (
             SELECT 1 FROM clientes m
             WHERE UPPER(COALESCE(m.tipo_estabelecimento,'')) = 'MATRIZ'
               AND LENGTH(COALESCE(m.cnpj_limpo,'')) = 14
               AND LEFT(m.cnpj_limpo, 8) = LEFT(c.cnpj_limpo, 8)
               AND m.ativo = 1
           )
         )
       ORDER BY cc.mudou DESC, cc.sujeita_cota DESC, c.razao_social ASC`,
      [alvo]
    );

    const clientes: LinhaClassificacao[] = rows.map((r) => ({
      id: r.cliente_id,
      razao_social: r.razao_social,
      cnpj: r.cnpj_limpo,
      codigo_sci: numeroOuNull(r.codigo_sci),
      uf: r.uf ?? null,
      porte_declarado: r.porte_declarado ?? null,
      abertura: dataParaIso(r.abertura),
      sociedade_advogados: ehSociedadeDeAdvogados({
        naturezaJuridica: r.natureza_juridica,
        atividadePrincipalCodigo: r.atividade_principal_code,
        atividadePrincipalTexto: r.atividade_principal_text,
      }),
      ano: Number(r.ano),
      mes: Number(r.mes),
      bdref: Number(r.bdref),
      rbaa: numeroOuNull(r.rbaa),
      rba: numeroOuNull(r.rba),
      porte: r.porte as Porte,
      porte_base: r.porte_base as Porte,
      motivo: r.motivo,
      sujeita_cota: r.sujeita_cota === null ? null : Number(r.sujeita_cota) === 1,
      excede_teto_epp: Number(r.excede_teto_epp) === 1,
      excede_teto_me: Number(r.excede_teto_me) === 1,
      mes_excesso_limite: numeroOuNull(r.mes_excesso_limite),
      mes_excesso_20pct: numeroOuNull(r.mes_excesso_20pct),
      data_efeito: dataParaIso(r.data_efeito),
      meses_faltantes: Number(r.meses_faltantes) || 0,
      meses_faltantes_lista: r.meses_faltantes_lista ?? null,
      dado_confiavel: Number(r.dado_confiavel) === 1,
      impedimento_societario: Number(r.impedimento_societario) === 1,
      inicio_atividade: Number(r.inicio_atividade) === 1,
      revisar_juridico: Number(r.revisar_juridico) === 1,
      revisar_motivos: r.revisar_motivos
        ? String(r.revisar_motivos).split(',').filter(Boolean)
        : [],
      porte_anterior: (r.porte_anterior as Porte) ?? null,
      mudou: Number(r.mudou) === 1,
      eventos: [],
      diagnostico: diagnosticarDaLinha(r),
    }));

    return {
      bdref: Number(alvo),
      clientes,
      resumo: {
        total: clientes.length,
        sujeitas: clientes.filter((c) => c.sujeita_cota === true).length,
        isentas: clientes.filter((c) => c.sujeita_cota === false).length,
        semDados: clientes.filter((c) => c.porte === 'SEM_DADOS').length,
        mudancas: clientes.filter((c) => c.mudou).length,
        projecoes: clientes.filter((c) => c.excede_teto_epp || c.excede_teto_me).length,
        revisarJuridico: clientes.filter((c) => c.revisar_juridico).length,
      },
    };
  }

  /**
   * Envia o resumo mensal, uma vez por competência.
   *
   * A reserva no `cota_aviso_log` é feita ANTES do envio, via INSERT IGNORE
   * sobre o UNIQUE(bdref). Duas razões:
   *
   *  - O guard `isRunning` é memória e não sobrevive a um restart no minuto do
   *    disparo; quem realmente impede o e-mail duplicado é o índice único.
   *  - Reservando antes, o pior caso é "não enviou" — visível na tela e
   *    corrigível com `forcar`. Reservando depois, o pior caso seria a
   *    diretoria receber o mesmo aviso duas vezes.
   *
   * Se o envio falhar, a reserva é desfeita para permitir nova tentativa.
   */
  async enviarResumoMensal(opts?: {
    bdref?: number;
    destinatarios?: string[];
    forcar?: boolean;
    /** Só um dos avisos. Sem isso, manda os dois. */
    tipo?: TipoAviso;
  }): Promise<ResultadoEnvio[]> {
    const alvos = opts?.tipo ? [opts.tipo] : (['ENQUADRAMENTO', 'COTA'] as TipoAviso[]);

    const dados = await this.classificacao(opts?.bdref);
    if (!dados.bdref) {
      return alvos.map((tipo) => ({
        tipo,
        enviado: false,
        motivo: 'sem_apuracao',
        bdref: null,
        destinatarios: destinatariosDe(tipo, opts?.destinatarios),
      }));
    }

    const bdref = dados.bdref;
    const ano = Math.floor(bdref / 100);
    const mes = bdref % 100;

    const secoes = separarSecoes(dados.clientes);
    const totais = calcularTotalizadores(
      dados.clientes,
      secoes,
      this.ultimoResumo?.semCodigoSci ?? 0
    );

    const resultados: ResultadoEnvio[] = [];
    // Sequencial, e um `try` por aviso: falha de um não pode impedir o outro
    // de sair — são públicos diferentes, e o Fiscal não deve ficar sem o dele
    // porque o endereço do DP quicou.
    for (const tipo of alvos) {
      const destinatarios = destinatariosDe(tipo, opts?.destinatarios);
      try {
        resultados.push(
          await this.enviarAviso({
            tipo,
            bdref,
            ano,
            mes,
            secoes,
            totais,
            destinatarios,
            resumo: dados.resumo,
            forcar: opts?.forcar === true,
          })
        );
      } catch (err: any) {
        console.error(
          `[Cota Aprendizagem] Falha no aviso ${tipo} de ${bdref}:`,
          err?.message || err
        );
        resultados.push({
          tipo,
          enviado: false,
          motivo: 'erro_envio',
          bdref,
          destinatarios,
          erro: err?.message || String(err),
        });
      }
    }
    return resultados;
  }

  /**
   * Um aviso, com reserva própria.
   *
   * A reserva no `cota_aviso_log` é por (bdref, TIPO) — migration 040. Antes a
   * chave era só `bdref`, o que agora barraria o segundo e-mail da competência.
   */
  private async enviarAviso(input: {
    tipo: TipoAviso;
    bdref: number;
    ano: number;
    mes: number;
    secoes: ReturnType<typeof separarSecoes>;
    totais: ReturnType<typeof calcularTotalizadores>;
    destinatarios: string[];
    resumo: { total: number; mudancas: number; projecoes: number; semDados: number };
    forcar: boolean;
  }): Promise<ResultadoEnvio> {
    const { tipo, bdref, ano, mes, secoes, totais, destinatarios, resumo, forcar } = input;

    if (destinatarios.length === 0) {
      return { tipo, enviado: false, motivo: 'sem_destinatario', bdref, destinatarios };
    }

    if (!forcar) {
      const [res]: any = await mysqlPool.query(
        `INSERT IGNORE INTO cota_aviso_log
           (bdref, tipo, total_avaliados, total_mudancas, total_alertas, total_sem_dados, destinatarios)
         VALUES (?,?,?,?,?,?,?)`,
        [
          bdref,
          tipo,
          resumo.total,
          resumo.mudancas,
          resumo.projecoes,
          resumo.semDados,
          destinatarios.join(','),
        ]
      );
      if (!res?.affectedRows) {
        return { tipo, enviado: false, motivo: 'ja_enviado', bdref, destinatarios };
      }
    }

    const entrada = { ano, mes, secoes, totais };
    // O contador do assunto é do que EXIGE atenção — e isso difere por público:
    // o Fiscal conta transições de porte (inclusive ME→EPP); o DP conta
    // entradas e saídas da obrigação, onde ME→EPP não muda nada.
    const config =
      tipo === 'ENQUADRAMENTO'
        ? {
            titulo: TITULO_ENQUADRAMENTO,
            html: montarHtmlEnquadramento(entrada),
            destaque:
              secoes.viraramDemais.length +
              secoes.suscetiveis.length +
              secoes.projecaoDemais.length +
              secoes.projecaoEpp.length,
          }
        : {
            titulo: TITULO_COTA,
            html: montarHtmlCota(entrada),
            destaque:
              secoes.viraramDemais.length +
              secoes.suscetiveis.length +
              secoes.projecaoDemais.length +
              secoes.regressoes.length,
          };

    try {
      await EmailService.sendEmail({
        to: destinatarios.join(','),
        subject: EmailService.montarAssunto(
          `${config.titulo} — ${labelCompetencia(ano, mes)}`,
          config.destaque
        ),
        html: config.html,
      });
    } catch (err) {
      // Desfaz a reserva DESTE tipo para que uma nova tentativa possa enviar.
      if (!forcar) {
        await mysqlPool.query(`DELETE FROM cota_aviso_log WHERE bdref = ? AND tipo = ?`, [
          bdref,
          tipo,
        ]);
      }
      throw err;
    }

    console.log(
      `[Cota Aprendizagem] Aviso ${tipo} de ${bdref} enviado para ${destinatarios.join(', ')}.`
    );
    return { tipo, enviado: true, bdref, destinatarios };
  }

  /**
   * Histórico mês a mês de um cliente.
   *
   * Por padrão devolve só a janela que a regra usa: o ano CORRENTE (RBA) e o
   * ANTERIOR fechado (RBAA). São esses dois que definem o enquadramento — anos
   * mais antigos podem existir no banco (a gravação é UPSERT e nunca apaga, e
   * uma apuração retroativa manual deixa rastro) mas só confundiriam a leitura.
   *
   * Passando `ano`, devolve aquele ano específico; passando `todos`, devolve
   * tudo o que houver coletado.
   */
  async historico(clienteId: string, ano?: number, todos = false) {
    const clientes = await executeQuery<any>(
      `SELECT id, razao_social, cnpj_limpo, codigo_sci, porte AS porte_declarado
       FROM clientes WHERE id = ? LIMIT 1`,
      [clienteId]
    );
    const cliente = clientes[0];
    if (!cliente) {
      throw Object.assign(new Error('Cliente não encontrado.'), { status: 404 });
    }

    let filtroAno = '';
    let params: any[] = [clienteId];

    if (ano) {
      filtroAno = 'AND ano = ?';
      params = [clienteId, ano];
    } else if (!todos) {
      // Janela padrão: ano corrente da última apuração + o anterior.
      const ultima = await executeQuery<{ bdref: number }>(
        `SELECT MAX(bdref) AS bdref FROM cota_classificacao_mensal WHERE cliente_id = ?`,
        [clienteId]
      );
      const bdrefUltimo = ultima[0]?.bdref;
      const anoRef = bdrefUltimo
        ? Math.floor(Number(bdrefUltimo) / 100)
        : mesReferencia(new Date()).ano;
      filtroAno = 'AND ano >= ?';
      params = [clienteId, anoRef - 1];
    }

    const faturamento = await executeQuery<any>(
      `SELECT ano, mes, bdref, faturamento, base_receita, consultado_em
       FROM cota_faturamento_mensal
       WHERE cliente_id = ? ${filtroAno}
       ORDER BY ano DESC, mes ASC`,
      params
    );

    const classificacoes = await executeQuery<any>(
      `SELECT ano, mes, bdref, rbaa, rba, porte, porte_base, motivo, sujeita_cota,
              excede_teto_epp, excede_teto_me, data_efeito, meses_faltantes,
              dado_confiavel, porte_anterior, mudou, calculado_em
       FROM cota_classificacao_mensal
       WHERE cliente_id = ? ${filtroAno}
       ORDER BY ano DESC, mes DESC`,
      params
    );

    return {
      cliente: {
        id: cliente.id,
        razao_social: cliente.razao_social,
        cnpj: cliente.cnpj_limpo,
        codigo_sci: numeroOuNull(cliente.codigo_sci),
        porte_declarado: cliente.porte_declarado ?? null,
      },
      faturamento: faturamento.map((f) => ({
        ano: Number(f.ano),
        mes: Number(f.mes),
        bdref: Number(f.bdref),
        faturamento: numeroOuNull(f.faturamento) ?? 0,
        base_receita: f.base_receita,
        consultado_em: f.consultado_em,
      })),
      classificacoes: classificacoes.map((c) => ({
        ano: Number(c.ano),
        mes: Number(c.mes),
        bdref: Number(c.bdref),
        rbaa: numeroOuNull(c.rbaa),
        rba: numeroOuNull(c.rba),
        porte: c.porte as Porte,
        porte_base: c.porte_base as Porte,
        motivo: c.motivo,
        sujeita_cota: c.sujeita_cota === null ? null : Number(c.sujeita_cota) === 1,
        excede_teto_epp: Number(c.excede_teto_epp) === 1,
        excede_teto_me: Number(c.excede_teto_me) === 1,
        data_efeito: dataParaIso(c.data_efeito),
        meses_faltantes: Number(c.meses_faltantes) || 0,
        dado_confiavel: Number(c.dado_confiavel) === 1,
        porte_anterior: (c.porte_anterior as Porte) ?? null,
        mudou: Number(c.mudou) === 1,
        calculado_em: c.calculado_em,
      })),
    };
  }
}

// Singleton: o estado de progresso (`rodando`, `processados`) é do processo.
export const cotaAprendizagemService = new CotaAprendizagemService();
export default cotaAprendizagemService;

/**
 * SubstitutoService — Conferência de faturamento do grupo SUBSTITUTO.
 *
 * Regra de negócio: clientes com o benefício SUBSTITUTO devem ter faturamento
 * MENSAL de cada estabelecimento acima de R$ 300.000,00. Este serviço monta,
 * para cada cliente do grupo, os ÚLTIMOS 12 MESES de faturamento por
 * estabelecimento (matriz/filial separados), sinalizando os meses abaixo do
 * limite. Os dados vêm do cache já persistido em `irpf_faturamento_detalhado`
 * (não consulta o SCI/Firebird — meses ausentes viram "sem dados").
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { executeQuery, mysqlPool } from '../config/mysql';
import EmailService from './EmailService';
import { comLockSci } from './sciLock';
import {
  C,
  esc,
  formatCnpj,
  moldura,
  painelTotais,
  secao,
  itemLista,
  blocoVazio,
} from './email.layout';

const execAsync = promisify(exec);

export const THRESHOLD_MENSAL = Number(process.env['SUBSTITUTO_THRESHOLD'] || 300000);

// Parâmetros da SP_BI_FAT(EMPRESA, PLANO, QUADRO, DATA_INI, DATA_FIM, SOMAMATRIZFILIAL):
// PLANO=2, QUADRO=1 (consolidada), SOMAMATRIZFILIAL=0 (SEPARA matriz e filial —
// cada estabelecimento é analisado contra o limite). Datas em 'YYYY-MM-DD'
// (formato aceito pelo Firebird neste ambiente, confirmado em uso).
const SP_PLANO = 2;
const SP_QUADRO = 1;
const SP_SOMA_MATRIZ_FILIAL = 0;
const SCI_TIMEOUT_MS = 150000;

// Serializa as chamadas ao SCI: no máximo UMA SP_BI_FAT ativa por vez em todo o
// processo — cautela para não sobrecarregar/travar a procedure no Firebird.
// A cadeia mora em `sciLock` para ser compartilhada com os outros serviços que
// consultam o SCI; uma cadeia por serviço deixaria as consultas concorrentes.

function ultimoDiaDoMes(ano: number, mes: number): string {
  const dia = new Date(ano, mes, 0).getDate(); // mes 1-based → dia 0 do próximo = último do mês
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

// ── Preparado para a FASE DE E-MAIL (NÃO usado agora) ──
// Quando ativar: montar HTML com os dados do cliente + faturamento do(s) mês(es)
// abaixo e chamar EmailService.sendEmail para estes destinatários; deduplicar
// via tabela de alertas (cliente_id, bdref) e plugar um job mensal (padrão
// IrpfScheduler). NADA é enviado nesta fase.
export const SUBSTITUTO_ALERT_RECIPIENTS = (process.env['SUBSTITUTO_ALERT_EMAILS']
  || 'fiscal@central-rnc.com.br,leg@central-rnc.com.br')
  .split(',').map(s => s.trim()).filter(Boolean);

export interface SubstitutoMes {
  ano: number;
  mes: number;
  bdref: number;
  faturamento: number | null;
  abaixo: boolean;
  semDados: boolean;
}

export interface SubstitutoEstabelecimento {
  codigo_empresa: number;
  rotulo: string;
  meses: SubstitutoMes[];
  temAlgumAbaixo: boolean;
  mesesSemDados: number;
  status: StatusSubstituto;
}

export interface SubstitutoCliente {
  id: string;
  razao_social: string;
  cnpj: string;
  codigo_sci: number | null;
  estabelecimentos: SubstitutoEstabelecimento[];
  /** Mantido para compatibilidade; a decisão da tela e do e-mail é o `status`. */
  temAlgumAbaixo: boolean;
  status: StatusSubstituto;
  aoVivo?: boolean; // true = dados reais persistidos do SCI; false/ausente = prévia do cache
  /** Quando o SCI foi consultado por último para este cliente (ISO), ou null. */
  coletadoEm?: string | null;
}

function rotuloEstabelecimento(cod: number): string {
  if (cod === 1) return 'Matriz';
  if (cod === 2) return 'Filial';
  return `Empresa ${cod}`;
}

/**
 * Janela móvel dos últimos 12 meses COMPLETOS (do mês anterior ao atual, 12
 * meses para trás). Retorna do mais antigo ao mais recente.
 */
export function construirJanela(hoje: Date): { ano: number; mes: number; bdref: number }[] {
  // A data entra por PARÂMETRO, e não por `new Date()` aqui dentro: é isso que
  // permite testar a virada de ano e — o que mais importa nesta regra — o que
  // acontece com uma coleta antiga quando a janela desliza por cima dela.
  // now.getMonth() é 0-based (0=Jan). O mês atual em 1-based é getMonth()+1, então
  // getMonth() já representa o MÊS ANTERIOR em 1-based (exceto janeiro).
  let ano = hoje.getFullYear();
  let mes = hoje.getMonth();
  if (mes === 0) { mes = 12; ano -= 1; } // janeiro → dezembro do ano anterior
  const janela: { ano: number; mes: number; bdref: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    let mm = mes - i;
    let yy = ano;
    while (mm <= 0) { mm += 12; yy -= 1; }
    janela.push({ ano: yy, mes: mm, bdref: yy * 100 + mm });
  }
  return janela;
}

// Cria a tabela de persistência do REOA (dados reais puxados do SCI) sob demanda.
let reoaTableReady = false;
async function ensureReoaTable(): Promise<void> {
  if (reoaTableReady) return;
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS reoa_faturamento (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      cliente_id VARCHAR(36) NOT NULL,
      codigo_empresa INT NOT NULL,
      ano INT NOT NULL,
      mes INT NOT NULL,
      bdref INT NOT NULL,
      faturamento DECIMAL(15,2) NOT NULL DEFAULT 0,
      consultado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      coletado_em TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_reoa_cli_emp_ano_mes (cliente_id, codigo_empresa, ano, mes),
      INDEX idx_reoa_cliente (cliente_id),
      INDEX idx_reoa_bdref (bdref)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  /*
   * `coletado_em` chegou depois da tabela, então a criação acima não basta:
   * bases que já existiam precisam do ALTER. O MySQL não tem
   * "ADD COLUMN IF NOT EXISTS", daí a consulta ao information_schema.
   *
   * Por que uma coluna nova em vez de reaproveitar `consultado_em`: aquela tem
   * ON UPDATE CURRENT_TIMESTAMP, que o MySQL só dispara quando a linha MUDA de
   * valor. Em mês fechado — a maioria — re-puxar do SCI grava o mesmo número, a
   * linha não muda e o carimbo não anda. Ou seja, `consultado_em` responde
   * "quando este valor mudou pela última vez", não "quando foi conferido", e é
   * a segunda pergunta que a tela precisa fazer. Esta é gravada à mão em toda
   * coleta, mudando o valor ou não.
   */
  const [col] = (await mysqlPool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reoa_faturamento'
       AND COLUMN_NAME = 'coletado_em' LIMIT 1`
  )) as any[];
  if (!col || col.length === 0) {
    await executeQuery(
      `ALTER TABLE reoa_faturamento ADD COLUMN coletado_em TIMESTAMP NULL DEFAULT NULL`
    );
    /*
     * Backfill: as linhas que já existiam FORAM coletadas, só não havia onde
     * anotar. Para elas `consultado_em` é confiável — sem UPDATE posterior, o
     * ON UPDATE nunca disparou, então o valor ainda é o do INSERT, que é a hora
     * da coleta. Deixá-las em NULL faria a tela dizer "nunca coletado" de
     * cliente que foi conferido, que é uma mentira pior do que a data aproximada.
     */
    await executeQuery(
      `UPDATE reoa_faturamento SET coletado_em = consultado_em WHERE coletado_em IS NULL`
    );
  }

  reoaTableReady = true;
}

/**
 * Status de um estabelecimento (ou do cliente, pelo pior deles).
 *
 * O booleano que existia aqui — `temAlgumAbaixo` — só sabia dizer "tem mês
 * abaixo" e "não tem", e as duas respostas negativas não são a mesma coisa:
 * doze meses conferidos e acima do limite é conformidade; doze meses vazios é
 * ausência de conferência. Como a janela é calculada pelo relógio e os dados só
 * entram quando alguém puxa, a segunda vira a primeira sozinha com o tempo — um
 * cliente com doze meses abaixo do limite passava a "ok" no décimo segundo mês
 * sem coleta, não porque faturou, mas porque o último mês real saiu da janela.
 *
 * A assimetria é a mesma do motor da cota de aprendizagem: dado incompleto pode
 * CONFIRMAR o caso ruim, nunca o bom.
 *
 *   algum mês comprovadamente abaixo  → ABAIXO (buraco não desmente o que já se viu)
 *   nenhum abaixo, mas há buraco      → INDETERMINADO (não dá para afirmar nada)
 *   nenhum abaixo, janela completa    → OK
 */
export type StatusSubstituto = 'ABAIXO' | 'OK' | 'INDETERMINADO';

function statusDe(temAlgumAbaixo: boolean, mesesSemDados: number): StatusSubstituto {
  if (temAlgumAbaixo) return 'ABAIXO';
  return mesesSemDados > 0 ? 'INDETERMINADO' : 'OK';
}

/** Monta os estabelecimentos (12 meses cada) a partir de um índice codEmpresa→bdref→valor. */
export function construirEstabelecimentos(
  byCod: Map<number, Map<number, number>> | undefined,
  janela: { ano: number; mes: number; bdref: number }[],
  label: (cod: number) => string,
): {
  estabelecimentos: SubstitutoEstabelecimento[];
  temAlgumAbaixo: boolean;
  status: StatusSubstituto;
} {
  const codigos = byCod && byCod.size > 0 ? Array.from(byCod.keys()).sort((a, b) => a - b) : [1];
  const estabelecimentos = codigos.map(cod => {
    const bref2total = byCod?.get(cod);
    let temAlgumAbaixo = false;
    let mesesSemDados = 0;
    const meses: SubstitutoMes[] = janela.map(j => {
      const fat = bref2total?.get(j.bdref);
      // Sem linha OU R$ 0,00 => "sem dados/pendente" (mês ainda não apurado).
      if (fat === undefined || fat <= 0) {
        mesesSemDados++;
        return { ano: j.ano, mes: j.mes, bdref: j.bdref, faturamento: null, abaixo: false, semDados: true };
      }
      const abaixo = fat < THRESHOLD_MENSAL;
      if (abaixo) temAlgumAbaixo = true;
      return { ano: j.ano, mes: j.mes, bdref: j.bdref, faturamento: fat, abaixo, semDados: false };
    });
    return {
      codigo_empresa: cod,
      rotulo: label(cod),
      meses,
      temAlgumAbaixo,
      mesesSemDados,
      status: statusDe(temAlgumAbaixo, mesesSemDados),
    };
  });
  // O pior estabelecimento define o cliente: o limite é de CADA um, então uma
  // filial abaixo derruba o conjunto, e uma filial sem coleta impede afirmar OK.
  const temAlgum = estabelecimentos.some(e => e.temAlgumAbaixo);
  const status: StatusSubstituto = temAlgum
    ? 'ABAIXO'
    : estabelecimentos.some(e => e.status === 'INDETERMINADO')
      ? 'INDETERMINADO'
      : 'OK';
  return { estabelecimentos, temAlgumAbaixo: temAlgum, status };
}

// ── Helpers de e-mail (aviso REOA) ──
const MESES_SRV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const brlSrv = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const labelMesSrv = (ano: number, mes: number) => `${MESES_SRV[mes - 1]}/${ano}`;
const REOA_PAGE_URL = process.env['REOA_PAGE_URL'] || 'http://192.168.0.47:5173/beneficios?aba=reoa';

export const TITULO_EMAIL_REOA = 'Conferência REOA — Grupo Substituto';

/**
 * HTML do aviso REOA, no padrão visual comum (`email.layout`).
 *
 * Antes este e-mail tinha moldura própria — carmim, Arial, URL em caixa
 * tracejada — e, principalmente, interpolava `razao_social` SEM ESCAPAR: um
 * "&" ou "<" no cadastro bastava para quebrar o corpo da mensagem. Ao passar
 * pelas peças comuns, o escape deixa de depender de alguém lembrar.
 *
 * Exportada (antes era módulo-privada) para poder ser testada sem SMTP.
 */
export function montarHtmlAviso(conf: any, naoOk: any[]): string {
  const j = conf.janela || [];
  const janelaTxt = j.length
    ? `${labelMesSrv(j[0].ano, j[0].mes)} a ${labelMesSrv(j[j.length - 1].ano, j[j.length - 1].mes)}`
    : '';
  const limite = brlSrv.format(conf.threshold ?? 300000);

  // Cada cliente vira uma seção; dentro dela, uma linha por mês abaixo do
  // limite. O mês é o dado que importa — é ele que se leva para a conferência.
  const blocos = naoOk
    .map((c: any) => {
      const abaixo = c.estabelecimentos.flatMap((e: any) =>
        e.meses.filter((m: any) => m.abaixo).map((m: any) => ({ ...m, rotulo: e.rotulo }))
      );
      const itens = abaixo
        .map((m: any, i: number) =>
          itemLista({
            titulo: labelMesSrv(m.ano, m.mes),
            meta: esc(m.rotulo),
            valor: brlSrv.format(m.faturamento || 0),
            cor: C.ALERTA,
            indice: i,
          })
        )
        .join('');
      return secao({
        titulo: esc(c.razao_social),
        // Identificação junto do nome: é ela que se leva para o SCI conferir.
        subtitulo: `CNPJ ${formatCnpj(c.cnpj)}${c.codigo_sci ? ` &middot; SCI ${c.codigo_sci}` : ''}`,
        contagem: abaixo.length,
        cor: C.ALERTA,
        fundo: C.ALERTA_FUNDO,
        itens,
      });
    })
    .join('');

  const totalMeses = naoOk.reduce(
    (s: number, c: any) =>
      s +
      c.estabelecimentos.reduce(
        (t: number, e: any) => t + e.meses.filter((m: any) => m.abaixo).length,
        0
      ),
    0
  );

  return moldura({
    titulo: TITULO_EMAIL_REOA,
    subtitulo: janelaTxt,
    cobertura: `Faturamento mensal abaixo de ${limite}`,
    faixas: painelTotais([
      { valor: naoOk.length, titulo: 'Clientes fora do limite', cor: C.ALERTA },
      { valor: totalMeses, titulo: 'Meses abaixo', detalhe: 'no total', cor: C.ATENCAO },
      { valor: limite, titulo: 'Limite mensal', detalhe: 'por estabelecimento', cor: C.TINTA },
    ]),
    corpo:
      naoOk.length > 0
        ? blocos
        : blocoVazio(
            'Nenhum cliente abaixo do limite.',
            `Todos os estabelecimentos do grupo faturaram acima de ${limite} em ${janelaTxt}.`
          ),
    cta: { url: REOA_PAGE_URL, texto: 'Abrir a conferência' },
    rodape: {
      titulo: 'Conferência REOA',
      texto:
        'Faturamento por estabelecimento, apurado no SCI. Enviado automaticamente; não responda.',
    },
  });
}

export interface ResumoColeta {
  /** Competência de referência (último mês fechado) no formato YYYYMM. */
  bdref: number;
  total: number;
  coletados: number;
  semCodigoSci: number;
  erros: number;
  duracaoMs: number;
  falhas: { id: string; razao_social: string; erro: string }[];
}

export interface EstadoColeta {
  rodando: boolean;
  bdref: number | null;
  total: number;
  processados: number;
  clienteAtual: string | null;
  iniciadoEm: string | null;
  concluidoEm: string | null;
}

/**
 * Estado da coleta em lote, no MÓDULO e não na instância.
 *
 * `BeneficiosController`, `ClienteController` e o scheduler criam cada um o seu
 * `new SubstitutoService()`. Se o flag morasse na instância, dois deles rodando
 * ao mesmo tempo não se enxergariam — e o ponto do flag é justamente impedir
 * duas varreduras concorrentes empilhando chamadas na SP_BI_FAT.
 */
const estadoColeta: EstadoColeta = {
  rodando: false,
  bdref: null,
  total: 0,
  processados: 0,
  clienteAtual: null,
  iniciadoEm: null,
  concluidoEm: null,
};
export class SubstitutoService {
  /**
   * Clientes ativos do grupo SUBSTITUTO — a lista é DINÂMICA, montada a cada
   * chamada a partir de `clientes.beneficios_fiscais`. Empresa que ganha o
   * benefício entra na conferência na requisição seguinte, sem cadastro à parte.
   *
   * O match é por TOKEN e não por LIKE: `beneficios_fiscais` guarda uma lista
   * separada por vírgula ("COMPETE ATACADISTA, SUBSTITUTO"), e a normalização
   * antes do FIND_IN_SET existe porque o campo é digitado à mão e vem com
   * espaço depois da vírgula.
   */
  private async clientesDoGrupo() {
    return executeQuery<{
      id: string; razao_social: string; cnpj_limpo: string; codigo_sci: number | null;
    }>(
      `SELECT id, razao_social, cnpj_limpo, codigo_sci
       FROM clientes
       WHERE ativo = 1
         AND FIND_IN_SET('SUBSTITUTO', REPLACE(REPLACE(UPPER(beneficios_fiscais), ', ', ','), ' ,', ',')) > 0
       ORDER BY razao_social`
    );
  }

  async conferencia() {
    const janela = construirJanela(new Date());
    const startBdref = janela[0].bdref;
    const endBdref = janela[janela.length - 1].bdref;

    const clientes = await this.clientesDoGrupo();

    if (clientes.length === 0) {
      return {
        success: true,
        threshold: THRESHOLD_MENSAL,
        janela,
        clientes: [] as SubstitutoCliente[],
        resumo: { totalClientes: 0, comAlerta: 0, indeterminados: 0, totalEstabelecimentos: 0 },
      };
    }

    const ids = clientes.map(c => c.id);
    await ensureReoaTable();

    // ── Fonte 1 (preferida): dados REAIS já persistidos do SCI (reoa_faturamento) ──
    const [reoaRows] = (await mysqlPool.query(
      `SELECT cliente_id, codigo_empresa, bdref, faturamento
       FROM reoa_faturamento
       WHERE cliente_id IN (?) AND bdref BETWEEN ? AND ?`,
      [ids, startBdref, endBdref]
    )) as any[];

    // ── Fonte 2 (fallback/prévia): cache do IRPF (irpf_faturamento_detalhado) ──
    // Usa mysqlPool.query (só o .query expande arrays no `IN (?)`).
    const [irpfRows] = (await mysqlPool.query(
      `SELECT cliente_id, codigo_empresa, ano, mes, bdref, SUM(faturamento_total) AS total
       FROM irpf_faturamento_detalhado
       WHERE cliente_id IN (?) AND bdref BETWEEN ? AND ?
       GROUP BY cliente_id, codigo_empresa, ano, mes, bdref`,
      [ids, startBdref, endBdref]
    )) as any[];

    const indexar = (rows: any[], valCol: string) => {
      const idx = new Map<string, Map<number, Map<number, number>>>();
      for (const r of rows) {
        const cid = String(r.cliente_id);
        const cod = Number(r.codigo_empresa) || 1;
        const bref = Number(r.bdref);
        const total = Number(r[valCol]) || 0; // DECIMAL volta como string no mysql2
        if (!idx.has(cid)) idx.set(cid, new Map());
        const byCod = idx.get(cid)!;
        if (!byCod.has(cod)) byCod.set(cod, new Map());
        byCod.get(cod)!.set(bref, total);
      }
      return idx;
    };
    const reoaIdx = indexar(reoaRows, 'faturamento');
    const irpfIdx = indexar(irpfRows, 'total');

    // Quando o SCI foi consultado por último, por cliente. Fora da janela de
    // propósito: a pergunta é "há quanto tempo ninguém confere este cliente",
    // e ela não depende de qual competência a coleta trouxe.
    const [coletaRows] = (await mysqlPool.query(
      `SELECT cliente_id, MAX(coletado_em) AS coletado_em
       FROM reoa_faturamento
       WHERE cliente_id IN (?) AND coletado_em IS NOT NULL
       GROUP BY cliente_id`,
      [ids]
    )) as any[];
    const coletaPorCliente = new Map<string, string>(
      (coletaRows as any[])
        .filter(r => r.coletado_em)
        .map(r => [String(r.cliente_id), new Date(r.coletado_em).toISOString()])
    );

    let comAlerta = 0;
    let indeterminados = 0;
    let totalEstabelecimentos = 0;

    const clientesOut: SubstitutoCliente[] = clientes.map(c => {
      // codigo_sci pode vir como string do MySQL — converter para comparar com BDCODEMP.
      const codigoSci = c.codigo_sci != null && String(c.codigo_sci) !== '' ? Number(c.codigo_sci) : null;
      const temReoa = reoaIdx.has(String(c.id));
      const byCod = temReoa ? reoaIdx.get(String(c.id)) : irpfIdx.get(String(c.id));
      // Rótulo: no REOA (Quadro 1) o BDCODEMP é o código SCI; no cache é 1/2.
      const label = temReoa
        ? (cod: number) => (codigoSci && cod === codigoSci ? 'Matriz' : `Filial ${cod}`)
        : rotuloEstabelecimento;

      const { estabelecimentos, temAlgumAbaixo, status } = construirEstabelecimentos(
        byCod, janela, label
      );
      totalEstabelecimentos += estabelecimentos.length;
      if (status === 'ABAIXO') comAlerta++;
      if (status === 'INDETERMINADO') indeterminados++;

      return {
        id: c.id,
        razao_social: c.razao_social,
        cnpj: c.cnpj_limpo,
        codigo_sci: codigoSci,
        estabelecimentos,
        temAlgumAbaixo,
        status,
        aoVivo: temReoa,
        coletadoEm: coletaPorCliente.get(String(c.id)) ?? null,
      };
    });

    return {
      success: true,
      threshold: THRESHOLD_MENSAL,
      janela,
      clientes: clientesOut,
      resumo: {
        totalClientes: clientesOut.length,
        comAlerta,
        // Nem alerta nem conformidade: falta mês na janela para concluir. Sai
        // separado no resumo porque a ação é outra — não é cobrar o cliente, é
        // puxar o SCI.
        indeterminados,
        totalEstabelecimentos,
      },
    };
  }

  /**
   * Consulta AO VIVO no SCI (Firebird) via SP_BI_FAT (QUADRO=1, SOMA=0) para UM
   * cliente — dados mais reais que o cache. Serializada (comLockSci) para não
   * sobrecarregar a procedure. Retorna o mesmo formato de estabelecimentos[] do
   * conferencia(), para o front reaproveitar a renderização.
   */
  async faturamentoAoVivo(clienteId: string) {
    const rows = await executeQuery<{ id: string; razao_social: string; cnpj_limpo: string; codigo_sci: number | null }>(
      `SELECT id, razao_social, cnpj_limpo, codigo_sci FROM clientes WHERE id = ? LIMIT 1`,
      [clienteId]
    );
    const cliente = rows[0];
    if (!cliente) {
      const err: any = new Error('Cliente não encontrado.');
      err.status = 404;
      throw err;
    }
    const codigoSci = Number(cliente.codigo_sci);
    if (!codigoSci) {
      return {
        success: false,
        semCodigoSci: true,
        error: 'Cliente não possui código SCI configurado.',
        cliente: { id: cliente.id, razao_social: cliente.razao_social, cnpj: cliente.cnpj_limpo, codigo_sci: null },
      };
    }

    const janela = construirJanela(new Date());
    const ini = `${janela[0].ano}-${String(janela[0].mes).padStart(2, '0')}-01`;
    const ultimo = janela[janela.length - 1];
    const fim = ultimoDiaDoMes(ultimo.ano, ultimo.mes);

    // QUADRO=1 (consolidada) tem só BDORDEM=1 → SUM(BDVALOR) = faturamento.
    // SOMA=0 separa por estabelecimento (BDCODEMP).
    const sql =
      `SELECT t.BDCODEMP, t.BDREF, SUM(t.BDVALOR) AS FATURAMENTO ` +
      `FROM SP_BI_FAT(${codigoSci}, ${SP_PLANO}, ${SP_QUADRO}, '${ini}', '${fim}', ${SP_SOMA_MATRIZ_FILIAL}) t ` +
      `GROUP BY t.BDCODEMP, t.BDREF ORDER BY t.BDCODEMP, t.BDREF`;

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
    try { parsed = JSON.parse(stdout); } catch { throw new Error('Resposta inválida do SCI.'); }
    if (!parsed?.success) throw new Error(parsed?.error || 'Falha na consulta ao SCI.');

    // BDCODEMP -> BDREF -> faturamento
    const porEstab = new Map<number, Map<number, number>>();
    for (const r of (parsed.rows as any[]) || []) {
      const cod = Number(r[0]) || 0;
      const bref = Number(r[1]);
      const val = Number(r[2]) || 0;
      if (!porEstab.has(cod)) porEstab.set(cod, new Map());
      porEstab.get(cod)!.set(bref, (porEstab.get(cod)!.get(bref) || 0) + val);
    }

    const label = (cod: number) => (cod === codigoSci ? 'Matriz' : `Filial ${cod}`);
    const { estabelecimentos, temAlgumAbaixo, status } = construirEstabelecimentos(
      porEstab, janela, label
    );

    /*
     * Persistência: a coleta SUBSTITUI a janela inteira, não acrescenta a ela.
     *
     * A versão anterior gravava só mês com valor positivo. Como é UPSERT e nada
     * apaga, um mês que o SCI passasse a devolver ZERO — estorno, reprocessa-
     * mento, empresa reclassificada — simplesmente não era escrito, e o valor
     * ANTIGO continuava na tabela. O REOA seguia exibindo um faturamento que o
     * SCI já não confirmava; e como valor alto é justamente o que não gera
     * alerta, o erro caía sempre para o lado silencioso.
     *
     * Agora vão os 12 meses da janela, zeros inclusive: gravado passa a
     * significar "foi isto que o SCI respondeu nesta coleta", que é o que a
     * leitura assume quando trata zero como "sem dados".
     *
     * O DELETE no fim cobre o outro caso da mesma família: estabelecimento que
     * some do retorno (filial encerrada, código trocado) deixaria de ser
     * atualizado e continuaria aparecendo como card com números velhos.
     */
    await ensureReoaTable();

    // Sem NENHUMA linha do SCI não há o que persistir: `construirEstabelecimentos`
    // inventa um estabelecimento de código 1 quando o índice vem vazio, e gravar
    // isso encheria a tabela de zeros de uma empresa que não existe.
    if (porEstab.size > 0) {
      const coletadoEm = new Date();
      const valores: any[][] = [];
      for (const e of estabelecimentos) {
        for (const m of e.meses) {
          valores.push([
            cliente.id, e.codigo_empresa, m.ano, m.mes, m.bdref, m.faturamento ?? 0, coletadoEm,
          ]);
        }
      }
      const ph = valores.map(() => '(?,?,?,?,?,?,?)').join(',');
      await mysqlPool.query(
        `INSERT INTO reoa_faturamento
           (cliente_id, codigo_empresa, ano, mes, bdref, faturamento, coletado_em)
         VALUES ${ph}
         ON DUPLICATE KEY UPDATE
           faturamento = VALUES(faturamento),
           coletado_em = VALUES(coletado_em)`,
        valores.flat()
      );

      const codigos = estabelecimentos.map(e => e.codigo_empresa);
      await mysqlPool.query(
        `DELETE FROM reoa_faturamento
         WHERE cliente_id = ? AND bdref BETWEEN ? AND ?
           AND codigo_empresa NOT IN (?)`,
        [cliente.id, janela[0].bdref, ultimo.bdref, codigos]
      );
    }

    return {
      success: true,
      fonte: 'sci-quadro-1',
      threshold: THRESHOLD_MENSAL,
      janela,
      cliente: {
        id: cliente.id,
        razao_social: cliente.razao_social,
        cnpj: cliente.cnpj_limpo,
        codigo_sci: codigoSci,
        estabelecimentos,
        temAlgumAbaixo,
        status,
        aoVivo: true,
        // Acabou de sair do SCI: o carimbo é agora, e é o mesmo que foi gravado.
        coletadoEm: new Date().toISOString(),
      },
    };
  }

  /**
   * Coleta do SCI TODOS os clientes do grupo, um a um.
   *
   * É a peça que faltava para o REOA parar de depender de alguém abrir card por
   * card. A janela desliza pelo relógio; sem uma coleta que ande junto, o mês
   * novo entra vazio e a conferência vira INDETERMINADO — e, antes do
   * tri-estado, virava um "ok" que ninguém tinha conferido.
   *
   * SEQUENCIAL de propósito, e não em paralelo: cada `faturamentoAoVivo` chama a
   * SP_BI_FAT no Firebird, que já é serializada por `comLockSci`. Disparar seis
   * de uma vez só encheria a fila do lock e deixaria o timeout de 150s correndo
   * contra clientes que ainda nem começaram.
   *
   * Erro em um cliente NÃO derruba a rodada: fica no resumo e a coleta segue.
   * Um SCI que falha para uma empresa é problema daquela empresa; abortar tudo
   * transformaria isso em mais um mês sem coleta para as outras cinco.
   */
  async coletarTodos(): Promise<ResumoColeta> {
    if (estadoColeta.rodando) {
      const e: any = new Error('Já existe uma coleta em andamento.');
      e.status = 409;
      throw e;
    }

    const inicio = Date.now();
    const janela = construirJanela(new Date());
    const bdref = janela[janela.length - 1].bdref;
    const clientes = await this.clientesDoGrupo();

    estadoColeta.rodando = true;
    estadoColeta.bdref = bdref;
    estadoColeta.total = clientes.length;
    estadoColeta.processados = 0;
    estadoColeta.iniciadoEm = new Date().toISOString();

    const resumo: ResumoColeta = {
      bdref,
      total: clientes.length,
      coletados: 0,
      semCodigoSci: 0,
      erros: 0,
      duracaoMs: 0,
      falhas: [],
    };

    try {
      for (const c of clientes) {
        estadoColeta.clienteAtual = c.razao_social;
        try {
          const r: any = await this.faturamentoAoVivo(c.id);
          if (r?.semCodigoSci) resumo.semCodigoSci++;
          else if (r?.success) resumo.coletados++;
        } catch (err: any) {
          resumo.erros++;
          resumo.falhas.push({ id: c.id, razao_social: c.razao_social, erro: err?.message || String(err) });
          console.warn(`[REOA] Coleta falhou para ${c.razao_social}:`, err?.message || err);
        }
        estadoColeta.processados++;
      }
    } finally {
      estadoColeta.rodando = false;
      estadoColeta.clienteAtual = null;
      estadoColeta.concluidoEm = new Date().toISOString();
      resumo.duracaoMs = Date.now() - inicio;
    }

    console.log(
      `[REOA] Coleta ${bdref}: ${resumo.coletados}/${resumo.total} coletado(s), ` +
        `${resumo.semCodigoSci} sem código SCI, ${resumo.erros} erro(s) em ${Math.round(resumo.duracaoMs / 1000)}s.`
    );
    return resumo;
  }

  /** Estado da coleta em lote, para a tela acompanhar sem segurar a requisição. */
  get statusColeta(): EstadoColeta {
    return { ...estadoColeta };
  }
  /**
   * Envia por e-mail a lista dos clientes NÃO OK (com algum mês abaixo do limite),
   * com os faturamentos, link da página e disclaimer. Usa a conferência atual
   * (prefere dados reais persistidos do SCI).
   */
  async enviarAviso(destinatariosInput?: string[]) {
    const conf = await this.conferencia();
    const naoOk = conf.clientes.filter(c => c.temAlgumAbaixo);

    const destinatarios = (destinatariosInput && destinatariosInput.length ? destinatariosInput : SUBSTITUTO_ALERT_RECIPIENTS)
      .map(s => s.trim())
      .filter(Boolean);
    if (destinatarios.length === 0) {
      const e: any = new Error('Nenhum destinatário informado.');
      e.status = 400;
      throw e;
    }

    if (naoOk.length === 0) {
      return { success: true, enviado: false, totalNaoOk: 0, destinatarios, mensagem: 'Nenhum cliente fora do limite — nada a enviar.' };
    }

    const html = montarHtmlAviso(conf, naoOk);
    // Assunto pelo padrão único dos avisos: prefixo, contagem e data. Antes era
    // string livre, e o aviso não se agrupava com os outros na caixa de entrada.
    const subject = EmailService.montarAssunto(TITULO_EMAIL_REOA, naoOk.length);
    await EmailService.sendEmail({ to: destinatarios.join(', '), subject, html });

    return { success: true, enviado: true, totalNaoOk: naoOk.length, destinatarios };
  }
}

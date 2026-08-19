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

const THRESHOLD_MENSAL = Number(process.env['SUBSTITUTO_THRESHOLD'] || 300000);

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
}

export interface SubstitutoCliente {
  id: string;
  razao_social: string;
  cnpj: string;
  codigo_sci: number | null;
  estabelecimentos: SubstitutoEstabelecimento[];
  temAlgumAbaixo: boolean;
  aoVivo?: boolean; // true = dados reais persistidos do SCI; false/ausente = prévia do cache
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
function construirJanela(): { ano: number; mes: number; bdref: number }[] {
  const now = new Date();
  // now.getMonth() é 0-based (0=Jan). O mês atual em 1-based é getMonth()+1, então
  // getMonth() já representa o MÊS ANTERIOR em 1-based (exceto janeiro).
  let ano = now.getFullYear();
  let mes = now.getMonth();
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
      PRIMARY KEY (id),
      UNIQUE KEY uk_reoa_cli_emp_ano_mes (cliente_id, codigo_empresa, ano, mes),
      INDEX idx_reoa_cliente (cliente_id),
      INDEX idx_reoa_bdref (bdref)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  reoaTableReady = true;
}

/** Monta os estabelecimentos (12 meses cada) a partir de um índice codEmpresa→bdref→valor. */
function construirEstabelecimentos(
  byCod: Map<number, Map<number, number>> | undefined,
  janela: { ano: number; mes: number; bdref: number }[],
  label: (cod: number) => string,
): { estabelecimentos: SubstitutoEstabelecimento[]; temAlgumAbaixo: boolean } {
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
    return { codigo_empresa: cod, rotulo: label(cod), meses, temAlgumAbaixo, mesesSemDados };
  });
  return { estabelecimentos, temAlgumAbaixo: estabelecimentos.some(e => e.temAlgumAbaixo) };
}

// ── Helpers de e-mail (aviso REOA) ──
const MESES_SRV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const brlSrv = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const labelMesSrv = (ano: number, mes: number) => `${MESES_SRV[mes - 1]}/${ano}`;
const REOA_PAGE_URL = process.env['REOA_PAGE_URL'] || 'http://192.168.0.47:5173/beneficios';

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

export class SubstitutoService {
  async conferencia() {
    const janela = construirJanela();
    const startBdref = janela[0].bdref;
    const endBdref = janela[janela.length - 1].bdref;

    // ── Query 1: clientes do grupo SUBSTITUTO (match por token exato) ──
    const clientes = await executeQuery<{
      id: string; razao_social: string; cnpj_limpo: string; codigo_sci: number | null;
    }>(
      `SELECT id, razao_social, cnpj_limpo, codigo_sci
       FROM clientes
       WHERE ativo = 1
         AND FIND_IN_SET('SUBSTITUTO', REPLACE(REPLACE(UPPER(beneficios_fiscais), ', ', ','), ' ,', ',')) > 0
       ORDER BY razao_social`
    );

    if (clientes.length === 0) {
      return {
        success: true,
        threshold: THRESHOLD_MENSAL,
        janela,
        clientes: [] as SubstitutoCliente[],
        resumo: { totalClientes: 0, comAlerta: 0, totalEstabelecimentos: 0 },
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

    let comAlerta = 0;
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

      const { estabelecimentos, temAlgumAbaixo } = construirEstabelecimentos(byCod, janela, label);
      totalEstabelecimentos += estabelecimentos.length;
      if (temAlgumAbaixo) comAlerta++;

      return {
        id: c.id,
        razao_social: c.razao_social,
        cnpj: c.cnpj_limpo,
        codigo_sci: codigoSci,
        estabelecimentos,
        temAlgumAbaixo,
        aoVivo: temReoa,
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

    const janela = construirJanela();
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
    const { estabelecimentos, temAlgumAbaixo } = construirEstabelecimentos(porEstab, janela, label);

    // Persistir os meses com dado real (>0) para sobreviver ao reload da página
    // e alimentar a conferência/futura rotina de e-mail.
    await ensureReoaTable();
    const valores: any[] = [];
    for (const e of estabelecimentos) {
      for (const m of e.meses) {
        if (!m.semDados && m.faturamento != null) {
          valores.push([cliente.id, e.codigo_empresa, m.ano, m.mes, m.bdref, m.faturamento]);
        }
      }
    }
    if (valores.length > 0) {
      const ph = valores.map(() => '(?,?,?,?,?,?)').join(',');
      await mysqlPool.query(
        `INSERT INTO reoa_faturamento (cliente_id, codigo_empresa, ano, mes, bdref, faturamento)
         VALUES ${ph}
         ON DUPLICATE KEY UPDATE faturamento = VALUES(faturamento)`,
        valores.flat()
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
        aoVivo: true,
      },
    };
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

/**
 * Integra DCTFWeb — geração do DARF numerado.
 *
 * DCTFWEB / GERARGUIA31 / versão 1.0 → POST /integra-contador/v1/Emitir
 *
 * POR QUE ESTE É O DARF CERTO PARA A ABA TRABALHISTA:
 *   Desde a substituição da GFIP, contribuição previdenciária e de terceiros se
 *   declara na DCTFWeb e se paga com o DARF NUMERADO, que o próprio sistema
 *   gera já vinculado ao débito da declaração. O DARF do Sicalc (o "preto") é
 *   outra coisa: nele quem identifica o débito é o código de receita digitado
 *   à mão, e usá-lo para pagar algo que está declarado na DCTFWeb produz um
 *   recolhimento que não casa com a declaração.
 *
 * A CONSEQUÊNCIA PRÁTICA NA API: aqui não existe código de receita, extensão,
 *   cota nem data de consolidação. Os valores, a multa e os juros já estão na
 *   declaração — só se diz QUAL declaração se quer pagar (categoria + período)
 *   e a Receita devolve a guia pronta. Se algum dia alguém for tentado a
 *   acrescentar um campo de valor aqui, é sinal de que está querendo o Sicalc.
 */

import {
  chamarIntegraContador,
  extrairDados,
  mensagensDeNegocio,
  IntegraContadorError,
} from './integraContador';

const ID_SISTEMA = 'DCTFWEB';
const ID_SERVICO = 'GERARGUIA31';
const VERSAO_SISTEMA = '1.0';

/**
 * As sete categorias de declaração, com o número que a RFB usa para cada uma.
 *
 * O campo `categoria` aceita o nome ou o número; mandamos o NÚMERO porque é ele
 * que aparece nas mensagens de erro do SERPRO ("exceto categorias 41 e 51"), e
 * casar o que se manda com o que se lê de volta economiza tradução na hora de
 * entender uma recusa.
 */
export const CATEGORIAS = {
  GERAL_MENSAL: 40,
  GERAL_13o_SALARIO: 41,
  AFERICAO: 44,
  ESPETACULO_DESPORTIVO: 45,
  RECLAMATORIA_TRABALHISTA: 46,
  PF_MENSAL: 50,
  PF_13o_SALARIO: 51,
} as const;

export type CategoriaDctfWeb = keyof typeof CATEGORIAS;

/** Rótulos de tela. Ficam junto dos números para não divergirem com o tempo. */
export const ROTULO_CATEGORIA: Record<CategoriaDctfWeb, string> = {
  GERAL_MENSAL: 'Geral — mensal',
  GERAL_13o_SALARIO: 'Geral — 13º salário',
  AFERICAO: 'Aferição de obra',
  ESPETACULO_DESPORTIVO: 'Espetáculo desportivo',
  RECLAMATORIA_TRABALHISTA: 'Reclamatória trabalhista',
  PF_MENSAL: 'Pessoa física — mensal',
  PF_13o_SALARIO: 'Pessoa física — 13º salário',
};

/**
 * O que cada categoria pede além de ano e mês. Espelha as ressalvas da
 * documentação, e é o que o formulário consulta para se montar.
 *
 * `exigeMes: false` nas de 13º salário: o décimo terceiro é anual, e mandar
 * `mesPA` nelas é justamente o que a doc exclui.
 */
export const REGRAS_CATEGORIA: Record<
  CategoriaDctfWeb,
  { exigeMes: boolean; exigeDia?: boolean; exigeCno?: boolean; exigeProcesso?: boolean }
> = {
  GERAL_MENSAL: { exigeMes: true },
  GERAL_13o_SALARIO: { exigeMes: false },
  AFERICAO: { exigeMes: true, exigeCno: true },
  ESPETACULO_DESPORTIVO: { exigeMes: true, exigeDia: true },
  RECLAMATORIA_TRABALHISTA: { exigeMes: true, exigeProcesso: true },
  PF_MENSAL: { exigeMes: true },
  PF_13o_SALARIO: { exigeMes: false },
};

export interface DadosGuiaDctfWeb {
  /** CNPJ ou CPF, só dígitos. */
  contribuinte: string;
  categoria: CategoriaDctfWeb;
  /** AAAA */
  anoPA: string;
  /** MM — obrigatório fora das categorias de 13º salário. */
  mesPA?: string;
  /** Só ESPETACULO_DESPORTIVO. */
  diaPA?: string;
  /** Só AFERICAO — número da obra. */
  cnoAfericao?: string;
  /** Só RECLAMATORIA_TRABALHISTA. */
  numProcReclamatoria?: string;
  /** Ausente = a RFB usa o recibo mais recente daquela competência. */
  numeroReciboEntrega?: string;
  /** Data de pagamento pretendida, AAAA-MM-DD. Vira aaaammdd no envio. */
  dataAcolhimento?: string;
}

/**
 * O que se consegue ler do PDF da guia.
 *
 * Existe porque a resposta do GERARGUIA31 traz UM ÚNICO campo — o
 * `PDFByteArrayBase64`. Conferido em 31/08/2026 contra o SERPRO: nada de
 * número do documento, valor, vencimento ou recibo no JSON. Sem esta leitura,
 * a linha do histórico de uma guia de DCTFWeb ficaria com todas as colunas
 * úteis vazias, e a lista viraria "emitido em tal data, e só".
 */
export interface DadosLidosDoPdf {
  numeroDocumento: string | null;
  /** Total a pagar, já com acréscimos. */
  valorTotal: number | null;
  /** Soma dos principais, antes de multa e juros. */
  valorPrincipal: number | null;
  /** 'AAAA-MM-DD'. É o "pagar este documento até". */
  vencimento: string | null;
  /** Recibo da declaração que originou a guia. */
  numeroRecibo: string | null;
}

export interface GuiaEmitida {
  /** PDF em base64. */
  pdf: string;
  /** Lido do PDF — a API não devolve. Vazio quando a leitura falhou. */
  numeroDocumento: string;
  /** Demais campos lidos do PDF. Todos podem vir nulos sem quebrar a emissão. */
  lidos: DadosLidosDoPdf;
  /** O `dados` como foi enviado, para o histórico registrar o que de fato foi. */
  dadosEnviados: Record<string, unknown>;
  respostaBruta: unknown;
}

const soDigitos = (v: unknown): string => String(v ?? '').replace(/\D/g, '');

function validar(d: DadosGuiaDctfWeb): void {
  const erros: string[] = [];
  const regra = REGRAS_CATEGORIA[d.categoria];

  if (!regra) erros.push('categoria inválida');
  const doc = soDigitos(d.contribuinte);
  if (doc.length !== 14 && doc.length !== 11) erros.push('CNPJ/CPF do contribuinte inválido');
  if (!/^\d{4}$/.test(String(d.anoPA ?? '').trim())) erros.push('ano deve ter 4 dígitos');

  if (regra?.exigeMes && !/^\d{1,2}$/.test(soDigitos(d.mesPA))) {
    erros.push('mês é obrigatório nesta categoria');
  }
  if (regra?.exigeDia && !soDigitos(d.diaPA)) {
    erros.push('dia é obrigatório para espetáculo desportivo');
  }
  if (regra?.exigeCno && !soDigitos(d.cnoAfericao)) {
    erros.push('número da obra (CNO) é obrigatório para aferição');
  }
  if (regra?.exigeProcesso && !String(d.numProcReclamatoria ?? '').trim()) {
    erros.push('número do processo é obrigatório para reclamatória trabalhista');
  }

  if (erros.length) throw new IntegraContadorError(`Dados inválidos: ${erros.join('; ')}.`);
}

function montarDados(d: DadosGuiaDctfWeb): Record<string, unknown> {
  const regra = REGRAS_CATEGORIA[d.categoria];
  const dados: Record<string, unknown> = {
    categoria: CATEGORIAS[d.categoria],
    anoPA: String(d.anoPA).trim(),
  };

  // Mês com dois dígitos: a RFB trata '1' e '01' de forma diferente em alguns
  // pontos, e o zero à esquerda é o formato que a documentação exemplifica.
  if (regra.exigeMes) dados['mesPA'] = soDigitos(d.mesPA).padStart(2, '0');
  if (regra.exigeDia && d.diaPA) dados['diaPA'] = soDigitos(d.diaPA).padStart(2, '0');
  if (regra.exigeCno && d.cnoAfericao) dados['cnoAfericao'] = Number(soDigitos(d.cnoAfericao));
  if (regra.exigeProcesso && d.numProcReclamatoria) {
    dados['numProcReclamatoria'] = String(d.numProcReclamatoria).trim();
  }
  if (d.numeroReciboEntrega) {
    dados['numeroReciboEntrega'] = Number(soDigitos(d.numeroReciboEntrega));
  }
  if (d.dataAcolhimento) {
    // aaaammdd, como número — é o formato que a doc especifica.
    const iso = soDigitos(d.dataAcolhimento).slice(0, 8);
    if (iso.length === 8) dados['DataAcolhimentoProposta'] = Number(iso);
  }

  return dados;
}

/**
 * Acha o PDF na resposta.
 *
 * A documentação nomeia `PDFByteArrayBase64`, mas os serviços do Integra
 * Contador não são consistentes nesse nome (o SICALC chama de `darf`). Em vez
 * de apostar num só, procuramos os conhecidos e, se nenhum casar, varremos por
 * qualquer string longa que comece com a assinatura de PDF em base64
 * ("JVBERi" = "%PDF"). Assim uma renomeação do lado deles vira um detalhe, e
 * não uma emissão perdida com o PDF na mão.
 */
function acharPdf(payload: any): string | null {
  const conhecidos = ['PDFByteArrayBase64', 'pdfByteArrayBase64', 'pdf', 'darf', 'documento'];
  for (const k of conhecidos) {
    const v = payload?.[k];
    if (typeof v === 'string' && v.length > 100) return v;
  }
  for (const v of Object.values(payload ?? {})) {
    if (typeof v === 'string' && v.length > 100 && v.startsWith('JVBERi')) return v;
  }
  return null;
}

// ─── Leitura do PDF ────────────────────────────────────────────────────────

// Mesmo padrão de importação usado no SituacaoFiscalOrchestrator: o pdf-parse
// muda de API entre a 1.x (função) e a 2.x (classe), e as duas convivem aqui.
const pdfParseModule = require('pdf-parse');
const pdfParse = pdfParseModule.default || pdfParseModule;
const PDFParse = pdfParseModule.PDFParse;

async function textoDoPdf(base64: string): Promise<string> {
  const buffer = Buffer.from(base64, 'base64');
  if (PDFParse) {
    const r = await new PDFParse({ data: buffer }).getText();
    return r?.text ?? '';
  }
  const r = await pdfParse(buffer);
  return r?.text ?? '';
}

/** '10.373,82' -> 10373.82 */
function moedaBr(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

/** '31/08/2026' -> '2026-08-31' */
function dataBr(v: string | undefined): string | null {
  const m = String(v ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * Extrai o que interessa do texto do DARF.
 *
 * Prefere o bloco final do documento — o do código de barras, que rotula cada
 * dado ("Número:", "Pagar até:", "Valor:") — porque o cabeçalho vem com as
 * colunas embaralhadas na extração de texto e casar valor com rótulo lá é
 * chute. A linha "Totais" é lida à parte só para o principal.
 */
export function lerPdfDaGuia(texto: string): DadosLidosDoPdf {
  const t = texto.replace(/\u00a0/g, ' ');

  const numero = t.match(/N[úu]mero:\s*([\d.\-]{10,})/i)?.[1] ?? null;
  const vencimento = dataBr(t.match(/Pagar at[ée]:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1]);
  const total = moedaBr(t.match(/Valor:\s*([\d.,]+)/i)?.[1]);
  const recibo = t.match(/Recibo\s+Declara[çc][ãa]o:\s*(\d+)/i)?.[1] ?? null;

  // 'Totais 10.010,46 363,36 10.373,82' — principal, acréscimos, total. Só o
  // principal é aproveitado: a coluna do meio junta multa e juros num número
  // só, e separá-la seria invenção.
  const totais = t.match(/Totais\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i);

  return {
    numeroDocumento: numero,
    valorTotal: total ?? moedaBr(totais?.[3]),
    valorPrincipal: moedaBr(totais?.[1]),
    vencimento,
    numeroRecibo: recibo,
  };
}

const NADA_LIDO: DadosLidosDoPdf = {
  numeroDocumento: null,
  valorTotal: null,
  valorPrincipal: null,
  vencimento: null,
  numeroRecibo: null,
};

export async function gerarGuia(d: DadosGuiaDctfWeb): Promise<GuiaEmitida> {
  validar(d);

  const dadosEnviados = montarDados(d);

  const resposta = await chamarIntegraContador({
    endpoint: 'Emitir',
    contribuinte: d.contribuinte,
    idSistema: ID_SISTEMA,
    idServico: ID_SERVICO,
    versaoSistema: VERSAO_SISTEMA,
    dados: dadosEnviados,
    timeout: 90000,
  });

  const payload = extrairDados<any>(resposta);
  const pdf = acharPdf(payload);

  if (!pdf) {
    // Sem PDF quase nunca é falha técnica: é o negócio recusando, e o motivo
    // vem nas mensagens — "Não foi encontrada Declaração com os dados
    // informados" (competência ainda não transmitida) é o caso mais comum do
    // dia a dia. O HTTP 200 e o "[Sucesso-DCTFWEB]" que vêm junto são sobre a
    // chamada, não sobre o pedido; por isso a mensagem é montada a partir das
    // linhas de negócio, e o texto técnico fica só para quando não houver
    // nenhuma.
    const motivos = mensagensDeNegocio(resposta);
    throw new IntegraContadorError(
      motivos.length
        ? motivos.join(' ')
        : 'A Receita não devolveu o PDF da guia e não informou o motivo.',
      200,
      resposta
    );
  }

  // A leitura do PDF é um bônus, nunca uma condição. Se o pdf-parse falhar ou
  // o layout do DARF mudar, a guia continua sendo entregue — o que se perde é
  // o preenchimento do histórico, não o documento.
  let lidos = NADA_LIDO;
  try {
    lidos = lerPdfDaGuia(await textoDoPdf(pdf));
  } catch (err) {
    console.warn('[DctfWeb] Não foi possível ler os dados do PDF:', (err as Error).message);
  }

  return {
    pdf,
    numeroDocumento: lidos.numeroDocumento ?? '',
    lidos,
    dadosEnviados,
    respostaBruta: payload,
  };
}

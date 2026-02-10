/**
 * Extrai valores de CFOP de saída (5.xxx, 6.xxx, 7.xxx) de um PDF (ex.: relatório Gelden).
 * Usa pdf-parse para obter o texto e regex para identificar linhas CFOP + valor.
 */

import type { CFOPMensalRow, CFOPAnualRow } from '../controllers/CFOPController';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParseModule = require('pdf-parse');
// pdf-parse 2.x exporta apenas a classe PDFParse (não há default)
const PDFParse = pdfParseModule?.PDFParse;
const pdfParseLegacy = typeof pdfParseModule === 'function' ? pdfParseModule : pdfParseModule?.default;

/** Extrai texto do PDF usando pdf-parse (1.x: função; 2.x: classe PDFParse). */
async function extrairTextoDoPdf(buffer: Buffer): Promise<string> {
  let text = '';
  if (typeof pdfParseLegacy === 'function') {
    const result = await pdfParseLegacy(buffer);
    text = result?.text ?? (result && typeof result === 'object' && 'text' in result ? result.text : '') ?? '';
  } else if (PDFParse && typeof PDFParse === 'function') {
    const parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    text = (textResult && typeof textResult === 'object' && 'text' in textResult ? String((textResult as { text?: string }).text ?? '') : '');
  } else {
    throw new Error('pdf-parse não está disponível. Use a classe PDFParse (v2) ou a função default (v1).');
  }
  return typeof text === 'string' ? text : String(text ?? '');
}

/** CFOP de saída: 5.102, 6.102, 7.102 etc. */
const CFOP_SAIDA_REGEX = /^\s*([567])\.?(\d{3})\b/i;
/** CFOP de entrada: 1.102, 2.102, 3.102 etc. */
const CFOP_ENTRADA_REGEX = /^\s*([123])\.?(\d{3})\b/i;
/** Token que é um valor monetário BR (ex.: 1.234.567,89) */
const VALOR_REGEX = /^[\d.,]+$/;
/** CFOP é um número no formato 1.102, 5.102 etc. — não confundir com Valor Contábil. */
const CFOP_CODIGO_REGEX = /^[123567]\.\d{3}$/;
/** Ano em contexto de relatório: exercício 2025, ano 2025, 2025, etc. (primeiros ~4k caracteres) */
const ANO_REGEX = /\b(20\d{2})\b/g;
const ANO_CONTEXTO_REGEX = /(?:exerc[íi]cio|ano|per[íi]odo|base)\s*(?:de\s*)?(\d{4})/gi;
const ANO_MIN = 2000;
const ANO_MAX = 2030;

/** Tenta extrair o ano do relatório do texto do PDF (ex.: Gelden). Prefere ano em contexto (exercício/ano) e evita ano atual quando há outro ano no texto. */
function extrairAnoDoTexto(texto: string): number | null {
  const inicio = texto.slice(0, 4000);
  const anoAtual = new Date().getFullYear();

  // 1) Preferir ano em contexto explícito: "exercício 2025", "ano 2025", "período 2025"
  const anosContexto: number[] = [];
  let mc: RegExpExecArray | null;
  ANO_CONTEXTO_REGEX.lastIndex = 0;
  while ((mc = ANO_CONTEXTO_REGEX.exec(inicio)) !== null) {
    const ano = parseInt(mc[1]!, 10);
    if (ano >= ANO_MIN && ano <= ANO_MAX) anosContexto.push(ano);
  }
  if (anosContexto.length > 0) {
    const contagemC: Record<number, number> = {};
    for (const a of anosContexto) {
      contagemC[a] = (contagemC[a] ?? 0) + 1;
    }
    const ordenadoC = Object.entries(contagemC).sort((a, b) => b[1]! - a[1]!);
    return parseInt(ordenadoC[0]![0], 10);
  }

  // 2) Coletar todos os anos nos primeiros 4000 caracteres
  const anos: number[] = [];
  let m: RegExpExecArray | null;
  ANO_REGEX.lastIndex = 0;
  while ((m = ANO_REGEX.exec(inicio)) !== null) {
    const ano = parseInt(m[1]!, 10);
    if (ano >= ANO_MIN && ano <= ANO_MAX) anos.push(ano);
  }
  if (anos.length === 0) return null;

  const contagem: Record<number, number> = {};
  for (const a of anos) {
    contagem[a] = (contagem[a] ?? 0) + 1;
  }
  const ordenado = Object.entries(contagem).sort((a, b) => b[1]! - a[1]!);
  const anoMaisFrequente = parseInt(ordenado[0]![0], 10);

  // 3) Se o mais frequente for o ano atual (ex.: 2026) mas existir outro ano no texto (ex.: 2025), preferir o outro (relatório é do ano passado)
  const outrosAnos = Object.keys(contagem)
    .map((k) => parseInt(k, 10))
    .filter((y) => y !== anoAtual);
  if (anoMaisFrequente === anoAtual && outrosAnos.length > 0) {
    const outroMaisFrequente = outrosAnos
      .map((y) => ({ ano: y, count: contagem[y]! }))
      .sort((a, b) => b.count - a.count)[0];
    return outroMaisFrequente ? outroMaisFrequente.ano : anoMaisFrequente;
  }

  return anoMaisFrequente;
}

function normalizarValorBR(texto: string | null | undefined): number {
  if (!texto || !String(texto).trim()) return 0;
  const t = String(texto).trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function extrairCfopEDescricaoSaida(linha: string): { cfop: string; descricao: string } | null {
  const m = linha.match(CFOP_SAIDA_REGEX);
  if (!m) return null;
  const cfop = `${m[1]}.${m[2]}`;
  if (cfop === '5.00' || cfop === '6.00' || cfop === '7.00') return null;
  if (/Totais?\s*$/i.test(linha.trim())) return null;
  const descricao = linha.slice(m[0].length).trim();
  return { cfop, descricao };
}

function extrairCfopEDescricaoEntrada(linha: string): { cfop: string; descricao: string } | null {
  const m = linha.match(CFOP_ENTRADA_REGEX);
  if (!m) return null;
  const cfop = `${m[1]}.${m[2]}`;
  if (cfop === '1.00' || cfop === '2.00' || cfop === '3.00') return null;
  if (/Totais?\s*$/i.test(linha.trim())) return null;
  const descricao = linha.slice(m[0].length).trim();
  return { cfop, descricao };
}

/**
 * Extrai o valor a ser somado da linha. É sempre a coluna à frente da coluna CFOP (Valores Contábeis).
 * Ignora o código CFOP (ex.: 5.102) e retorna o primeiro valor numérico que vem depois dele.
 */
function extrairValorDaLinha(linha: string): number {
  const partes = linha.split(/\s{2,}|\t/).filter(Boolean);
  for (let i = 0; i < partes.length; i++) {
    const p = (partes[i] ?? '').trim();
    if (!p || !VALOR_REGEX.test(p)) continue;
    // Pular o próprio código CFOP (1.102, 5.102, etc.) — é a primeira coluna, não o valor
    if (CFOP_CODIGO_REGEX.test(p)) continue;
    return normalizarValorBR(p);
  }
  return 0;
}

function computeSomaAnual(items: CFOPMensalRow[]): CFOPAnualRow[] {
  const byKey: Record<string, CFOPAnualRow> = {};
  for (const r of items) {
    const ano = r.ano ?? new Date().getFullYear();
    const key = `${ano}-${r.cfop}`;
    if (!byKey[key]) {
      byKey[key] = { ano, cfop: r.cfop, descricao: r.descricao || '', valor_soma: 0 };
    }
    byKey[key]!.valor_soma += r.valor ?? 0;
  }
  return Object.values(byKey).sort((a, b) =>
    a.ano !== b.ano ? a.ano - b.ano : a.cfop.localeCompare(b.cfop)
  );
}

export interface CFOPExtractResult {
  items: CFOPMensalRow[];
  somaAnual: CFOPAnualRow[];
}

export interface CFOPCompletoExtractResult {
  entrada: CFOPExtractResult;
  saida: CFOPExtractResult;
}

/**
 * Extrai CFOP de saída (5.xxx, 6.xxx, 7.xxx) do buffer de um PDF (relatório Gelden ou similar).
 * Retorna itens mensais e soma anual.
 */
export async function extrairCFOPDePdf(buffer: Buffer): Promise<CFOPExtractResult> {
  const text = await extrairTextoDoPdf(buffer);
  const anoDoRelatorio = extrairAnoDoTexto(text) ?? new Date().getFullYear();
  const items: CFOPMensalRow[] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = extrairCfopEDescricaoSaida(trimmed);
    if (!parsed) continue;
    const valor = extrairValorDaLinha(trimmed);
    items.push({
      ano: anoDoRelatorio,
      mes: null,
      cfop: parsed.cfop,
      descricao: parsed.descricao,
      valor,
    });
  }

  const somaAnual = computeSomaAnual(items);
  return { items, somaAnual };
}

/**
 * Extrai CFOP de entrada (1.xxx, 2.xxx, 3.xxx) do buffer de um PDF.
 * Retorna itens mensais e soma anual, no mesmo formato que extrairCFOPDePdf.
 */
export async function extrairCFOPEntradaDePdf(buffer: Buffer): Promise<CFOPExtractResult> {
  const text = await extrairTextoDoPdf(buffer);
  const anoDoRelatorio = extrairAnoDoTexto(text) ?? new Date().getFullYear();
  const items: CFOPMensalRow[] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = extrairCfopEDescricaoEntrada(trimmed);
    if (!parsed) continue;
    const valor = extrairValorDaLinha(trimmed);
    items.push({
      ano: anoDoRelatorio,
      mes: null,
      cfop: parsed.cfop,
      descricao: parsed.descricao,
      valor,
    });
  }

  const somaAnual = computeSomaAnual(items);
  return { items, somaAnual };
}

/**
 * Extrai CFOP de entrada (1.xxx, 2.xxx, 3.xxx) e de saída (5.xxx, 6.xxx, 7.xxx) do mesmo PDF em uma única leitura.
 * Retorna ambos para que uma única importação preencha as duas abas.
 */
export async function extrairCFOPCompletoDePdf(buffer: Buffer): Promise<CFOPCompletoExtractResult> {
  const text = await extrairTextoDoPdf(buffer);
  const anoDoRelatorio = extrairAnoDoTexto(text) ?? new Date().getFullYear();
  const itemsEntrada: CFOPMensalRow[] = [];
  const itemsSaida: CFOPMensalRow[] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsedEntrada = extrairCfopEDescricaoEntrada(trimmed);
    if (parsedEntrada) {
      const valor = extrairValorDaLinha(trimmed);
      itemsEntrada.push({
        ano: anoDoRelatorio,
        mes: null,
        cfop: parsedEntrada.cfop,
        descricao: parsedEntrada.descricao,
        valor,
      });
      continue;
    }
    const parsedSaida = extrairCfopEDescricaoSaida(trimmed);
    if (parsedSaida) {
      const valor = extrairValorDaLinha(trimmed);
      itemsSaida.push({
        ano: anoDoRelatorio,
        mes: null,
        cfop: parsedSaida.cfop,
        descricao: parsedSaida.descricao,
        valor,
      });
    }
  }

  return {
    entrada: { items: itemsEntrada, somaAnual: computeSomaAnual(itemsEntrada) },
    saida: { items: itemsSaida, somaAnual: computeSomaAnual(itemsSaida) },
  };
}

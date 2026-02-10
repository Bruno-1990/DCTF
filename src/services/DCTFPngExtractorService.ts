/**
 * Serviço para extrair dados tabulares DCTF de imagens PNG (prints da tela oficial).
 * Usa pré-processamento (Sharp), Tesseract.js para OCR e parser heurístico para colunas:
 * Tipo NI, Número de Identificação, Período de Apuração, Data Transmissão,
 * Categoria, Origem, Tipo, Situação, Débito Apurado, Saldo a Pagar.
 * Inclui fuzzy match para corrigir ruído de OCR em campos textuais.
 */

import Tesseract from 'tesseract.js';

/** Pré-processamento de imagem: opcional; se Sharp não estiver disponível, retorna o buffer original */
async function preprocessImageForOcr(buffer: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(buffer).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    let pipeline = sharp(buffer).grayscale().normalise();
    if (width > 0 && height > 0 && (width < 800 || height < 600)) {
      const scale = Math.min(2, 800 / width, 600 / height);
      if (scale > 1) pipeline = pipeline.resize(Math.round(width * scale), Math.round(height * scale));
    }
    pipeline = pipeline.sharpen({ sigma: 0.5 });
    return await pipeline.png().toBuffer();
  } catch {
    return buffer;
  }
}

export interface DCTFExtractedRow {
  tipo_ni: string | null;
  cnpj: string | null;
  periodo_apuracao: string | null;
  data_transmissao: string | null;
  categoria: string | null;
  origem: string | null;
  tipo: string | null;
  situacao: string | null;
  debito_apurado: number | string | null;
  saldo_a_pagar: number | string | null;
}

export interface ExtractPerFileResult {
  filename: string;
  rows: DCTFExtractedRow[];
  error?: string;
}

const COLUMN_HEADERS = [
  'Tipo NI',
  'Número de Identificação',
  'Período de Apuração',
  'Data Transmissão',
  'Categoria',
  'Origem',
  'Tipo',
  'Situação',
  'Débito Apurado',
  'Saldo a Pagar',
];

function onlyDigits(s: string): string {
  return (s || '').replace(/\D/g, '');
}

function normalizeCnpj(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  const digits = onlyDigits(String(value).trim());
  if (digits.length >= 14) return digits.slice(0, 14);
  if (digits.length >= 11) return digits; // CPF ou CNPJ incompleto no OCR
  return digits || null;
}

function normalizeDate(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  // DD/MM/YYYY ou DD/MM/YYYY HH:MM
  const ddmmyyyy = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    const datePart = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const timePart = s.includes(':') ? s.split(/\s+/)[1] || '00:00:00' : '00:00:00';
    if (timePart.length === 5) return `${datePart} ${timePart}:00`;
    return `${datePart} ${timePart}`;
  }
  // YYYY-MM-DD
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return s.includes(' ') ? s : `${s} 00:00:00`;
  return s || null;
}

/**
 * Normaliza valor monetário BR ou variação OCR para número.
 * Aceita: 613.245,08 | 613245,08 | 613 245,08 | 2397,02 | 613245.08
 */
function normalizeDecimal(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  let s = String(value).trim().replace(/\s/g, '');
  if (!s.length) return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes('.')) {
    const parts = s.split('.');
    if (parts.length === 2 && /^\d{1,2}$/.test(parts[1])) {
      s = parts[0] + '.' + parts[1];
    } else {
      s = s.replace(/\./g, '');
    }
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function trimCell(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Detecta se a string parece valor monetário BR ou variação OCR; também aceita se normalizar para número válido */
function isMonetaryValue(s: string): boolean {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim().replace(/\s/g, '');
  if (!t.length) return false;
  const regexMatch =
    /^\d{1,3}(\.\d{3})*(,\d{2})?$/.test(t) ||
    /^\d+,\d{2}$/.test(t) ||
    /^\d+\.\d{2}$/.test(t) ||
    /^\d[\d.]*,\d{2}$/.test(t) ||
    /^\d+([.,]\d+)+$/.test(t);
  if (regexMatch) return true;
  const n = normalizeDecimal(s);
  return n != null && Number.isFinite(n) && n >= 0 && n < 1e15;
}

/** Retorna índices das células que parecem valor monetário (da esquerda para direita) */
function findMonetaryIndices(cells: string[]): number[] {
  const indices: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (isMonetaryValue(cells[i])) indices.push(i);
  }
  return indices;
}

/** Célula parece valor monetário com decimais (ex.: 613.245,08 ou 115674.73) — evita pegar "5" solto */
function looksLikeCurrencyWithDecimals(s: string): boolean {
  if (!s || typeof s !== 'string') return false;
  const t = String(s).trim().replace(/\s/g, '');
  return /,\d{2}$/.test(t) || /\.\d{2}$/.test(t);
}

/** Encontra a primeira célula com 11+ dígitos (CNPJ/CPF) */
function findCnpjCell(cells: string[]): string | null {
  for (const c of cells) {
    const digits = onlyDigits(c);
    if (digits.length >= 11) return digits.length >= 14 ? digits.slice(0, 14) : digits;
  }
  return null;
}

/** Encontra a primeira célula no formato MM/YYYY */
function findPeriodoCell(cells: string[]): string | null {
  for (const c of cells) {
    const t = (c || '').trim();
    if (/^\d{1,2}\/\d{4}$/.test(t)) return t;
  }
  return null;
}

/** Encontra a primeira célula que parece data DD/MM/YYYY ou com hora */
function findDataTransmissaoCell(cells: string[]): string | null {
  for (const c of cells) {
    const n = normalizeDate(c);
    if (n) return n;
  }
  return null;
}

/** Detecta se a célula contém apenas hora (HH:MM:SS, HH:MM ou truncado pelo OCR ex.: 14:1837) — evita mapear hora em categoria */
function isTimeOnly(s: string | null | undefined): boolean {
  if (s == null || typeof s !== 'string') return false;
  const t = String(s).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return true;
  if (/^\d{1,2}:\d{4}$/.test(t)) return true;
  return false;
}

/** Normaliza hora truncada pelo OCR (ex.: 14:1837 -> 14:18:37, 14:18 -> 14:18:00) */
function normalizeTimePart(s: string): string {
  const t = s.trim();
  const m4 = t.match(/^(\d{1,2}):(\d{2})(\d{2})$/);
  if (m4) return `${m4[1].padStart(2, '0')}:${m4[2]}:${m4[3]}`;
  const m2 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m2) return `${m2[1].padStart(2, '0')}:${m2[2]}:00`;
  return t;
}

/** Detecta se a célula parece só a parte de data (DD/MM/YYYY) sem hora */
function isDatePartOnly(s: string | null | undefined): boolean {
  if (s == null || typeof s !== 'string') return false;
  const t = String(s).trim();
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t) === true;
}

/**
 * Se o OCR separou "Data Transmissão" em duas células (data + hora), mescla e retorna
 * { dataTransmissao, realignedCells } para uso em categoria/origem/tipo/situação.
 */
function mergeDateTimeAndRealign(cells: string[]): {
  dataTransmissao: string | null;
  realignedCells: string[];
} {
  let dataTransmissao: string | null = null;
  let realignedCells = cells;

  for (let i = 0; i < cells.length - 1; i++) {
    const datePart = cells[i];
    const nextPart = cells[i + 1];
    if (isDatePartOnly(datePart) && isTimeOnly(nextPart)) {
      const timeNorm = normalizeTimePart(nextPart);
      const merged = normalizeDate(`${datePart} ${timeNorm}`);
      if (merged && /\d{4}-\d{2}-\d{2}/.test(merged)) {
        dataTransmissao = merged;
        realignedCells = [
          ...cells.slice(0, i),
          `${datePart} ${timeNorm}`,
          ...cells.slice(i + 2),
        ];
      }
      break;
    }
  }

  if (dataTransmissao == null) {
    dataTransmissao = findDataTransmissaoCell(cells) || normalizeDate(cells[3] ?? '');
    if (dataTransmissao && !/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/.test(dataTransmissao))
      dataTransmissao = null;
  }

  return { dataTransmissao, realignedCells };
}

/** Normaliza tipo_ni: só "CNPJ" ou "CPF", evita ruído OCR (np), CNPJ 00:00:00, etc.) */
function sanitizeTipoNi(cell: string | null | undefined): string | null {
  if (cell == null || cell === '') return null;
  const t = String(cell).trim().toUpperCase();
  if (/^CNPJ$/i.test(t) || t.startsWith('CNPJ')) return 'CNPJ';
  if (/^CPF$/i.test(t) || t.startsWith('CPF')) return 'CPF';
  return null;
}

/** Distância de Levenshtein entre duas strings */
function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  const dp: number[][] = Array(an + 1)
    .fill(null)
    .map(() => Array(bn + 1).fill(0));
  for (let i = 0; i <= an; i++) dp[i][0] = i;
  for (let j = 0; j <= bn; j++) dp[0][j] = j;
  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[an][bn];
}

/** Retorna o melhor candidato da lista por similaridade (menor distância); maxDistance ou minRatio para aceitar */
function fuzzyMatch(
  raw: string | null | undefined,
  candidates: string[],
  maxDistance = 3,
  minRatio = 0.6
): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().replace(/[,.]$/g, '');
  if (!s.length) return null;
  const lower = s.toLowerCase();
  const exact = candidates.find((c) => c.toLowerCase() === lower);
  if (exact) return exact;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = levenshtein(lower, c.toLowerCase());
    const ratio = 1 - dist / Math.max(s.length, c.length);
    if (dist <= maxDistance && ratio >= minRatio && dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

const SITUACAO_VALIDAS = ['Ativa', 'Inativa', 'Pendente'];
const TIPO_VALIDAS = ['Original', 'Retificadora'];
const CATEGORIA_VALIDAS = ['Geral'];
const ORIGEM_TOKENS = ['eSocial', 'REINF', 'CP', 'RET', 'MIT', 'Geral'];

/** Sanitiza e corrige situacao por lista + fuzzy */
function sanitizeSituacao(raw: string | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().replace(/[,.]$/g, '');
  return fuzzyMatch(s, SITUACAO_VALIDAS, 2, 0.7) ?? (s.length <= 20 ? s : null);
}

/** Sanitiza e corrige tipo por lista + fuzzy */
function sanitizeTipo(raw: string | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().replace(/[,.]$/g, '');
  return fuzzyMatch(s, TIPO_VALIDAS, 3, 0.6) ?? (s.length <= 30 ? s : null);
}

/** Sanitiza categoria: lista conhecida ou fuzzy; rejeita se parecer hora */
function sanitizeCategoria(raw: string | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (isTimeOnly(s)) return null;
  return fuzzyMatch(s, CATEGORIA_VALIDAS, 2, 0.6) ?? (s.length <= 20 ? s : null);
}

/** Normaliza origem: remove vírgulas finais; preserva texto que já contém tokens conhecidos; corrige ruído com fuzzy */
function sanitizeOrigem(raw: string | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  let s = String(raw).trim().replace(/\s*,\s*$/, '').replace(/\s+/g, ' ').trim();
  if (!s.length) return null;
  const lower = s.toLowerCase();
  const hasKnownToken = ORIGEM_TOKENS.some((t) => lower.includes(t.toLowerCase()));
  if (hasKnownToken && s.length <= 80) return s;
  const matched = fuzzyMatch(s, ORIGEM_TOKENS, 3, 0.5);
  return matched ?? (s.length <= 80 ? s : null);
}

/**
 * Encontra as duas últimas células que parseiam como valor monetário.
 * Prefere células com formato de moeda (vírgula/ponto + 2 decimais) para evitar fragmentos (ex.: "5").
 * Corrige troca débito/saldo quando débito fica muito menor que saldo (típico: saldo ≤ débito).
 */
function findLastTwoMonetaryValues(cells: string[]): { debito: number | null; saldo: number | null } {
  const indices = findMonetaryIndices(cells);
  let idxDebito: number | null = null;
  let idxSaldo: number | null = null;

  const currencyLike = indices.filter((i) => looksLikeCurrencyWithDecimals(cells[i]));
  const preferred = currencyLike.length >= 2 ? currencyLike : indices;

  if (preferred.length >= 2) {
    idxDebito = preferred[preferred.length - 2];
    idxSaldo = preferred[preferred.length - 1];
  } else if (preferred.length === 1) {
    idxSaldo = preferred[0];
  }

  let debito: number | null = idxDebito != null ? normalizeDecimal(cells[idxDebito]) : null;
  let saldo: number | null = idxSaldo != null ? normalizeDecimal(cells[idxSaldo]) : null;

  if (debito != null || saldo != null) {
    if (debito != null && saldo != null && debito < saldo && debito < saldo * 0.01) {
      [debito, saldo] = [saldo, debito];
    }
    return { debito, saldo };
  }

  const fromEnd = Math.max(0, cells.length - 5);
  const numeric: { i: number; v: number; raw: string }[] = [];
  for (let i = fromEnd; i < cells.length; i++) {
    const v = normalizeDecimal(cells[i]);
    if (v != null && v >= 0 && v < 1e15) numeric.push({ i, v, raw: cells[i] });
  }
  const withDecimals = numeric.filter((x) => looksLikeCurrencyWithDecimals(x.raw));
  const pick = withDecimals.length >= 2 ? withDecimals : numeric;
  if (pick.length >= 2) {
    debito = pick[pick.length - 2].v;
    saldo = pick[pick.length - 1].v;
    if (debito < saldo && debito < saldo * 0.01) [debito, saldo] = [saldo, debito];
  } else if (pick.length === 1) {
    saldo = pick[0].v;
  }
  return { debito, saldo };
}

/**
 * Tenta extrair linhas de dados a partir do texto OCR.
 * Tenta vários delimitadores: tab, 2+ espaços, 1 espaço (quando há muitas colunas).
 * Ignora linhas que parecem cabeçalho (contêm nomes das colunas).
 * Débito e Saldo: usa as duas últimas colunas que parecem valor monetário (formato BR).
 */
function parseTableText(text: string): DCTFExtractedRow[] {
  const lines = text.split(/\r?\n/).map((l) => trimCell(l)).filter((l) => l.length > 0);
  const rows: DCTFExtractedRow[] = [];

  for (const line of lines) {
    const isHeader =
      COLUMN_HEADERS.filter((h) => line.toLowerCase().includes(h.toLowerCase())).length >= 2;
    if (isHeader) continue;

    let cells: string[] = line.split(/\t/).map((c) => trimCell(c)).filter((c) => c.length > 0);
    if (cells.length < 5) {
      cells = line.split(/\s{2,}/).map((c) => trimCell(c)).filter((c) => c.length > 0);
    }
    if (cells.length < 5) {
      cells = line.split(/\s+/).map((c) => trimCell(c)).filter((c) => c.length > 0);
    }

    if (cells.length < 5) continue;

    const cnpj = findCnpjCell(cells) || normalizeCnpj(cells[1] ?? cells[0]);
    const periodo_apuracao = findPeriodoCell(cells) || (cells[2] || '').trim() || null;

    const { dataTransmissao: data_transmissao, realignedCells } = mergeDateTimeAndRealign(cells);

    if (!cnpj || cnpj.length < 11) continue;
    if (!periodo_apuracao || !periodo_apuracao.match(/\d/)) continue;

    const { debito: debitoVal, saldo: saldoVal } = findLastTwoMonetaryValues(realignedCells);
    let debito_apurado = debitoVal ?? normalizeDecimal(realignedCells[8]);
    let saldo_a_pagar = saldoVal ?? normalizeDecimal(realignedCells[9]);
    if (
      debito_apurado != null &&
      saldo_a_pagar != null &&
      debito_apurado < saldo_a_pagar &&
      debito_apurado < saldo_a_pagar * 0.01
    ) {
      [debito_apurado, saldo_a_pagar] = [saldo_a_pagar, debito_apurado];
    }

    const tipo_ni = sanitizeTipoNi(realignedCells[0]) || 'CNPJ';
    const categoria = sanitizeCategoria(realignedCells[4]);
    const origem = sanitizeOrigem(realignedCells[5]);
    const tipo = sanitizeTipo(realignedCells[6]);
    const situacao = sanitizeSituacao(realignedCells[7]);

    rows.push({
      tipo_ni,
      cnpj: cnpj.length >= 14 ? cnpj.slice(0, 14) : cnpj,
      periodo_apuracao,
      data_transmissao,
      categoria,
      origem,
      tipo,
      situacao,
      debito_apurado,
      saldo_a_pagar,
    });
  }

  return rows;
}

let workerInstance: Tesseract.Worker | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (workerInstance) return workerInstance;
  const worker = await Tesseract.createWorker('por', Tesseract.OEM.LSTM_ONLY, { logger: () => {} });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
    });
  } catch {
    // ignora se PSM não for suportado
  }
  workerInstance = worker;
  return worker;
}

/**
 * Extrai dados tabulares de uma lista de buffers PNG.
 * Retorna por arquivo: { filename, rows, error? } para o controller reportar sucesso/erro por arquivo.
 */
export async function extractFromPngBuffers(
  files: { buffer: Buffer; filename?: string }[]
): Promise<ExtractPerFileResult[]> {
  const results: ExtractPerFileResult[] = [];
  const worker = await getWorker();

  for (const file of files) {
    const filename = file.filename ?? 'unknown.png';
    try {
      const buffer = await preprocessImageForOcr(file.buffer);
      const {
        data: { text },
      } = await worker.recognize(buffer);
      const rows = parseTableText(text || '');
      results.push({ filename, rows });
    } catch (err: any) {
      results.push({
        filename,
        rows: [],
        error: err?.message || String(err),
      });
    }
  }

  return results;
}

/**
 * Encerra o worker Tesseract (chamar ao desligar o processo, se desejado).
 */
export async function terminatePngExtractor(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
  }
}


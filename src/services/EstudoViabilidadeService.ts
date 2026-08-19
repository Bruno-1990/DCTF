/**
 * Estudo de Viabilidade — ingestao de legislacao (PDF/DOCX), extracao de
 * CNAEs via LLM (Anthropic Claude) e cruzamento com base de clientes.
 */

import { EventEmitter } from 'node:events';
import Anthropic from '@anthropic-ai/sdk';
import mammoth from 'mammoth';
import { mysqlPool } from '../config/mysql';

// ─── Emissor de progresso (SSE) ─────────────────────────────────────────
// Eventos sao publicados como `doc:<id>` durante o processamento.
// O endpoint SSE assina, encaminha pro cliente e desinscreve no done/error.

export type ProgressEvent =
  | { phase: 'parse';        message: string }
  | { phase: 'llm_start';    message: string;     model: string }
  | { phase: 'llm_progress'; chars_received: number; cnaes_parciais: number }
  | { phase: 'persist';      total: number }
  | { phase: 'done';         total_cnaes: number }
  | { phase: 'error';        message: string };

export const progressEmitter = new EventEmitter();
progressEmitter.setMaxListeners(50);

function emitProgress(documentoId: number, evt: ProgressEvent): void {
  progressEmitter.emit(`doc:${documentoId}`, evt);
}

const pdfParseModule = require('pdf-parse');
const PDFParse = pdfParseModule?.PDFParse;
const pdfParseLegacy = typeof pdfParseModule === 'function' ? pdfParseModule : pdfParseModule?.default;

const LLM_MODEL = process.env['ESTUDO_VIABILIDADE_LLM_MODEL'] || 'claude-sonnet-4-5-20250929';
const MAX_OUTPUT_TOKENS = parseInt(process.env['ESTUDO_VIABILIDADE_MAX_TOKENS'] || '32768', 10);

export interface DocumentoResumo {
  id: number;
  nome_original: string;
  mime_type: string;
  tamanho_bytes: number;
  status: 'processando' | 'concluido' | 'erro';
  erro_mensagem: string | null;
  total_cnaes: number;
  criado_em: string;
  processado_em: string | null;
}

export interface ClienteMatch {
  cliente_id: string | number;
  cnpj_limpo: string;
  razao_social: string;
  cnae_match: string;
  origem_cnae: 'principal' | 'secundario';
  denominacao: string | null;
  grau_risco: string | null;
  compreende_atuacao: string | null;
  condicao_classificacao_risco: string | null;
  orgao_vigilancia: string | null;
  descricao: string | null;
  trecho: string | null;
  documento_id: number;
  documento_nome: string;
}

export interface CnaeExtraido {
  cnae_original: string;
  cnae_normalizado: string;
  denominacao: string | null;
  grau_risco: string | null;
  compreende_atuacao: string | null;
  condicao_classificacao_risco: string | null;
  orgao_vigilancia: string | null;
  descricao: string | null;
  trecho: string | null;
}

export interface ListagemClientesResult {
  items: ClienteMatch[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface ListagemDocumentosResult {
  items: DocumentoResumo[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// ─── Parsing PDF/DOCX para texto/markdown ───

async function pdfBufferToText(buffer: Buffer): Promise<string> {
  if (typeof pdfParseLegacy === 'function') {
    const result = await pdfParseLegacy(buffer);
    return result?.text ?? '';
  }
  if (PDFParse && typeof PDFParse === 'function') {
    const parser = new PDFParse({ data: buffer });
    const r = await parser.getText();
    return (r && typeof r === 'object' && 'text' in r) ? String((r as any).text ?? '') : '';
  }
  throw new Error('pdf-parse nao disponivel');
}

async function docxBufferToText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

export async function extrairMarkdownDoArquivo(buffer: Buffer, mimeType: string, nomeOriginal: string): Promise<string> {
  const ext = (nomeOriginal.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    const texto = await pdfBufferToText(buffer);
    return texto.trim();
  }
  if (ext === 'docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return (await docxBufferToText(buffer)).trim();
  }
  throw new Error(`Formato nao suportado: ${nomeOriginal}`);
}

// ─── Extracao de CNAEs via Claude ───

const SYSTEM_PROMPT = `Voce extrai dados de tabelas/anexos de legislacao fiscal brasileira que classificam CNAEs (Subclasses CNAE 2.x) — tipicamente Vigilancia Sanitaria, Meio Ambiente, Bombeiros, etc.

Para CADA linha de CNAE/subclasse na legislacao, extraia os seguintes campos:
- "cnae": codigo CNAE como aparece no texto (ex.: "1091-1/02", "4637-1/99", "47.21-1-02")
- "denominacao": nome/titulo da atividade economica (ex.: "Fabricacao de produtos de padaria...")
- "grau_risco": nivel ou grau de risco quando presente (ex.: "Nivel de Risco I", "Nivel de Risco II", "Baixo", "Medio", "Alto", "Dispensado"). Se nao houver, null.
- "compreende_atuacao": texto que descreve o escopo/atuacao do orgao para essa atividade
- "condicao_classificacao_risco": condicoes ou criterios para a classificacao do risco (ex.: producao predominantemente propria, area construida, etc.)
- "orgao_vigilancia": orgao competente ou status de licenciamento (ex.: "Dispensado de Licenciamento Sanitario", "Vigilancia Sanitaria Municipal")
- "descricao": resumo curto da atividade (fallback de uma linha)
- "trecho": trecho da legislacao (1-3 frases) onde a entrada aparece

Regras:
- Identifique CNAEs em qualquer formato e em qualquer secao do documento (anexos, tabelas, listas).
- Quando um campo nao estiver presente para aquela linha, use null. NAO invente.
- Inclua TODOS os CNAEs do documento — nao agrupe nem resuma multiplas linhas em uma so.
- Se o mesmo CNAE aparecer em tabelas/grupos diferentes (ex.: Nivel I e Nivel II), registre cada ocorrencia separadamente.
- Seja conciso nos campos texto (especialmente compreende_atuacao e trecho) — limite a ~500 caracteres por campo.

Saida: APENAS um array JSON valido. Sem comentarios, sem markdown, sem prefixos, sem texto antes ou depois.
Formato exato (uma linha por entrada e claro, mas pode ser pretty-printed):
[{"cnae":"1091-1/02","denominacao":"Fabricacao de produtos de padaria...","grau_risco":"Nivel de Risco I","compreende_atuacao":"...","condicao_classificacao_risco":null,"orgao_vigilancia":"Dispensado de Licenciamento Sanitario","descricao":"Padaria com producao propria","trecho":"..."}]

Se nao houver nenhum CNAE no documento, retorne [].`;

/**
 * Parseia um array JSON do LLM, resiliente a truncamento por max_tokens.
 * Se o JSON estiver completo, retorna direto. Se truncado, recupera os
 * objetos completos varrendo o conteudo e ignorando o ultimo (incompleto).
 */
function extractJsonArray(raw: string): any[] {
  let body = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const first = body.indexOf('[');
  if (first < 0) throw new Error('Resposta do LLM nao contem array JSON');
  body = body.slice(first);

  // Tentativa 1: parse direto se o array esta fechado
  const lastBracket = body.lastIndexOf(']');
  if (lastBracket > 0) {
    try {
      const parsed = JSON.parse(body.slice(0, lastBracket + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
  }

  // Tentativa 2: salvage — varre e extrai cada objeto {...} no topo do array
  const items: any[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 1; i < body.length; i++) {
    const ch = body[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        const objStr = body.slice(start, i + 1);
        try { items.push(JSON.parse(objStr)); } catch { /* skip malformado */ }
        start = -1;
      }
    } else if (ch === ']' && depth === 0) {
      break;
    }
  }
  if (items.length === 0) throw new Error('Nao foi possivel recuperar nenhum item do JSON do LLM');
  return items;
}

function normalizarCnae(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.slice(0, 7);
}

export async function extrairCnaesViaLlm(markdown: string, documentoId?: number): Promise<CnaeExtraido[]> {
  const apiKey = process.env['CLAUDE_TOKEN_API'] || process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('Chave Claude nao definida no .env (CLAUDE_TOKEN_API ou ANTHROPIC_API_KEY)');

  const client = new Anthropic({ apiKey });
  // Streaming e obrigatorio para requests que podem passar de 10 min (decretos longos).
  // .finalMessage() agrega todos os deltas e devolve a Message completa.
  const stream = client.messages.stream({
    model: LLM_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Extraia os CNAEs do seguinte documento de legislacao:\n\n${markdown}`,
      },
    ],
  });

  if (documentoId) {
    // Encaminha progresso parcial pro SSE: a cada ~1s ou +5k chars,
    // conta quantos `"cnae":` ja apareceram (= entradas parciais)
    let accumulated = '';
    let lastEmitAt = 0;
    let lastEmitLen = 0;
    stream.on('text', (delta: string) => {
      accumulated += delta;
      const now = Date.now();
      if (now - lastEmitAt >= 1000 || accumulated.length - lastEmitLen >= 5000) {
        const cnaes_parciais = (accumulated.match(/"cnae"\s*:/g) || []).length;
        emitProgress(documentoId, {
          phase: 'llm_progress',
          chars_received: accumulated.length,
          cnaes_parciais,
        });
        lastEmitAt = now;
        lastEmitLen = accumulated.length;
      }
    });
  }

  const response = await stream.finalMessage();

  const textBlock = response.content.find((b: any) => b.type === 'text') as { type: 'text'; text: string } | undefined;
  if (!textBlock) throw new Error('Resposta do LLM vazia');

  if ((response as any).stop_reason === 'max_tokens') {
    console.warn('[ESTUDO_VIABILIDADE] LLM truncou em max_tokens — recuperando objetos completos.');
  }

  const arr = extractJsonArray(textBlock.text);
  const norm = (v: any): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
  };

  const seen = new Set<string>();
  const items: CnaeExtraido[] = [];

  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const cnae_original = String((it as any).cnae || '').trim();
    if (!cnae_original) continue;
    const cnae_normalizado = normalizarCnae(cnae_original);
    if (cnae_normalizado.length < 5) continue;

    const grau_risco = norm((it as any).grau_risco);
    // Deduplica por (cnae + grau de risco + trecho curto) — mesmo CNAE pode aparecer em tabelas com graus diferentes
    const dedupeKey = `${cnae_normalizado}|${grau_risco || ''}|${String((it as any).trecho || '').slice(0, 60)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    items.push({
      cnae_original,
      cnae_normalizado,
      denominacao:                  norm((it as any).denominacao),
      grau_risco,
      compreende_atuacao:           norm((it as any).compreende_atuacao),
      condicao_classificacao_risco: norm((it as any).condicao_classificacao_risco),
      orgao_vigilancia:             norm((it as any).orgao_vigilancia),
      descricao:                    norm((it as any).descricao),
      trecho:                       norm((it as any).trecho),
    });
  }

  return items;
}

// ─── Persistencia ───

export async function criarDocumentoProcessando(nomeOriginal: string, mimeType: string, tamanhoBytes: number): Promise<number> {
  const [result] = await mysqlPool.query<any>(
    `INSERT INTO estudo_viabilidade_documentos
       (nome_original, mime_type, tamanho_bytes, status)
     VALUES (?, ?, ?, 'processando')`,
    [nomeOriginal, mimeType, tamanhoBytes],
  );
  return Number(result.insertId);
}

export async function marcarDocumentoConcluido(documentoId: number, markdown: string, totalCnaes: number): Promise<void> {
  await mysqlPool.query(
    `UPDATE estudo_viabilidade_documentos
        SET markdown = ?, status = 'concluido', total_cnaes = ?, processado_em = NOW(), erro_mensagem = NULL
      WHERE id = ?`,
    [markdown, totalCnaes, documentoId],
  );
}

export async function marcarDocumentoErro(documentoId: number, mensagem: string): Promise<void> {
  await mysqlPool.query(
    `UPDATE estudo_viabilidade_documentos
        SET status = 'erro', erro_mensagem = ?, processado_em = NOW()
      WHERE id = ?`,
    [String(mensagem).slice(0, 4000), documentoId],
  );
}

export async function inserirCnaes(documentoId: number, cnaes: CnaeExtraido[]): Promise<void> {
  if (cnaes.length === 0) return;
  // Inserir em batches para evitar 'max_allowed_packet' em casos extremos
  const BATCH = 200;
  for (let i = 0; i < cnaes.length; i += BATCH) {
    const slice = cnaes.slice(i, i + BATCH);
    const values: any[] = [];
    const placeholders: string[] = [];
    for (const c of slice) {
      placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      values.push(
        documentoId,
        c.cnae_original,
        c.cnae_normalizado,
        c.denominacao,
        c.grau_risco,
        c.compreende_atuacao,
        c.condicao_classificacao_risco,
        c.orgao_vigilancia,
        c.descricao,
        c.trecho,
      );
    }
    await mysqlPool.query(
      `INSERT INTO estudo_viabilidade_cnaes
         (documento_id, cnae_original, cnae_normalizado,
          denominacao, grau_risco, compreende_atuacao,
          condicao_classificacao_risco, orgao_vigilancia,
          descricao, trecho)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
  }
}

// ─── Orquestracao do processamento ───

export async function processarDocumentoEmBackground(documentoId: number, buffer: Buffer, mimeType: string, nomeOriginal: string): Promise<void> {
  try {
    emitProgress(documentoId, { phase: 'parse', message: `Extraindo texto de ${nomeOriginal}...` });
    const markdown = await extrairMarkdownDoArquivo(buffer, mimeType, nomeOriginal);
    if (!markdown) {
      const msg = 'Documento vazio ou nao foi possivel extrair texto';
      emitProgress(documentoId, { phase: 'error', message: msg });
      await marcarDocumentoErro(documentoId, msg);
      return;
    }
    emitProgress(documentoId, { phase: 'llm_start', message: 'Identificando CNAEs via Claude...', model: LLM_MODEL });
    const cnaes = await extrairCnaesViaLlm(markdown, documentoId);
    emitProgress(documentoId, { phase: 'persist', total: cnaes.length });
    await inserirCnaes(documentoId, cnaes);
    await marcarDocumentoConcluido(documentoId, markdown, cnaes.length);
    emitProgress(documentoId, { phase: 'done', total_cnaes: cnaes.length });
    console.log(`[ESTUDO_VIABILIDADE] Documento ${documentoId} processado: ${cnaes.length} CNAEs`);
  } catch (error: any) {
    const msg = error?.message || 'Erro desconhecido';
    console.error(`[ESTUDO_VIABILIDADE] Erro processando doc ${documentoId}:`, error);
    emitProgress(documentoId, { phase: 'error', message: msg });
    try { await marcarDocumentoErro(documentoId, msg); } catch {}
  }
}

// ─── Listagens ───

export async function listarDocumentos(page = 1, limit = 50): Promise<ListagemDocumentosResult> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(200, limit));
  const offset = (safePage - 1) * safeLimit;

  const [countRows] = await mysqlPool.query<any[]>(
    `SELECT COUNT(*) AS total FROM estudo_viabilidade_documentos`,
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await mysqlPool.query<any[]>(
    `SELECT id, nome_original, mime_type, tamanho_bytes, status, erro_mensagem,
            total_cnaes, criado_em, processado_em
       FROM estudo_viabilidade_documentos
      ORDER BY criado_em DESC
      LIMIT ${safeLimit} OFFSET ${offset}`,
  );

  return {
    items: rows as DocumentoResumo[],
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

export async function obterStatusDocumento(documentoId: number): Promise<DocumentoResumo | null> {
  const [rows] = await mysqlPool.query<any[]>(
    `SELECT id, nome_original, mime_type, tamanho_bytes, status, erro_mensagem,
            total_cnaes, criado_em, processado_em
       FROM estudo_viabilidade_documentos WHERE id = ? LIMIT 1`,
    [documentoId],
  );
  return (rows[0] as DocumentoResumo) || null;
}

export async function excluirDocumento(documentoId: number): Promise<boolean> {
  const [result] = await mysqlPool.query<any>(
    `DELETE FROM estudo_viabilidade_documentos WHERE id = ?`,
    [documentoId],
  );
  return Number(result?.affectedRows || 0) > 0;
}

// ─── Cruzamento clientes x CNAEs (principal + secundarios) ───

export async function listarCidadesComClientes(query: string, limit = 20): Promise<Array<{ municipio: string; uf: string | null; total: number }>> {
  const q = String(query || '').trim();
  const safeLimit = Math.max(1, Math.min(50, limit));
  const params: any[] = [];
  let where = `WHERE c.ativo = 1 AND c.municipio IS NOT NULL AND c.municipio <> ''`;
  if (q) {
    where += ` AND c.municipio LIKE ?`;
    params.push(`%${q}%`);
  }
  const [rows] = await mysqlPool.query<any[]>(
    `SELECT c.municipio, c.uf, COUNT(*) AS total
       FROM clientes c
       ${where}
      GROUP BY c.municipio, c.uf
      ORDER BY total DESC, c.municipio ASC
      LIMIT ${safeLimit}`,
    params,
  );
  return rows as Array<{ municipio: string; uf: string | null; total: number }>;
}

export async function listarClientesPorLegislacao(opts: {
  cnpj?: string;
  nome?: string;
  municipio?: string;
  documentoId?: number;
  page?: number;
  limit?: number;
}): Promise<ListagemClientesResult> {
  const safePage = Math.max(1, opts.page || 1);
  const safeLimit = Math.max(1, Math.min(200, opts.limit || 50));
  const offset = (safePage - 1) * safeLimit;

  const where: string[] = [`d.status = 'concluido'`];
  const params: any[] = [];

  if (opts.documentoId) {
    where.push(`d.id = ?`);
    params.push(opts.documentoId);
  }
  if (opts.cnpj) {
    where.push(`c.cnpj_limpo LIKE ?`);
    params.push(`%${String(opts.cnpj).replace(/\D/g, '')}%`);
  }
  if (opts.nome) {
    where.push(`c.razao_social LIKE ?`);
    params.push(`%${opts.nome}%`);
  }
  if (opts.municipio) {
    where.push(`c.municipio = ?`);
    params.push(opts.municipio);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // Buscar matches: CNAE principal (REGEXP_REPLACE para normalizar) OU dentro de atividades_secundarias (LIKE no JSON).
  // Como atividades_secundarias e armazenado como JSON string, usamos LIKE com padrao "code":"<digits>".
  // Subquery distinct por (cliente_id, cnae_norm, doc_id) para nao multiplicar resultados quando ha trechos repetidos.
  const baseFromJoin = `
    FROM estudo_viabilidade_cnaes ec
    JOIN estudo_viabilidade_documentos d ON d.id = ec.documento_id
    JOIN clientes c ON (
         REPLACE(REPLACE(IFNULL(c.atividade_principal_code, ''), '.', ''), '-', '') = ec.cnae_normalizado
      OR REPLACE(REPLACE(IFNULL(c.atividade_principal_code, ''), '.', ''), '/', '') = ec.cnae_normalizado
      OR REPLACE(REPLACE(REPLACE(IFNULL(c.atividade_principal_code, ''), '.', ''), '-', ''), '/', '') = ec.cnae_normalizado
      OR c.atividades_secundarias LIKE CONCAT('%', ec.cnae_normalizado, '%')
    )
    AND c.ativo = 1
  `;

  const [countRows] = await mysqlPool.query<any[]>(
    `SELECT COUNT(*) AS total FROM (
       SELECT DISTINCT c.id, ec.cnae_normalizado, d.id AS doc_id
       ${baseFromJoin}
       ${whereSql}
     ) t`,
    params,
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await mysqlPool.query<any[]>(
    `SELECT c.id AS cliente_id,
            c.cnpj_limpo,
            c.razao_social,
            ec.cnae_original AS cnae_match,
            CASE
              WHEN REPLACE(REPLACE(REPLACE(IFNULL(c.atividade_principal_code, ''), '.', ''), '-', ''), '/', '') = ec.cnae_normalizado
                THEN 'principal'
              ELSE 'secundario'
            END AS origem_cnae,
            ec.denominacao,
            ec.grau_risco,
            ec.compreende_atuacao,
            ec.condicao_classificacao_risco,
            ec.orgao_vigilancia,
            ec.descricao,
            ec.trecho,
            d.id AS documento_id,
            d.nome_original AS documento_nome
     ${baseFromJoin}
     ${whereSql}
     ORDER BY c.razao_social ASC, ec.id ASC
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params,
  );

  return {
    items: rows as ClienteMatch[],
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

/**
 * Pipeline de extração dinâmica (Task 10.2, PRD 8.7, RF-044 a RF-048)
 * Fluxo: obter texto → normalizar → aplicar regras (regex/posição) → validar → persistir em document_extracted_data.
 */

import { getConnection } from '../../config/mysql';
import type { PoolConnection } from 'mysql2/promise';

/** Limiar abaixo do qual o status vira REQUIRES_REVIEW (RF-047) */
const CONFIDENCE_THRESHOLD = 0.8;

export interface ExtractionConfigRow {
  id: number;
  doc_type: string;
  source: string | null;
  extrator_nome: string;
  tipo: string;
  parametros: Record<string, unknown> | null;
  campo_destino: string;
  versao_regra: number;
}

export interface DocumentInfo {
  id: number;
  doc_type: string;
  source: string | null;
}

/** Normaliza texto para extração: trim, colapsar espaços e quebras de linha */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Aplica extrator tipo regex; retorna valor, snippet e confidence */
function applyRegexExtractor(
  text: string,
  params: Record<string, unknown>
): { valor: string; valorNormalizado: string; snippet: string; confidence: number } | null {
  const pattern = (params['pattern'] ?? params['regex']) as string | undefined;
  if (!pattern) return null;

  const re = new RegExp(pattern, 'g');
  const m = re.exec(text);
  if (!m) return null;

  const fullMatch = m[0];
  const group = m[1] ?? fullMatch;
  const valor = typeof group === 'string' ? group.trim() : String(group).trim();
  const valorNormalizado = valor.replace(/\D/g, '').slice(0, 500) || valor.slice(0, 500);

  return {
    valor,
    valorNormalizado,
    snippet: fullMatch.slice(0, 2000),
    confidence: 1,
  };
}

/** Aplica uma regra de configuração ao texto normalizado */
function runExtractor(
  normalizedText: string,
  config: ExtractionConfigRow
): { valor: string; valorNormalizado: string; snippet: string; confidence: number } | null {
  if (config.tipo === 'regex' && config.parametros && typeof config.parametros === 'object') {
    return applyRegexExtractor(normalizedText, config.parametros as Record<string, unknown>);
  }
  return null;
}

/** Carrega documento por id (doc_type, source) */
async function loadDocument(conn: PoolConnection, documentId: number): Promise<DocumentInfo | null> {
  const [rows] = await conn.execute<any>(
    'SELECT id, doc_type, source FROM irpf_producao_documents WHERE id = ?',
    [documentId]
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) return null;
  return {
    id: row.id,
    doc_type: row.doc_type,
    source: row.source ?? null,
  };
}

/** Carrega regras ativas por doc_type e source (source opcional: NULL ou igual) */
async function loadConfig(
  conn: PoolConnection,
  docType: string,
  source: string | null
): Promise<ExtractionConfigRow[]> {
  const [rows] = await conn.execute<any>(
    `SELECT id, doc_type, source, extrator_nome, tipo, parametros, campo_destino, versao_regra
     FROM irpf_producao_document_extraction_config
     WHERE doc_type = ? AND ativo = 1
       AND (source IS NULL OR source = ?)
     ORDER BY id`,
    [docType, source ?? null]
  );
  const list = Array.isArray(rows) ? rows : [];
  return list.map((r: any) => ({
    id: r.id,
    doc_type: r.doc_type,
    source: r.source ?? null,
    extrator_nome: r.extrator_nome,
    tipo: r.tipo,
    parametros: r.parametros != null ? (typeof r.parametros === 'string' ? JSON.parse(r.parametros) : r.parametros) : null,
    campo_destino: r.campo_destino,
    versao_regra: r.versao_regra,
  }));
}

/**
 * Executa o pipeline para um documento: carrega regras, aplica extratores, persiste em
 * document_extracted_data e atualiza extraction_status.
 * Se não houver regras para o doc_type/source, grava raw_text no documento e define status
 * EXTRACTED (Task 10.3), sem inserir em document_extracted_data.
 */
export async function runExtractionPipeline(documentId: number, rawText: string): Promise<void> {
  const conn = await getConnection();
  try {
    const doc = await loadDocument(conn, documentId);
    if (!doc) {
      throw new Error(`Documento ${documentId} não encontrado`);
    }

    const configs = await loadConfig(conn, doc.doc_type, doc.source);

    if (configs.length === 0) {
      await conn.execute(
        `UPDATE irpf_producao_documents
         SET raw_text = ?, extraction_status = 'EXTRACTED', extraction_attempts = extraction_attempts + 1
         WHERE id = ?`,
        [rawText.slice(0, 16_777_215), documentId]
      );
      return;
    }

    const normalizedText = normalizeText(rawText);

    await conn.execute(
      'DELETE FROM irpf_producao_document_extracted_data WHERE document_id = ?',
      [documentId]
    );

    let minConfidence = 1;
    for (const config of configs) {
      const result = runExtractor(normalizedText, config);
      if (result) {
        if (result.confidence < minConfidence) minConfidence = result.confidence;
        await conn.execute(
          `INSERT INTO irpf_producao_document_extracted_data
           (document_id, rule_version, config_id, campo_destino, valor_extraido, valor_normalizado, confidence_score, raw_snippet)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            documentId,
            config.versao_regra,
            config.id,
            config.campo_destino,
            result.valor.slice(0, 65535),
            result.valorNormalizado.slice(0, 500),
            result.confidence,
            result.snippet.slice(0, 65535),
          ]
        );
      }
    }

    const extractionStatus = minConfidence >= CONFIDENCE_THRESHOLD ? 'EXTRACTED' : 'REQUIRES_REVIEW';
    await conn.execute(
      `UPDATE irpf_producao_documents
       SET raw_text = ?, extraction_status = ?, extraction_attempts = extraction_attempts + 1
       WHERE id = ?`,
      [rawText.slice(0, 16_777_215), extractionStatus, documentId]
    );
  } finally {
    conn.release();
  }
}

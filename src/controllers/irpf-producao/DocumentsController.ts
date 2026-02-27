/**
 * Controller: Upload de documentos IRPF Produção (Task 6, PRD 8.6)
 * Validação MIME/tamanho, metadados, deduplicação, persistência atômica.
 */

import { Request, Response } from 'express';
import { join } from 'path';
import { getConnection, executeQuery } from '../../config/mysql';
import { resolveCasePath, ensureSubfolders, saveFileAtomically, computeSha256 } from '../../services/irpf-producao/storage';
import { classifyExtractionFlow } from '../../services/irpf-producao/extraction-flow';
import { enqueueExtractText } from '../../services/irpf-producao/enqueue-extract-text';
import { getOcrWebhookConfig, buildOcrWebhookPayload, notifyOcrWebhook } from '../../services/irpf-producao/ocr-webhook';
import { readFile } from 'fs/promises';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB (PRD 8.4)
const ALLOWED_MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
const ALLOWED_DOC_TYPES = ['CADASTRO', 'INF_REND', 'INF_BANC', 'INF_INV', 'SAUDE', 'EDUC', 'PENSAO', 'DEPENDENTES', 'ALUGUEL', 'BENS_AQUIS', 'BENS_VENDA', 'DIVIDAS', 'EXTERIOR', 'RV_GCAP', 'PROTOCOLO', 'DEC_GERADO', 'OUTROS']; // PRD 8.3

/** Mapeamento docType (8.3) → subpasta (8.1) */
const DOC_TYPE_TO_SUBFOLDER: Record<string, string> = {
  CADASTRO: '00_cadastro',
  INF_REND: '01_rendimentos',
  INF_BANC: '02_bancos',
  INF_INV: '03_investimentos',
  SAUDE: '04_saude',
  EDUC: '05_educacao',
  PENSAO: '06_pensao_dependentes',
  DEPENDENTES: '06_pensao_dependentes',
  ALUGUEL: '07_bens_direitos',
  BENS_AQUIS: '07_bens_direitos',
  BENS_VENDA: '07_bens_direitos',
  DIVIDAS: '08_dividas_onus',
  EXTERIOR: '09_especiais',
  RV_GCAP: '09_especiais',
  PROTOCOLO: '10_protocolos',
  DEC_GERADO: '11_dec',
  OUTROS: '99_auditoria',
};

function getExtension(mimetype: string): string {
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype === 'image/png') return 'png';
  if (mimetype === 'image/jpeg' || mimetype === 'image/jpg') return 'jpg';
  if (mimetype === 'image/gif') return 'gif';
  if (mimetype === 'image/webp') return 'webp';
  return 'bin';
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParseModule = require('pdf-parse');
const pdfParseLegacy = typeof pdfParseModule === 'function' ? pdfParseModule : pdfParseModule?.default;
const PDFParse = pdfParseModule?.PDFParse;

/** Valida PDF: retorna { numpages } ou lança em caso de corrupção. */
async function validatePdf(buffer: Buffer): Promise<{ numpages: number }> {
  if (typeof pdfParseLegacy === 'function') {
    const result = await pdfParseLegacy(buffer);
    const numpages = result?.numpages ?? (result && typeof result === 'object' && 'numpages' in result ? (result as { numpages?: number }).numpages : undefined);
    return { numpages: typeof numpages === 'number' ? numpages : 0 };
  }
  if (PDFParse && typeof PDFParse === 'function') {
    const parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    const numpages = data?.numpages ?? (data && typeof data === 'object' && 'numpages' in data ? (data as { numpages?: number }).numpages : undefined);
    return { numpages: typeof numpages === 'number' ? numpages : 0 };
  }
  throw new Error('pdf-parse não disponível');
}

export class DocumentsController {
  /** POST /api/irpf-producao/cases/:id/documents - Upload com validação em camadas */
  async upload(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido', code: 'INVALID_CASE_ID' });

      const file = (req as any).file;
      if (!file) return res.status(400).json({ success: false, error: 'Arquivo obrigatório', code: 'DOC_TYPE_REQUIRED' });

      if (!ALLOWED_MIMES.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          error: 'Tipo de arquivo não permitido. Use PDF ou imagem.',
          code: 'DOC_MIME_NOT_ALLOWED'
        });
      }

      if (file.size > MAX_FILE_SIZE) {
        return res.status(400).json({
          success: false,
          error: 'Arquivo excede o tamanho máximo permitido (50 MB).',
          code: 'DOC_SIZE_EXCEEDED'
        });
      }

      const { docType, source } = req.body || {};
      if (!docType || !source) {
        return res.status(400).json({
          success: false,
          error: 'docType e source são obrigatórios',
          code: 'DOC_TYPE_REQUIRED'
        });
      }
      if (!ALLOWED_DOC_TYPES.includes(String(docType).trim())) {
        return res.status(400).json({
          success: false,
          error: 'docType deve ser um valor da lista fechada (8.3).',
          code: 'DOC_TYPE_REQUIRED'
        });
      }

      if (file.mimetype === 'application/pdf') {
        try {
          const { numpages } = await validatePdf(file.buffer);
          if (!numpages || numpages < 1) {
            return res.status(400).json({
              success: false,
              error: 'PDF sem páginas ou vazio.',
              code: 'DOC_EMPTY'
            });
          }
        } catch (_) {
          return res.status(400).json({
            success: false,
            error: 'Arquivo PDF corrompido ou inválido.',
            code: 'DOC_CORRUPTED'
          });
        }
      }

      const conn = await getConnection();
      try {
        const [cases] = await conn.execute('SELECT id, case_code, exercicio FROM irpf_producao_cases WHERE id = ?', [id]);
        const caseRow = (Array.isArray(cases) ? cases[0] : null) as { id: number; case_code: string; exercicio: number } | null;
        if (!caseRow) {
          return res.status(404).json({ success: false, error: 'Case não encontrado', code: 'CASE_NOT_FOUND' });
        }

        const docTypeStr = String(docType).trim();
        const sourceStr = String(source).trim();
        const sha256 = computeSha256(file.buffer);

        const [existing] = await conn.execute('SELECT id, file_path, version FROM irpf_producao_documents WHERE case_id = ? AND sha256 = ? ORDER BY version DESC LIMIT 1', [id, sha256]);
        const existingDoc = (Array.isArray(existing) ? existing[0] : null) as { id: number; file_path: string; version: number } | null;

        let file_path: string;
        let version: number;

        if (existingDoc) {
          file_path = existingDoc.file_path;
          const [maxV] = await conn.execute('SELECT COALESCE(MAX(version),0) + 1 AS v FROM irpf_producao_documents WHERE case_id = ? AND doc_type = ? AND source = ?', [id, docTypeStr, sourceStr]);
          version = Array.isArray(maxV) && maxV[0] ? Number((maxV[0] as { v: number }).v) : 1;
        } else {
          const casePath = resolveCasePath(caseRow.exercicio, caseRow.case_code);
          await ensureSubfolders(casePath);
          const subfolder = DOC_TYPE_TO_SUBFOLDER[docTypeStr] ?? '99_auditoria';
          const dir = join(casePath, subfolder);
          const date = new Date().toISOString().slice(0, 10);
          const [maxV] = await conn.execute('SELECT COALESCE(MAX(version),0) + 1 AS v FROM irpf_producao_documents WHERE case_id = ? AND doc_type = ? AND source = ?', [id, docTypeStr, sourceStr]);
          version = Array.isArray(maxV) && maxV[0] ? Number((maxV[0] as { v: number }).v) : 1;
          const ext = getExtension(file.mimetype);
          const filename = `${caseRow.exercicio}_${caseRow.case_code}_${docTypeStr}_${sourceStr.replace(/[^a-zA-Z0-9_-]/g, '_')}_${date}_v${version}.${ext}`;
          try {
            file_path = await saveFileAtomically(dir, filename, file.buffer);
          } catch (err: any) {
            console.error('[IRPF Produção] saveFileAtomically:', err);
            return res.status(500).json({ success: false, error: 'Falha ao gravar arquivo.', code: 'STORAGE_WRITE_FAILED' });
          }
        }

        const [insertResult] = await conn.execute(
          `INSERT INTO irpf_producao_documents (case_id, doc_type, source, version, sha256, file_path, file_size, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, docTypeStr, sourceStr, version, sha256, file_path, file.size, (req as any).user?.id ?? (req as any).user?.email ?? null]
        );
        const document_id = Number((insertResult as { insertId: number }).insertId);

        const extractionFlow = classifyExtractionFlow(file.mimetype);
        await conn.execute(
          `UPDATE irpf_producao_documents SET extraction_status = 'PENDING', extraction_flow = ? WHERE id = ?`,
          [extractionFlow, document_id]
        );
        let ocrConfig: ReturnType<typeof getOcrWebhookConfig> = null;
        let ocrOk = false;
        if (extractionFlow === 'NATIVE_TEXT') {
          await enqueueExtractText(document_id, { caseId: id });
          await conn.execute(
            `UPDATE irpf_producao_documents SET extraction_status = 'EXTRACTING' WHERE id = ?`,
            [document_id]
          );
        } else if (extractionFlow === 'OCR_WEBHOOK') {
          ocrConfig = getOcrWebhookConfig();
          if (ocrConfig?.webhookUrl && ocrConfig?.appBaseUrl) {
            const payload = buildOcrWebhookPayload(document_id, ocrConfig.appBaseUrl, docTypeStr, sourceStr);
            const result = await notifyOcrWebhook(payload, ocrConfig);
            ocrOk = result.ok;
            await conn.execute(
              `UPDATE irpf_producao_documents SET extraction_status = ? WHERE id = ?`,
              [ocrOk ? 'EXTRACTING' : 'EXTRACTION_ERROR', document_id]
            );
            if (!ocrOk) {
              await conn.execute(
                `UPDATE irpf_producao_documents SET extraction_error_message = ?, extraction_attempts = extraction_attempts + 1 WHERE id = ?`,
                [result.lastError?.slice(0, 65535) ?? 'Webhook OCR falhou', document_id]
              );
            }
          } else {
            await conn.execute(
              `UPDATE irpf_producao_documents SET extraction_status = 'EXTRACTION_ERROR', extraction_error_message = ? WHERE id = ?`,
              ['Webhook OCR não configurado (IRPF_OCR_WEBHOOK_URL / IRPF_APP_BASE_URL)', document_id]
            );
          }
        }

        const actor = (req as any).user?.email ?? (req as any).user?.id ?? (req as any).irpfAuth?.userId ?? req.headers['x-user-id'] ?? null;
        await executeQuery(
          `INSERT INTO irpf_producao_audit_events (case_id, event_type, actor, payload)
           VALUES (?, 'document_upload', ?, ?)`,
          [id, actor, JSON.stringify({ document_id, doc_type: docTypeStr, source: sourceStr, version, file_path, deduplicated: !!existingDoc, extraction_flow: extractionFlow })]
        );

        let responseExtractionStatus = extractionFlow === 'NATIVE_TEXT' ? 'EXTRACTING' : (extractionFlow === 'OCR_WEBHOOK' ? (ocrConfig?.webhookUrl && ocrConfig?.appBaseUrl ? (ocrOk ? 'EXTRACTING' : 'EXTRACTION_ERROR') : 'EXTRACTION_ERROR') : 'PENDING');
        return res.status(201).json({
          success: true,
          document_id,
          file_path,
          version,
          deduplicated: !!existingDoc,
          extraction_status: responseExtractionStatus,
          extraction_flow: extractionFlow,
        });
      } finally {
        conn.release();
      }
    } catch (error: any) {
      console.error('[IRPF Produção] documents upload:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro no upload' });
    }
  }

  /** POST /api/irpf-producao/documents/process-callback — Callback do webhook OCR (Task 12, 8.9, idempotente) */
  async processCallback(req: Request, res: Response) {
    try {
      const body = req.body as {
        document_id?: number;
        status?: string;
        extracted_fields?: Array<{ campo_destino: string; valor_extraido?: string; valor_normalizado?: string; confidence_score?: number }>;
        raw_text?: string;
        error_message?: string;
      };
      const documentId = body?.document_id != null ? Number(body.document_id) : NaN;
      if (!Number.isInteger(documentId) || documentId < 1) {
        return res.status(400).json({ success: false, error: 'document_id obrigatório e deve ser inteiro positivo', code: 'INVALID_PAYLOAD' });
      }
      const status = String(body?.status ?? '').toLowerCase();
      if (status !== 'success' && status !== 'error') {
        return res.status(400).json({ success: false, error: 'status deve ser success ou error', code: 'INVALID_PAYLOAD' });
      }

      const conn = await getConnection();
      try {
        const [rows] = await conn.execute<any>('SELECT id, extraction_flow FROM irpf_producao_documents WHERE id = ?', [documentId]);
        const doc = Array.isArray(rows) ? rows[0] : rows;
        if (!doc) {
          return res.status(404).json({ success: false, error: 'Documento não encontrado', code: 'DOCUMENT_NOT_FOUND' });
        }

        const rawText = body.raw_text != null ? String(body.raw_text).slice(0, 16_777_215) : null;
        const errorMessage = body.error_message != null ? String(body.error_message).slice(0, 65535) : null;

        if (status === 'error') {
          await conn.execute(
            `UPDATE irpf_producao_documents SET extraction_status = 'EXTRACTION_ERROR', extraction_error_message = ?, raw_text = ?, extraction_attempts = extraction_attempts + 1 WHERE id = ?`,
            [errorMessage ?? 'OCR retornou erro', rawText, documentId]
          );
          return res.status(200).json({ success: true, document_id: documentId, status: 'error' });
        }

        await conn.execute(
          `UPDATE irpf_producao_documents SET extraction_status = 'EXTRACTED', extraction_error_message = NULL, raw_text = ?, extraction_attempts = extraction_attempts + 1 WHERE id = ?`,
          [rawText, documentId]
        );

        const fields = Array.isArray(body.extracted_fields) ? body.extracted_fields : [];
        if (fields.length > 0) {
          await conn.execute('DELETE FROM irpf_producao_document_extracted_data WHERE document_id = ?', [documentId]);
          const ruleVersion = 0;
          for (const f of fields) {
            const campo = String(f?.campo_destino ?? '').slice(0, 80);
            if (!campo) continue;
            const valor = (f?.valor_extraido != null ? String(f.valor_extraido) : '').slice(0, 65535);
            const normalizado = (f?.valor_normalizado != null ? String(f.valor_normalizado) : valor).slice(0, 500);
            const score = f?.confidence_score != null ? Math.min(1, Math.max(0, Number(f.confidence_score))) : null;
            await conn.execute(
              `INSERT INTO irpf_producao_document_extracted_data (document_id, rule_version, config_id, campo_destino, valor_extraido, valor_normalizado, confidence_score) VALUES (?, ?, NULL, ?, ?, ?, ?)`,
              [documentId, ruleVersion, campo, valor, normalizado, score]
            );
          }
        }

        return res.status(200).json({ success: true, document_id: documentId, status: 'success' });
      } finally {
        conn.release();
      }
    } catch (error: any) {
      console.error('[IRPF Produção] process-callback:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro no callback' });
    }
  }

  /** POST /api/irpf-producao/documents/:id/reprocess-extraction — Reprocessar extração (Task 13, RF-049a) */
  async reprocessExtraction(req: Request, res: Response) {
    const MAX_EXTRACTION_ATTEMPTS = parseInt(process.env['IRPF_MAX_EXTRACTION_ATTEMPTS'] || '10', 10) || 10;
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ success: false, error: 'ID de documento inválido', code: 'INVALID_DOCUMENT_ID' });
      }
      const conn = await getConnection();
      let doc: { id: number; case_id: number; extraction_status: string; extraction_flow: string; extraction_attempts: number; doc_type: string; source: string };
      try {
        const [rows] = await conn.execute<any>(
          'SELECT id, case_id, extraction_status, extraction_flow, extraction_attempts, doc_type, source FROM irpf_producao_documents WHERE id = ?',
          [id]
        );
        doc = Array.isArray(rows) ? rows[0] : rows;
      } finally {
        conn.release();
      }
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Documento não encontrado', code: 'DOCUMENT_NOT_FOUND' });
      }
      const status = String(doc.extraction_status || '');
      if (status !== 'EXTRACTION_ERROR' && status !== 'REQUIRES_REVIEW') {
        return res.status(400).json({
          success: false,
          error: 'Reprocessamento permitido apenas para documentos com status EXTRACTION_ERROR ou REQUIRES_REVIEW',
          code: 'INVALID_STATUS',
        });
      }
      if (doc.extraction_attempts >= MAX_EXTRACTION_ATTEMPTS) {
        return res.status(400).json({
          success: false,
          error: `Limite de tentativas de extração atingido (${MAX_EXTRACTION_ATTEMPTS})`,
          code: 'MAX_ATTEMPTS_EXCEEDED',
        });
      }
      const flow = String(doc.extraction_flow || '');
      if (flow === 'NATIVE_TEXT') {
        await enqueueExtractText(id, { caseId: doc.case_id });
        const conn2 = await getConnection();
        try {
          await conn2.execute('UPDATE irpf_producao_documents SET extraction_status = ? WHERE id = ?', ['EXTRACTING', id]);
        } finally {
          conn2.release();
        }
        return res.status(200).json({ success: true, document_id: id, extraction_status: 'EXTRACTING', message: 'Reenfileirado para extração' });
      }
      if (flow === 'OCR_WEBHOOK') {
        const ocrConfig = getOcrWebhookConfig();
        if (!ocrConfig?.webhookUrl || !ocrConfig?.appBaseUrl) {
          return res.status(503).json({
            success: false,
            error: 'Webhook OCR não configurado (IRPF_OCR_WEBHOOK_URL / IRPF_APP_BASE_URL)',
            code: 'OCR_NOT_CONFIGURED',
          });
        }
        const payload = buildOcrWebhookPayload(id, ocrConfig.appBaseUrl, doc.doc_type || 'OUTROS', doc.source || '');
        const result = await notifyOcrWebhook(payload, ocrConfig);
        const conn2 = await getConnection();
        try {
          await conn2.execute(
            'UPDATE irpf_producao_documents SET extraction_status = ?, extraction_error_message = ? WHERE id = ?',
            [result.ok ? 'EXTRACTING' : 'EXTRACTION_ERROR', result.ok ? null : (result.lastError?.slice(0, 65535) ?? 'Webhook falhou'), id]
          );
          if (!result.ok) {
            await conn2.execute('UPDATE irpf_producao_documents SET extraction_attempts = extraction_attempts + 1 WHERE id = ?', [id]);
          }
        } finally {
          conn2.release();
        }
        return res.status(200).json({
          success: true,
          document_id: id,
          extraction_status: result.ok ? 'EXTRACTING' : 'EXTRACTION_ERROR',
          message: result.ok ? 'Webhook OCR acionado' : (result.lastError || 'Falha ao notificar webhook'),
        });
      }
      return res.status(400).json({
        success: false,
        error: 'Fluxo de extração não suportado para reprocessamento',
        code: 'INVALID_FLOW',
      });
    } catch (error: any) {
      console.error('[IRPF Produção] reprocessExtraction:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao reprocessar' });
    }
  }

  /** GET /api/irpf-producao/documents/:id/file — Download do arquivo para o webhook OCR (8.9) */
  async getFile(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ success: false, error: 'ID inválido', code: 'INVALID_DOCUMENT_ID' });
      }
      const conn = await getConnection();
      let filePath: string;
      try {
        const [rows] = await conn.execute<any>(
          'SELECT d.file_path, d.doc_type, c.case_code FROM irpf_producao_documents d JOIN irpf_producao_cases c ON c.id = d.case_id WHERE d.id = ?',
          [id]
        );
        const row = Array.isArray(rows) ? rows[0] : rows;
        filePath = row?.file_path;
        const docType = row?.doc_type;
        const caseCode = row?.case_code;
        conn.release();
      } catch (e) {
        conn.release();
        throw e;
      }
      if (!filePath) {
        return res.status(404).json({ success: false, error: 'Documento ou arquivo não encontrado', code: 'FILE_NOT_FOUND' });
      }
      const buffer = await readFile(filePath);
      const ext = filePath.split('.').pop()?.toLowerCase() ?? 'bin';
      const contentType: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', dec: 'application/octet-stream' };
      res.setHeader('Content-Type', contentType[ext] || 'application/octet-stream');
      if (docType === 'DEC_GERADO' && caseCode) {
        const filename = `${String(caseCode).trim()}.dec`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      }
      res.send(buffer);
    } catch (error: any) {
      console.error('[IRPF Produção] getFile:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao obter arquivo' });
    }
  }
}

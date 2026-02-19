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
        if (extractionFlow === 'NATIVE_TEXT') {
          await enqueueExtractText(document_id, { caseId: id });
          await conn.execute(
            `UPDATE irpf_producao_documents SET extraction_status = 'EXTRACTING' WHERE id = ?`,
            [document_id]
          );
        }

        const actor = (req as any).user?.email ?? (req as any).user?.id ?? (req as any).irpfAuth?.userId ?? req.headers['x-user-id'] ?? null;
        await executeQuery(
          `INSERT INTO irpf_producao_audit_events (case_id, event_type, actor, payload)
           VALUES (?, 'document_upload', ?, ?)`,
          [id, actor, JSON.stringify({ document_id, doc_type: docTypeStr, source: sourceStr, version, file_path, deduplicated: !!existingDoc, extraction_flow: extractionFlow })]
        );

        return res.status(201).json({
          success: true,
          document_id,
          file_path,
          version,
          deduplicated: !!existingDoc,
          extraction_status: extractionFlow === 'NATIVE_TEXT' ? 'EXTRACTING' : 'PENDING',
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
}

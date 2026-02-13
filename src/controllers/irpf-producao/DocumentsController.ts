/**
 * Controller: Upload de documentos IRPF Produção (Task 6, PRD 8.6)
 * Validação MIME/tamanho, metadados, deduplicação, persistência atômica.
 */

import { Request, Response } from 'express';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB (PRD 8.4)
const ALLOWED_MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

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

      res.status(501).json({ success: false, error: 'Persistência ainda não implementada', code: 'NOT_IMPLEMENTED' });
    } catch (error: any) {
      console.error('[IRPF Produção] documents upload:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro no upload' });
    }
  }
}

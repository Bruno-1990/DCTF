/**
 * Classificação pós-upload: fluxo de extração (Task 11, RF-049, PRD 8.8)
 * NATIVE_TEXT = extração via Node (pdf-parse); OCR_WEBHOOK = fluxo externo OCR.
 */

export type ExtractionFlowType = 'NATIVE_TEXT' | 'OCR_WEBHOOK';

/** Classifica pelo MIME: PDF → Node (texto nativo); imagem → OCR externo. */
export function classifyExtractionFlow(mimetype: string): ExtractionFlowType {
  if (mimetype === 'application/pdf') return 'NATIVE_TEXT';
  if (mimetype?.startsWith('image/')) return 'OCR_WEBHOOK';
  return 'OCR_WEBHOOK';
}

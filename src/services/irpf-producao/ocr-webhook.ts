/**
 * Webhook OCR (Task 12, PRD 8.9, RNF-043)
 * POST ao webhook externo com document_id, file_url, callback_url; timeout e retry configuráveis.
 */

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // 15 min
const DEFAULT_MAX_RETRIES = 3;

export interface OcrWebhookConfig {
  webhookUrl: string;
  appBaseUrl: string;
  timeoutMs: number;
  maxRetries: number;
}

export function getOcrWebhookConfig(): OcrWebhookConfig | null {
  const webhookUrl = process.env['IRPF_OCR_WEBHOOK_URL']?.trim();
  if (!webhookUrl) return null;
  const appBaseUrl = process.env['IRPF_APP_BASE_URL']?.trim() || '';
  const timeoutMs = parseInt(process.env['IRPF_OCR_TIMEOUT_MS'] || String(DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS;
  const maxRetries = parseInt(process.env['IRPF_OCR_MAX_RETRIES'] || String(DEFAULT_MAX_RETRIES), 10) || DEFAULT_MAX_RETRIES;
  return { webhookUrl, appBaseUrl, timeoutMs, maxRetries };
}

/** Payload backend → webhook (contrato 8.9) */
export interface OcrWebhookPayload {
  document_id: number;
  file_url: string;
  callback_url: string;
  doc_type?: string;
  source?: string;
}

/** Monta file_url e callback_url e retorna o payload para o webhook. */
export function buildOcrWebhookPayload(
  documentId: number,
  appBaseUrl: string,
  docType?: string,
  source?: string
): OcrWebhookPayload {
  const base = appBaseUrl.replace(/\/$/, '');
  return {
    document_id: documentId,
    file_url: `${base}/api/irpf-producao/documents/${documentId}/file`,
    callback_url: `${base}/api/irpf-producao/documents/process-callback`,
    doc_type: docType,
    source: source,
  };
}

/** Envia POST ao webhook com retry e timeout. Retorna true se sucesso, false se esgotou tentativas. */
export async function notifyOcrWebhook(payload: OcrWebhookPayload, config: OcrWebhookConfig): Promise<{ ok: boolean; lastError?: string }> {
  const { webhookUrl, timeoutMs, maxRetries } = config;
  let lastError = '';
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) return { ok: true };
      lastError = `HTTP ${res.status} ${res.statusText}`;
    } catch (e: any) {
      lastError = e?.message ?? String(e);
    }
  }
  return { ok: false, lastError };
}

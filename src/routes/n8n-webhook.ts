/**
 * Rotas n8n: envio via webhook e retorno do link via HTTP Request.
 *
 * - Webhook: Botão → POST /api/n8n/send → n8n (processamento + email).
 * - Retorno do link: não é webhook; no n8n use o nó "HTTP Request" para chamar
 *   POST /api/n8n/document-ready com o link. Frontend consulta GET /api/n8n/result/:requestId.
 */

import { Router, Request, Response } from 'express';

const router = Router();

/** URL do webhook n8n – Test (hardcoded; .env N8N_WEBHOOK_URL sobrescreve se definido). */
const N8N_WEBHOOK_URL =
  process.env['N8N_WEBHOOK_URL']?.trim() ||
  'https://primary-production-dfb3.up.railway.app/webhook-test/e214fde3-b959-4996-bf12-f836aeaadb5c';

/** Armazena o link de retorno do n8n por requestId (em memória; TTL 1h). */
const documentResults = new Map<
  string,
  { downloadLink: string; documentId?: string; createdAt: number }
>();
const TTL_MS = 60 * 60 * 1000; // 1 hora

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, v] of documentResults.entries()) {
    if (now - v.createdAt > TTL_MS) documentResults.delete(id);
  }
}

/**
 * POST /api/n8n/document-ready
 * Recebe o link de retorno do n8n via nó HTTP Request (não é webhook).
 * No n8n: adicione um nó "HTTP Request" ao final do fluxo e aponte para esta URL.
 * Body esperado: { requestId: string, downloadLink: string, documentId?: string }
 */
router.post('/document-ready', (req: Request, res: Response) => {
  pruneExpired();
  const { requestId, downloadLink, documentId } = req.body || {};
  if (!requestId || !downloadLink) {
    return res.status(400).json({
      success: false,
      error: 'requestId e downloadLink são obrigatórios no body.',
    });
  }
  documentResults.set(String(requestId), {
    downloadLink: String(downloadLink),
    documentId: documentId != null ? String(documentId) : undefined,
    createdAt: Date.now(),
  });
  return res.status(200).json({ success: true, requestId: String(requestId) });
});

/**
 * GET /api/n8n/result/:requestId
 * Frontend consulta para obter o link de download após o n8n processar.
 */
router.get('/result/:requestId', (req: Request, res: Response) => {
  pruneExpired();
  const requestId = req.params['requestId'];
  if (!requestId) {
    return res.status(400).json({ success: false, error: 'requestId é obrigatório.' });
  }
  const stored = documentResults.get(requestId);
  if (!stored) {
    return res.status(404).json({
      success: false,
      error: 'Resultado não encontrado ou expirado.',
    });
  }
  return res.status(200).json({
    success: true,
    downloadLink: stored.downloadLink,
    documentId: stored.documentId,
  });
});

/**
 * GET /api/n8n/health
 * Confere se o módulo n8n está ativo e se o webhook está configurado (sem revelar a URL).
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    ok: true,
    webhookConfigured: !!N8N_WEBHOOK_URL.trim(),
    message: 'Use POST /api/n8n/send para enviar dados ao webhook n8n.',
  });
});

/**
 * POST /api/n8n/send
 * Body: qualquer JSON (será repassado ao n8n).
 * O nó "On form submission" no n8n recebe esse payload; os nós seguintes (Code, Gmail, etc.) usam os dados.
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');
    const data = isJson ? await response.json().catch(() => ({})) : await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: typeof data === 'string' ? data : (data as any)?.message || 'Erro no n8n',
        n8nStatus: response.status,
      });
    }

    return res.status(200).json({
      success: true,
      data: typeof data === 'string' ? { message: data } : data,
    });
  } catch (err: any) {
    console.error('[n8n-webhook] Erro ao chamar webhook:', err?.message || err);
    return res.status(502).json({
      success: false,
      error: err?.message || 'Falha ao comunicar com o n8n',
    });
  }
});

export default router;

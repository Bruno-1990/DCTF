/**
 * Serviço para enviar dados ao webhook n8n (hardcoded; não depende do backend nem de .env).
 * Use em botões/ações que devem disparar: processamento no n8n → envio de email.
 */

/** URL do webhook n8n – Test (hardcoded). No n8n, o nó Webhook deve estar em POST. */
const N8N_WEBHOOK_URL =
  'https://primary-production-dfb3.up.railway.app/webhook-test/e214fde3-b959-4996-bf12-f836aeaadb5c';

export type N8nSendPayload = Record<string, unknown> & {
  /** Ex.: email do destinatário (se o fluxo n8n usar) */
  email?: string;
  /** Ex.: nome ou identificador (para o n8n usar no corpo do email) */
  nome?: string;
  /** Qualquer outro campo que seu fluxo n8n esperar */
  [key: string]: unknown;
};

export type N8nSendResult = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
};

/**
 * Envia dados diretamente para o webhook n8n (POST em JSON).
 * No n8n, o nó Webhook recebe esse body; nós Code/Gmail usam os campos enviados.
 *
 * @param payload - Objeto com os dados (ex.: { nome, senha, maquinaLocal }). Será enviado como JSON.
 * @returns Resultado com success e data ou error.
 */
export async function sendToN8n(payload: N8nSendPayload): Promise<N8nSendResult> {
  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');
    const data = isJson ? await response.json().catch(() => ({})) : await response.text();

    if (!response.ok) {
      return {
        success: false,
        error: typeof data === 'string' ? data : (data as any)?.message || `Erro ${response.status}`,
      };
    }
    return {
      success: true,
      data: typeof data === 'string' ? { message: data } : (data as Record<string, unknown>),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Falha ao comunicar com o webhook n8n.',
    };
  }
}

export const n8nWebhookService = {
  sendToN8n,
};

/**
 * Configuração de acesso à API do Sistema Acessórias (REST, somente leitura aqui).
 * Doc: https://api.acessorias.com/documentation
 *
 * Autenticação é só Bearer token no header `Authorization` — não há endpoint de
 * login. O token é gerado no painel da Acessórias (engrenagem → "API Token") e é
 * POR CONTA: o token de outro escritório traria a carteira dele.
 *
 * Os nomes das variáveis são os mesmos já usados pela integração do ONECLICK V2
 * (`apps/api/src/acessorias/acessorias.service.ts`), para não divergir entre apps.
 */

export interface AcessoriasConfig {
  baseUrl: string;
  token: string;
  /** Opcional — só identificação/auditoria; não entra na autenticação. */
  user?: string;
}

/** Rate limit da API: 100 requisições/minuto (sliding window). */
export const ACESSORIAS_RATE_LIMIT_POR_MINUTO = 100;

/** Intervalo entre páginas na varredura, com folga sobre o rate limit. */
export const ACESSORIAS_INTERVALO_PAGINA_MS = 700;

/**
 * Lê a config do process.env. Lança erro claro se o token não estiver configurado
 * — o caller transforma isso em mensagem útil na tela.
 */
export function getAcessoriasConfig(): AcessoriasConfig {
  const raw = process.env['ACESSORIAS_API_URL']?.trim() || 'https://api.acessorias.com';
  // Aceita "api.acessorias.com" ou "https://api.acessorias.com" — fetch exige URL absoluta.
  const comProtocolo = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const baseUrl = comProtocolo.replace(/\/$/, '');

  const token = process.env['ACESSORIAS_API_TOKEN']?.trim();
  if (!token) {
    throw new Error(
      'ACESSORIAS_API_TOKEN não configurado. Gere o token no painel da Acessórias ' +
        '(engrenagem → "API Token") e preencha no .env.',
    );
  }

  const user = process.env['ACESSORIAS_USER']?.trim();
  return user ? { baseUrl, token, user } : { baseUrl, token };
}

/** Indica se o token está configurado, sem lançar — para o indicador do frontend. */
export function acessoriasConfigurada(): boolean {
  return Boolean(process.env['ACESSORIAS_API_TOKEN']?.trim());
}

/**
 * Headers para o servidor de token do SERPRO (Railway). Ele passou a exigir
 * a chave no header `x-api-key`: sem ela responde 401 e nenhuma consulta à
 * Receita sai (Situação Fiscal, Pagamentos, Integra Contador).
 */
export function headersServidorToken(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const apiKey = process.env['AUTH_TOKEN_API_KEY'];
  if (apiKey) headers['x-api-key'] = apiKey;
  return headers;
}

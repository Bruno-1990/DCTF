/**
 * Autenticação da Administração.
 *
 * Uma senha só (ADMIN_PASSWORD, no .env do servidor) troca por uma credencial assinada com
 * HMAC-SHA256 (ADMIN_TOKEN_SECRET) que vale ADMIN_TOKEN_TTL_MS. Sem usuários nem banco: trocar o
 * segredo derruba todas as sessões. Sem as duas variáveis, nada é aceito (falha fechada).
 *
 * Formato da credencial: base64url({"exp": <ms>}) + "." + base64url(hmac(payload)).
 */
import { createHash, createHmac, timingSafeEqual } from 'crypto';

export const ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const SEGREDO_MIN = 32;

const senhaConfigurada = (): string | null => {
  const s = process.env['ADMIN_PASSWORD'];
  return typeof s === 'string' && s.length > 0 ? s : null;
};

const segredoConfigurado = (): string | null => {
  const s = process.env['ADMIN_TOKEN_SECRET'];
  return typeof s === 'string' && s.length >= SEGREDO_MIN ? s : null;
};

export function adminConfigurado(): boolean {
  return senhaConfigurada() !== null && segredoConfigurado() !== null;
}

/** Compara em tempo constante (os hashes têm sempre o mesmo tamanho). */
const iguais = (a: string, b: string): boolean =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

export function conferirSenha(tentativa: string): boolean {
  const senha = senhaConfigurada();
  if (!senha || !segredoConfigurado() || typeof tentativa !== 'string') return false;
  return iguais(tentativa, senha);
}

const assinar = (payload: string, segredo: string): string =>
  createHmac('sha256', segredo).update(payload).digest('base64url');

export function emitirToken(agora: number = Date.now()): { token: string; expiraEm: number } {
  const segredo = segredoConfigurado();
  if (!segredo) throw new Error('Administração não configurada (ADMIN_TOKEN_SECRET).');
  const expiraEm = agora + ADMIN_TOKEN_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ exp: expiraEm })).toString('base64url');
  return { token: `${payload}.${assinar(payload, segredo)}`, expiraEm };
}

export function validarToken(token: string, agora: number = Date.now()): boolean {
  const segredo = segredoConfigurado();
  if (!segredo || typeof token !== 'string') return false;
  const partes = token.split('.');
  if (partes.length !== 2 || !partes[0] || !partes[1]) return false;
  const [payload, assinatura] = partes;
  if (!iguais(assinatura, assinar(payload, segredo))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof exp === 'number' && agora < exp;
  } catch {
    return false;
  }
}

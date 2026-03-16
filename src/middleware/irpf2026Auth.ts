/**
 * Middleware de autenticação JWT para a área IRPF 2026.
 * Valida o token e anexa o usuário (admin ou cliente) em req.irpf2026Usuario.
 * Acesso admin restrito aos e-mails configurados em IRPF2026_ADMIN_EMAILS (ou lista padrão).
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { Irpf2026JwtPayload } from '../types';

const JWT_SECRET = process.env['IRPF2026_JWT_SECRET'] || process.env['JWT_SECRET'] || 'irpf2026-secret-change-in-production';

/** E-mails que podem acessar a área administrativa (padrão). */
const DEFAULT_ADMIN_EMAILS = [
  'ti@central-rnc.com.br',
  'marcelo@central-rnc.com.br',
  'elisangela@central-rnc.com.br',
];

function getAllowedAdminEmails(): Set<string> {
  const env = process.env['IRPF2026_ADMIN_EMAILS'];
  if (env && env.trim()) {
    return new Set(
      env.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    );
  }
  return new Set(DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()));
}

export function isAllowedAdminEmail(email: string): boolean {
  return getAllowedAdminEmails().has((email || '').trim().toLowerCase());
}

export interface Irpf2026AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'cliente';
}

declare global {
  namespace Express {
    interface Request {
      irpf2026Usuario?: Irpf2026AuthUser;
    }
  }
}

/**
 * Valida JWT no header Authorization: Bearer <token> e anexa req.irpf2026Usuario.
 * Retorna 401 se token ausente ou inválido.
 */
export function irpf2026Auth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ success: false, error: 'Token de autenticação ausente' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Irpf2026JwtPayload;
    req.irpf2026Usuario = {
      id: decoded.sub,
      email: decoded.email || '',
      role: decoded.role,
    };
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Token inválido ou expirado' });
  }
}

/**
 * Exige que o usuário autenticado tenha role 'admin' e e-mail na lista de permitidos.
 * Deve ser usado após irpf2026Auth. Retorna 403 se não for admin ou e-mail não autorizado.
 */
export function irpf2026AdminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.irpf2026Usuario) {
    res.status(401).json({ success: false, error: 'Não autenticado' });
    return;
  }
  if (req.irpf2026Usuario.role !== 'admin') {
    res.status(403).json({ success: false, error: 'Acesso restrito a administradores' });
    return;
  }
  if (!isAllowedAdminEmail(req.irpf2026Usuario.email)) {
    res.status(403).json({ success: false, error: 'Acesso à área administrativa não autorizado para este e-mail' });
    return;
  }
  next();
}

export { JWT_SECRET };

/**
 * Trava das ações da Administração: exige `Authorization: Bearer <credencial>` emitida por
 * POST /api/admin/login. Sem a senha configurada no servidor, responde 503 (falha fechada).
 */
import type { NextFunction, Request, Response } from 'express';
import { adminConfigurado, validarToken } from '../services/AdminAuthService';

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!adminConfigurado()) {
    res.status(503).json({
      success: false,
      error: 'A senha da Administração não está configurada no servidor (ADMIN_PASSWORD e ADMIN_TOKEN_SECRET no .env).',
      code: 'ADMIN_NOT_CONFIGURED',
    });
    return;
  }
  const cabecalho = req.headers.authorization ?? '';
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() : '';
  if (!token || !validarToken(token)) {
    res.status(401).json({
      success: false,
      error: 'Ação restrita à Administração: entre com a senha de administrador.',
      code: 'ADMIN_REQUIRED',
    });
    return;
  }
  next();
}

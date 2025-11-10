import { Request, Response, NextFunction } from 'express';

/**
 * Autenticação simples por API Key via header Authorization: Bearer <API_KEY>
 * Se a variável de ambiente API_KEY não estiver definida, a autenticação é ignorada (modo dev).
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const requiredKey = process.env['API_KEY'];
  if (!requiredKey) {
    next();
    return;
  }

  const auth = req.headers['authorization'] || '';
  const token = auth.toString().startsWith('Bearer ')
    ? auth.toString().slice('Bearer '.length)
    : null;

  if (!token || token !== requiredKey) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  next();
}

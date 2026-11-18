/**
 * Login da Administração, montado em /api/admin.
 *   POST /login   { senha } → { token, expiraEm }   (tentativas limitadas por IP)
 *   GET  /sessao  200 se a credencial do cabeçalho ainda vale, 401 se não
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAdmin } from '../middleware/requireAdmin';
import { adminConfigurado, conferirSenha, emitirToken } from '../services/AdminAuthService';

export function criarAdminAuthRouter({ maxTentativasPorMinuto = 5 } = {}): Router {
  const router = Router();

  const limiteLogin = rateLimit({
    windowMs: 60 * 1000,
    limit: maxTentativasPorMinuto,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Muitas tentativas de senha. Espere um minuto e tente de novo.' },
  });

  router.post('/login', limiteLogin, (req, res) => {
    if (!adminConfigurado()) {
      res.status(503).json({
        success: false,
        error: 'A senha da Administração não está configurada no servidor (ADMIN_PASSWORD e ADMIN_TOKEN_SECRET no .env).',
        code: 'ADMIN_NOT_CONFIGURED',
      });
      return;
    }
    const senha = req.body?.senha;
    if (typeof senha !== 'string' || senha.length === 0) {
      res.status(400).json({ success: false, error: 'Informe a senha.' });
      return;
    }
    if (!conferirSenha(senha)) {
      res.status(401).json({ success: false, error: 'Senha incorreta.' });
      return;
    }
    res.json({ success: true, data: emitirToken() });
  });

  router.get('/sessao', requireAdmin, (_req, res) => {
    res.json({ success: true });
  });

  return router;
}

export default criarAdminAuthRouter();

/**
 * Rotas do módulo IRPF Produção (PRD-IRPF-001)
 * Prefixo: /api/irpf-producao
 * Reutiliza auth/sanitização do DCTF (mesmo padrão de clientes, dctf, etc.)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { CasesController } from '../controllers/irpf-producao/CasesController';
import { sanitizeData } from '../middleware/validation';

const router = Router();
const casesController = new CasesController();

// Reutilizar middleware de sanitização (padrão DCTF)
router.use(sanitizeData);

// Anexar info de auth para RBAC futuro (reutiliza padrão: header Authorization)
router.use((req: Request, _res: Response, next: NextFunction) => {
  (req as any).irpfAuth = { hasAuth: !!req.headers.authorization };
  next();
});

// Cases
router.get('/cases', (req, res) => casesController.list(req, res));
router.get('/cases/:id', (req, res) => casesController.getById(req, res));
router.post('/cases', (req, res) => casesController.create(req, res));
router.patch('/cases/:id', (req, res) => casesController.update(req, res));
router.post('/cases/:id/status', (req, res) => casesController.updateStatus(req, res));

export default router;

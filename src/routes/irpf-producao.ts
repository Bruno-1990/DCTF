/**
 * Rotas do módulo IRPF Produção (PRD-IRPF-001)
 * Prefixo: /api/irpf-producao
 * Reutiliza auth/sanitização do DCTF (mesmo padrão de clientes, dctf, etc.)
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { CasesController } from '../controllers/irpf-producao/CasesController';
import { DocumentsController } from '../controllers/irpf-producao/DocumentsController';
import { sanitizeData } from '../middleware/validation';

const router = Router();
const casesController = new CasesController();
const documentsController = new DocumentsController();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Reutilizar middleware de sanitização (padrão DCTF)
router.use(sanitizeData);

// Anexar info de auth e RBAC (RF-005)
const IRPF_PROFILES = ['Operador', 'Preparador', 'Revisor', 'Auditor', 'Admin'];
router.use((req: Request, _res: Response, next: NextFunction) => {
  (req as any).irpfAuth = { hasAuth: !!req.headers.authorization };
  const profile = (req.headers['x-user-profile'] as string)?.trim();
  if (profile && IRPF_PROFILES.includes(profile)) {
    (req as any).irpfAuth.profile = profile;
  }
  next();
});

function requireProfile(req: Request, res: Response, next: NextFunction): void {
  const profile = (req as any).irpfAuth?.profile;
  if (!profile || !IRPF_PROFILES.includes(profile)) {
    res.status(403).json({ success: false, error: 'Perfil obrigatório para esta ação.', code: 'RBAC_FORBIDDEN' });
    return;
  }
  next();
}

// Cases
router.get('/cases', (req, res) => casesController.list(req, res));
router.get('/cases/:id', (req, res) => casesController.getById(req, res));
router.post('/cases', (req, res) => casesController.create(req, res));
router.patch('/cases/:id', (req, res) => casesController.update(req, res));
router.patch('/cases/:id/triage', requireProfile, (req, res) => casesController.patchTriage(req, res));
router.post('/cases/:id/status', requireProfile, (req, res) => casesController.updateStatus(req, res));

router.post(
  '/cases/:id/documents',
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: any) => {
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'Arquivo excede o tamanho máximo (50 MB).', code: 'DOC_SIZE_EXCEEDED' });
      }
      next(err);
    });
  },
  (req, res) => documentsController.upload(req, res)
);

export default router;

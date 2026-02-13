/**
 * Rotas do módulo IRPF Produção (PRD-IRPF-001)
 * Prefixo: /api/irpf-producao
 */

import { Router } from 'express';
import { CasesController } from '../controllers/irpf-producao/CasesController';

const router = Router();
const casesController = new CasesController();

// Cases
router.get('/cases', (req, res) => casesController.list(req, res));
router.get('/cases/:id', (req, res) => casesController.getById(req, res));
router.post('/cases', (req, res) => casesController.create(req, res));
router.patch('/cases/:id', (req, res) => casesController.update(req, res));
router.post('/cases/:id/status', (req, res) => casesController.updateStatus(req, res));

export default router;

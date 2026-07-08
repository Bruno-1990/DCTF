import { Router } from 'express';
import { BeneficiosController, beneficiosUploadMiddleware } from '../controllers/BeneficiosController';

const router = Router();
const controller = new BeneficiosController();

// Compete
router.get('/compete', (req, res) => controller.listarCompete(req, res));
router.get('/compete/comparacao', (req, res) => controller.comparacaoCompete(req, res));
router.post('/compete/importar', beneficiosUploadMiddleware, (req, res) => controller.importarCompete(req, res));
router.delete('/compete/limpar', (req, res) => controller.limparCompete(req, res));

// Invest
router.get('/invest', (req, res) => controller.listarInvest(req, res));
router.get('/invest/comparacao', (req, res) => controller.comparacaoInvest(req, res));
router.post('/invest/importar', beneficiosUploadMiddleware, (req, res) => controller.importarInvest(req, res));
router.delete('/invest/limpar', (req, res) => controller.limparInvest(req, res));

export default router;

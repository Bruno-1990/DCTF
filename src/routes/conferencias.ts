import { Router } from 'express';
import { ConferenciaController } from '../controllers/ConferenciaController';

const router = Router();
const controller = new ConferenciaController();

// GET /api/conferencias/resumo?cnpj=&clienteId=&inicio=YYYY-MM&fim=YYYY-MM
router.get('/resumo', (req, res) => controller.resumo(req, res));

// GET /api/conferencias/detalhe?cnpj=&competencia=YYYY-MM
router.get('/detalhe', (req, res) => controller.detalhe(req, res));

export default router;



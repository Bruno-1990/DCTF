/**
 * Rotas para consultas na Receita Federal
 */

import { Router } from 'express';
import { ConsultaReceitaController } from '../controllers/ConsultaReceitaController';

const router = Router();
const consultaController = new ConsultaReceitaController();

// GET /api/receita/validar-token - Valida token (e opcionalmente autorização para um CNPJ)
router.get('/validar-token', (req, res) => consultaController.validarToken(req, res));

export default router;


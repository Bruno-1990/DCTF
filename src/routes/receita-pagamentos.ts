/**
 * Rotas para consultar pagamentos da Receita Federal salvos na tabela
 */

import { Router } from 'express';
import { ReceitaPagamentoController } from '../controllers/ReceitaPagamentoController';

const router = Router();
const receitaPagamentoController = new ReceitaPagamentoController();

// GET /api/receita-pagamentos - Lista pagamentos com filtros
router.get('/', (req, res) => receitaPagamentoController.listarPagamentos(req, res));

export default router;


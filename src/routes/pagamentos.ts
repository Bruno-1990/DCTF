/**
 * Rotas para gerenciamento de pagamentos de débitos DCTF
 */

import { Router } from 'express';
import { PagamentoController } from '../controllers/PagamentoController';

const router = Router();
const pagamentoController = new PagamentoController();

// GET /api/pagamentos - Lista débitos com filtros
router.get('/', (req, res) => pagamentoController.listarDebitos(req, res));

// GET /api/pagamentos/estatisticas - Obtém estatísticas
router.get('/estatisticas', (req, res) => pagamentoController.obterEstatisticas(req, res));

// PUT /api/pagamentos/:id - Atualiza pagamento de um débito
router.put('/:id', (req, res) => pagamentoController.atualizarPagamento(req, res));

// PUT /api/pagamentos/lote - Atualiza pagamento em lote
router.put('/lote', (req, res) => pagamentoController.atualizarPagamentoEmLote(req, res));

export default router;


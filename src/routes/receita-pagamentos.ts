/**
 * Rotas para consultar pagamentos da Receita Federal salvos na tabela
 */

import { Router } from 'express';
import { ReceitaPagamentoController } from '../controllers/ReceitaPagamentoController';

const router = Router();
const receitaPagamentoController = new ReceitaPagamentoController();

// GET /api/receita-pagamentos - Lista pagamentos com filtros
router.get('/', (req, res) => receitaPagamentoController.listarPagamentos(req, res));

// GET /api/receita-pagamentos/comprovante - Busca comprovante de pagamento na Receita Federal
router.get('/comprovante', (req, res) => receitaPagamentoController.buscarComprovante(req, res));

// GET /api/receita-pagamentos/e-processos - Consulta processos eletrônicos na Receita Federal
router.get('/e-processos', (req, res) => receitaPagamentoController.consultarEProcessos(req, res));

// DELETE /api/receita-pagamentos/cliente - Exclui todos os pagamentos de um cliente por CNPJ
router.delete('/cliente', (req, res) => receitaPagamentoController.excluirPagamento(req, res));

// DELETE /api/receita-pagamentos/:id - Exclui um pagamento por ID
router.delete('/:id', (req, res) => receitaPagamentoController.excluirPagamento(req, res));

export default router;


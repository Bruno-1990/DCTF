/**
 * Rotas para gerenciamento de pagamentos de débitos DCTF
 */

import { Router } from 'express';
import { PagamentoController } from '../controllers/PagamentoController';
import { SincronizacaoReceitaController } from '../controllers/SincronizacaoReceitaController';

const router = Router();
const pagamentoController = new PagamentoController();
const sincronizacaoController = new SincronizacaoReceitaController();

// GET /api/pagamentos - Lista débitos com filtros
router.get('/', (req, res) => pagamentoController.listarDebitos(req, res));

// GET /api/pagamentos/estatisticas - Obtém estatísticas
router.get('/estatisticas', (req, res) => pagamentoController.obterEstatisticas(req, res));

// PUT /api/pagamentos/:id - Atualiza pagamento de um débito
router.put('/:id', (req, res) => pagamentoController.atualizarPagamento(req, res));

// PUT /api/pagamentos/lote - Atualiza pagamento em lote
router.put('/lote', (req, res) => pagamentoController.atualizarPagamentoEmLote(req, res));

// POST /api/pagamentos/sincronizar/cliente - Sincroniza pagamentos de um cliente
router.post('/sincronizar/cliente', (req, res) => sincronizacaoController.sincronizarCliente(req, res));

// POST /api/pagamentos/sincronizar/todos - Sincroniza pagamentos de todos os clientes
router.post('/sincronizar/todos', (req, res) => sincronizacaoController.sincronizarTodos(req, res));

// POST /api/pagamentos/sincronizar/debito/:id - Sincroniza um débito específico
router.post('/sincronizar/debito/:id', (req, res) => sincronizacaoController.sincronizarDebito(req, res));

export default router;


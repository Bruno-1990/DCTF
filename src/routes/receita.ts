/**
 * Rotas para consultas na Receita Federal
 */

import { Router } from 'express';
import { ConsultaReceitaController } from '../controllers/ConsultaReceitaController';

const router = Router();
const consultaController = new ConsultaReceitaController();

// POST /api/receita/consulta-simples - Consulta simples (CNPJ específico)
router.post('/consulta-simples', (req, res) => consultaController.consultarSimples(req, res));

// POST /api/receita/consulta-lote - Consulta em lote (todos os CNPJs)
router.post('/consulta-lote', (req, res) => consultaController.consultarLote(req, res));

// GET /api/receita/consulta-lote/:progressId - Verificar progresso de consulta em lote
router.get('/consulta-lote/:progressId', (req, res) => consultaController.verificarProgresso(req, res));

// POST /api/receita/consulta-lote/:progressId/cancelar - Cancelar consulta em lote
router.post('/consulta-lote/:progressId/cancelar', (req, res) => consultaController.cancelarConsulta(req, res));

export default router;


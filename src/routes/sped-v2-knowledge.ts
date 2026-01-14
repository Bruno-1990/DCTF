/**
 * Rotas para consulta de documentos legais (SPED v2.0)
 * Endpoints para busca semântica, consulta de regras e geração de contexto
 */

import { Router } from 'express';
import { SpedV2KnowledgeController } from '../controllers/SpedV2KnowledgeController';
import { sanitizeData } from '../middleware/validation';

const router = Router();
const controller = new SpedV2KnowledgeController();

// Middleware de sanitização global
router.use(sanitizeData);

/**
 * GET /api/sped/v2/knowledge/documents
 * Listar documentos por período/vigência
 */
router.get('/documents', controller.listDocuments.bind(controller));

/**
 * GET /api/sped/v2/knowledge/query
 * Busca semântica (RAG) com filtros
 */
router.get('/query', controller.queryDocuments.bind(controller));

/**
 * GET /api/sped/v2/knowledge/rules
 * Buscar regras estruturadas por categoria/tipo/período
 */
router.get('/rules', controller.getRules.bind(controller));

/**
 * POST /api/sped/v2/knowledge/generate-rule
 * Gerar regra consultando documentos com contexto RAG
 */
router.post('/generate-rule', controller.generateRule.bind(controller));

export default router;



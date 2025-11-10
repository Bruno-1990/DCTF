/**
 * Rotas para Códigos DCTF
 * Endpoints para gerenciamento de códigos, categorias e validações
 */

import { Router } from 'express';
import { DCTFCodesController } from '../controllers/DCTFCodesController';

const router = Router();

// ==============================================
// ROTAS PRINCIPAIS
// ==============================================

/**
 * GET /api/dctf-codes
 * Listar todos os códigos DCTF
 * Query params: tipo, ativo, periodo
 */
router.get('/', DCTFCodesController.listCodes);

/**
 * GET /api/dctf-codes/hierarchy
 * Obter hierarquia de códigos por categoria
 */
router.get('/hierarchy', DCTFCodesController.getHierarchy);

/**
 * GET /api/dctf-codes/statistics
 * Obter estatísticas dos códigos
 */
router.get('/statistics', DCTFCodesController.getStatistics);

/**
 * GET /api/dctf-codes/search
 * Buscar códigos por descrição
 * Query params: q (termo de busca), tipo
 */
router.get('/search', DCTFCodesController.searchCodes);

/**
 * GET /api/dctf-codes/export
 * Exportar códigos para CSV
 * Query params: tipo
 */
router.get('/export', DCTFCodesController.exportCodes);

// ==============================================
// ROTAS POR CÓDIGO
// ==============================================

/**
 * GET /api/dctf-codes/:codigo
 * Obter informações de um código específico
 * Query params: periodo
 */
router.get('/:codigo', DCTFCodesController.getCode);

/**
 * PUT /api/dctf-codes/:codigo
 * Atualizar código DCTF
 */
router.put('/:codigo', DCTFCodesController.updateCode);

/**
 * DELETE /api/dctf-codes/:codigo
 * Desativar código DCTF (soft delete)
 */
router.delete('/:codigo', DCTFCodesController.deleteCode);

/**
 * GET /api/dctf-codes/:codigo/aliquota
 * Obter alíquota para um código e período
 * Query params: periodo
 */
router.get('/:codigo/aliquota', DCTFCodesController.getAliquota);

// ==============================================
// ROTAS DE VALIDAÇÃO
// ==============================================

/**
 * POST /api/dctf-codes/validate
 * Validar um ou mais códigos
 * Body: { codigos: string[], periodo: string, tipo?: string }
 */
router.post('/validate', DCTFCodesController.validateCodes);

// ==============================================
// ROTAS DE CÓDIGOS DE RECEITA
// ==============================================

/**
 * GET /api/dctf-codes/receita
 * Listar códigos de receita
 * Query params: categoria, subcategoria
 */
router.get('/receita', DCTFCodesController.listReceitaCodes);

// ==============================================
// ROTAS DE ALÍQUOTAS
// ==============================================

/**
 * GET /api/dctf-codes/aliquotas
 * Listar alíquotas por período
 * Query params: periodo
 */
router.get('/aliquotas', DCTFCodesController.listAliquotas);

// ==============================================
// ROTAS DE CRIAÇÃO (ADMIN)
// ==============================================

/**
 * POST /api/dctf-codes
 * Criar novo código DCTF
 * Body: { codigo, descricao, tipo, ativo, periodoInicio?, periodoFim?, observacoes? }
 */
router.post('/', DCTFCodesController.createCode);

export default router;


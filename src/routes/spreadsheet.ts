/**
 * Rotas para Validação de Planilhas DCTF
 * Endpoints para upload, validação e processamento de planilhas
 */

import { Router } from 'express';
import { SpreadsheetController, uploadMiddleware } from '../controllers/SpreadsheetController';

const router = Router();

// ==============================================
// ROTAS DE VALIDAÇÃO
// ==============================================

/**
 * POST /api/spreadsheet/validate
 * Validar arquivo de planilha DCTF
 * Body: arquivo (multipart/form-data)
 */
router.post('/validate', uploadMiddleware, SpreadsheetController.validateFile);

/**
 * POST /api/spreadsheet/upload
 * Upload e processamento completo de planilha DCTF
 * Body: arquivo (multipart/form-data), clienteId, periodo
 */
router.post('/upload', uploadMiddleware, SpreadsheetController.uploadFile);

/**
 * POST /api/spreadsheet/import
 * Importar e persistir dados válidos em lotes
 * Body: arquivo (multipart/form-data), declaracaoId, chunkSize?
 */
router.post('/import', uploadMiddleware, SpreadsheetController.importData);

/**
 * POST /api/spreadsheet/import-json
 * Importar dados DCTF em lote via JSON
 * Body: { declaracaoId: string, dados: Array<...> }
 */
router.post('/import-json', SpreadsheetController.importJson);

/**
 * POST /api/spreadsheet/validate-batch
 * Validar múltiplos arquivos
 * Body: { arquivos: [{ nome: string, conteudo: string }] }
 */
router.post('/validate-batch', SpreadsheetController.validateBatch);

// ==============================================
// ROTAS DE TEMPLATE E EXPORTAÇÃO
// ==============================================

/**
 * GET /api/spreadsheet/template
 * Download do template de planilha DCTF (pública)
 */
router.get('/template', SpreadsheetController.downloadTemplate);

/**
 * POST /api/spreadsheet/export
 * Exportar dados para planilha
 * Body: { dados: any[] }
 */
router.post('/export', SpreadsheetController.exportData);

// ==============================================
// ROTAS DE INFORMAÇÕES
// ==============================================

/**
 * GET /api/spreadsheet/validation-rules
 * Obter regras de validação de planilhas
 */
router.get('/validation-rules', SpreadsheetController.getValidationRules);

/**
 * GET /api/spreadsheet/uploads
 * Histórico de uploads (em memória/banco) com filtros e paginação
 */
router.get('/uploads', SpreadsheetController.getUploadsHistory);

export default router;


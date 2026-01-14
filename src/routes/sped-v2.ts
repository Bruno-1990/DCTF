/**
 * Rotas para Validação SPED v2.0
 * Endpoints para processamento e validação usando modelo canônico
 */

import { Router } from 'express';
import multer from 'multer';
import {
  iniciarValidacao,
  obterStatus,
  listarValidacoes,
  removerValidacao,
  obterResultado
} from '../controllers/SpedV2ValidationController';
import { sanitizeData } from '../middleware/validation';

const router = Router();

// Configurar multer para upload de arquivos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB por arquivo
    files: 10001 // Máximo de 10001 arquivos (1 SPED + até 10000 XMLs)
  }
});

// Middleware de sanitização global
router.use(sanitizeData);

/**
 * POST /api/sped/v2/validar
 * Inicia uma nova validação SPED v2.0
 * 
 * Body (multipart/form-data):
 * - sped: arquivo SPED (.txt)
 * - xmls: arquivos XML (múltiplos)
 * - clienteId: ID do cliente (opcional)
 * - competencia: competência no formato MM/YYYY (opcional)
 * - perfilFiscal: JSON com perfil fiscal (opcional)
 *   {
 *     "segmento": "Comércio",
 *     "regime": "RPA",
 *     "operaST": true,
 *     "regimeEspecial": false,
 *     "operaInterestadualDIFAL": true
 *   }
 * 
 * Response (202 Accepted):
 * {
 *   "success": true,
 *   "validationId": "uuid",
 *   "status": "queued",
 *   "message": "Aguardando processamento..."
 * }
 */
router.post(
  '/validar',
  upload.fields([
    { name: 'sped', maxCount: 1 },
    { name: 'xmls', maxCount: 10000 }
  ]),
  iniciarValidacao
);

/**
 * GET /api/sped/v2/status/:validationId
 * Obtém status de uma validação
 * 
 * Response:
 * {
 *   "success": true,
 *   "validationId": "uuid",
 *   "status": "processing",
 *   "progress": 45,
 *   "message": "Executando validações...",
 *   "startedAt": "2025-01-15T10:30:00Z"
 * }
 */
router.get('/status/:validationId', obterStatus);

/**
 * GET /api/sped/v2/resultado/:validationId
 * Obtém resultado de uma validação concluída
 * 
 * Response:
 * {
 *   "success": true,
 *   "validationId": "uuid",
 *   "resultado": { ... },
 *   "completedAt": "2025-01-15T10:35:00Z"
 * }
 */
router.get('/resultado/:validationId', obterResultado);

/**
 * GET /api/sped/v2/validacoes
 * Lista todas as validações
 * 
 * Response:
 * {
 *   "success": true,
 *   "validacoes": [
 *     {
 *       "validationId": "uuid",
 *       "status": "completed",
 *       "progress": 100,
 *       ...
 *     }
 *   ]
 * }
 */
router.get('/validacoes', listarValidacoes);

/**
 * DELETE /api/sped/v2/validacoes/:validationId
 * Remove uma validação
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Validação removida com sucesso"
 * }
 */
router.delete('/validacoes/:validationId', removerValidacao);

export default router;



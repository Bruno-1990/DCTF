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
  obterResultado,
  extrairMetadados
} from '../controllers/SpedV2ValidationController';
import { sanitizeData } from '../middleware/validation';

const router = Router();

// Configurar multer para upload de arquivos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB por arquivo
    files: 5000 // Máximo de 5000 arquivos (1 SPED + até 4999 XMLs) - suficiente para processar meses completos
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
/**
 * POST /api/sped/v2/extract-metadata
 * Extrai metadados do arquivo SPED (CNPJ, competência, regime, etc)
 */
router.post(
  '/extract-metadata',
  upload.fields([
    { name: 'sped', maxCount: 1 }
  ]),
  extrairMetadados
);

router.post(
  '/validar',
  upload.any(), // Usar .any() para aceitar qualquer campo (arquivos e texto)
  // Middleware para organizar arquivos por tipo e manter formato esperado pelo controller
  (req: Request, res: Response, next: any) => {
    const files = req.files as Express.Multer.File[];
    
    // Organizar arquivos por tipo (formato esperado pelo controller)
    const filesByField: { [fieldname: string]: Express.Multer.File[] } = {
      sped: [],
      xmls: []
    };
    
    if (files) {
      files.forEach((file: Express.Multer.File) => {
        if (file.fieldname === 'sped') {
          filesByField.sped.push(file);
        } else if (file.fieldname === 'xmls') {
          filesByField.xmls.push(file);
        }
        // Campos como clienteId, competencia, perfilFiscal não são arquivos
        // Eles já estão em req.body automaticamente
      });
    }
    
    // Anexar arquivos organizados ao req no formato esperado
    req.files = filesByField as any;
    next();
  },
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






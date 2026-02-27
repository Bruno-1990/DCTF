/**
 * Rotas do módulo DIRF: parse de XMLs eSocial S-5002 (evtIrrfBenef) e totalizadores por CPF/mês/ano.
 */

import { Router } from 'express';
import { DirfController, dirfUploadMiddleware } from '../controllers/DirfController';

const router = Router();

/**
 * GET /api/dirf/verbas
 * Retorna mapa tpInfoIR → descrição para a UI.
 */
router.get('/verbas', DirfController.verbas);

/**
 * POST /api/dirf/parse
 * Body: multipart/form-data, campo "arquivos" (múltiplos arquivos .xml)
 * Retorna: { success, data: { porCpf, arquivosProcessados, errosPorArquivo } }
 */
router.post('/parse', dirfUploadMiddleware, DirfController.parse);

export default router;

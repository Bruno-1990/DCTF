/**
 * Rotas para operações de Flags
 */

import { Router } from 'express';
import { FlagController } from '../controllers/FlagController';
import { validate, validateParams, validateQuery, sanitizeData } from '../middleware/validation';
import { flagSchemas } from '../middleware/schemas';

const router = Router();
const flagController = new FlagController();

router.use(sanitizeData);

// GET /api/flags - listar flags
router.get('/', validateQuery(flagSchemas.query), (req, res) => {
  flagController.listarFlags(req, res);
});

// GET /api/flags/:id - obter flag
router.get('/:id', validateParams(flagSchemas.params), (req, res) => {
  flagController.obterFlag(req, res);
});

// POST /api/flags/:id/resolve - resolver flag
router.post(
  '/:id/resolve',
  validateParams(flagSchemas.params),
  validate(flagSchemas.resolve),
  (req, res) => {
    flagController.resolverFlag(req, res);
  }
);

// POST /api/flags/:id/reopen - reabrir flag
router.post('/:id/reopen', validateParams(flagSchemas.params), (req, res) => {
  flagController.reabrirFlag(req, res);
});

// POST /api/flags/validate - executar motor de validação
router.post('/validate/run', validate(flagSchemas.validateRun), (req, res) => {
  flagController.executarValidacao(req, res);
});

export default router;



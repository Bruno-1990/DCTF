/**
 * Rotas para Conferências (Nova estrutura modular)
 */

import { Router } from 'express';
import conferenceController from '../controllers/ConferenceController';

const router = Router();

// GET /api/conferences/summary - Resumo completo de todas as conferências
router.get('/summary', (req, res) => conferenceController.getSummary(req, res));

export default router;



















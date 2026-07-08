import { Router } from 'express';
import {
  EstudoViabilidadeController,
  estudoViabilidadeUploadMiddleware,
} from '../controllers/EstudoViabilidadeController';

const router = Router();
const controller = new EstudoViabilidadeController();

// Documentos
router.get('/documentos', (req, res) => controller.listarDocumentos(req, res));
router.post('/documentos', estudoViabilidadeUploadMiddleware, (req, res) => controller.uploadDocumento(req, res));
router.get('/documentos/:id/status', (req, res) => controller.obterStatusDocumento(req, res));
router.get('/documentos/:id/stream', (req, res) => controller.streamDocumento(req, res));
router.delete('/documentos/:id', (req, res) => controller.excluirDocumento(req, res));

// Cruzamento clientes x legislacao
router.get('/clientes', (req, res) => controller.listarClientes(req, res));
router.get('/cidades', (req, res) => controller.listarCidades(req, res));

export default router;

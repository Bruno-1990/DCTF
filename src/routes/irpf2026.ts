/**
 * Rotas da área do cliente e admin IRPF 2026.
 * Auth: login (admin ou cliente), /me
 * Documentos: list, upload (multer), download
 * Mensagens: list (cliente ou admin), PATCH :id/lida (cliente), POST (admin)
 * Admin: visao-geral, usuarios, PUT usuarios/:id/status, POST mensagens
 */

import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { irpf2026Auth, irpf2026AdminAuth } from '../middleware/irpf2026Auth';
import * as AuthController from '../controllers/irpf2026/AuthController';
import * as DocumentosController from '../controllers/irpf2026/DocumentosController';
import * as MensagensController from '../controllers/irpf2026/MensagensController';
import * as AdminController from '../controllers/irpf2026/AdminController';

const router = Router();

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ---- Público ----
router.post('/auth/login', loginLimiter, AuthController.login);

// ---- Autenticado (cliente ou admin) ----
router.get('/me', irpf2026Auth, AuthController.me);

// Documentos: list e download (cliente só os próprios; admin todos)
router.get('/documentos', irpf2026Auth, DocumentosController.list);
router.get('/documentos/:id/download', irpf2026Auth, DocumentosController.download);

// Upload apenas cliente
router.post('/documentos/upload', irpf2026Auth, uploadMiddleware.single('arquivo'), DocumentosController.upload);

// Mensagens: cliente lista e marca lida
router.get('/mensagens', irpf2026Auth, MensagensController.list);
router.patch('/mensagens/:id/lida', irpf2026Auth, MensagensController.marcarLida);

// ---- Apenas admin ----
router.get('/admin/visao-geral', irpf2026Auth, irpf2026AdminAuth, AdminController.visaoGeral);
router.get('/admin/usuarios', irpf2026Auth, irpf2026AdminAuth, AdminController.listUsuarios);
router.get('/admin/usuarios/:id/documentos/zip', irpf2026Auth, irpf2026AdminAuth, DocumentosController.downloadZip);
router.get('/admin/usuarios/:id', irpf2026Auth, irpf2026AdminAuth, AdminController.getUsuario);
router.put('/admin/usuarios/:id/status', irpf2026Auth, irpf2026AdminAuth, AdminController.setStatus);
router.post('/admin/mensagens', irpf2026Auth, irpf2026AdminAuth, MensagensController.create);

export default router;

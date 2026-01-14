/**
 * Rotas para operações do SCI (Sistema de Controle Interno)
 * Endpoints para gerenciamento de banco de horas e catálogo
 */

import { Router } from 'express';
import { BancoHorasController } from '../controllers/BancoHorasController';
import { CatalogController } from '../controllers/CatalogController';
import { sanitizeData } from '../middleware/validation';
import multer from 'multer';

const router = Router();
const bancoHorasController = new BancoHorasController();
const catalogController = new CatalogController();

// Configurar multer para upload de arquivos
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos Excel são permitidos (.xlsx ou .xls)'));
    }
  }
});

// Middleware de sanitização global
router.use(sanitizeData);

// POST /api/sci/banco-horas/gerar - Gerar relatório de banco de horas
router.post('/banco-horas/gerar', (req, res) => {
  bancoHorasController.gerarRelatorio(req, res);
});

// GET /api/sci/banco-horas/gerar/:relatorioId/logs - Stream de logs em tempo real (SSE)
router.get('/banco-horas/gerar/:relatorioId/logs', (req, res) => {
  bancoHorasController.streamLogs(req, res);
});

// GET /api/sci/banco-horas/download/:id - Baixar arquivo de relatório
router.get('/banco-horas/download/:id', (req, res) => {
  bancoHorasController.downloadArquivo(req, res);
});

// GET /api/sci/banco-horas/download-formatado/:id - Baixar arquivo formatado
router.get('/banco-horas/download-formatado/:id', (req, res) => {
  bancoHorasController.downloadArquivoFormatado(req, res);
});

// POST /api/sci/banco-horas/formatar - Formatar planilha enviada
router.post('/banco-horas/formatar', upload.single('file'), (req, res) => {
  bancoHorasController.formatarPlanilha(req, res);
});

// POST /api/sci/catalog/buscar - Buscar objetos no catálogo
router.post('/catalog/buscar', (req, res) => {
  catalogController.buscarTabelas(req, res);
});

// POST /api/sci/catalog/gerar-sql - Gerar SQL baseado em objeto do catálogo
router.post('/catalog/gerar-sql', (req, res) => {
  catalogController.gerarSQL(req, res);
});

// POST /api/sci/catalog/executar-sql - Executar SQL no banco SCI
router.post('/catalog/executar-sql', (req, res) => {
  catalogController.executarSQL(req, res);
});

// POST /api/sci/catalog/consulta-centro-custo - Consulta personalizada de centro de custo
router.post('/catalog/consulta-centro-custo', (req, res) => {
  catalogController.consultaCentroCusto(req, res);
});

// POST /api/sci/catalog/consulta-faturamento - Consulta de faturamento (TPEDIDOS_BI_FAT_RESULTADOS)
router.post('/catalog/consulta-faturamento', (req, res) => {
  catalogController.consultaFaturamento(req, res);
});

// POST /api/sci/catalog/sp-bi-fat - Executar stored procedure SP_BI_FAT
router.post('/catalog/sp-bi-fat', (req, res) => {
  catalogController.executarSP_BI_FAT(req, res);
});

export default router;


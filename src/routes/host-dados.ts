import { Router } from 'express';
import { HostDadosController } from '../controllers/HostDadosController';

const router = Router();
const controller = new HostDadosController();

// GET /api/host-dados/obrigacoes?ano=YYYY&mes=MM
router.get('/obrigacoes', (req, res) => controller.verificarObrigacoes(req, res));

// GET /api/host-dados/cliente/:cnpj?ano=YYYY&mes=MM
router.get('/cliente/:cnpj', (req, res) => controller.listarPorCliente(req, res));

// GET /api/host-dados/clientes-sem-dctf-com-movimento?ano=YYYY&mes=MM
router.get('/clientes-sem-dctf-com-movimento', (req, res) => controller.listarClientesSemDCTFComMovimento(req, res));

// GET /api/host-dados/stats/dctf-declaracoes (para debug)
router.get('/stats/dctf-declaracoes', (req, res) => controller.getDCTFDeclaracoesStats(req, res));

// POST /api/host-dados/sincronizar?ano=YYYY&mes=MM
router.post('/sincronizar', (req, res) => controller.sincronizarPeriodo(req, res));

// POST /api/host-dados/sincronizar-automatico
router.post('/sincronizar-automatico', (req, res) => controller.sincronizarAutomatico(req, res));

// POST /api/host-dados/sincronizar-datas?data_ini=YYYY-MM-DD&data_fim=YYYY-MM-DD
router.post('/sincronizar-datas', (req, res) => controller.sincronizarPorDatas(req, res));

export default router;



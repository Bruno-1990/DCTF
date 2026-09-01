import { Router } from 'express';
import { DetController } from '../controllers/DetController';

const router = Router();
const controller = new DetController();

// Rotas fixas antes das que têm :param (mesma armadilha registrada em
// routes/beneficios.ts e clientes.ts).
router.get('/resumo', (req, res) => controller.resumo(req, res));
router.get('/clientes', (req, res) => controller.listar(req, res));
router.get('/coleta/status', (req, res) => controller.statusColeta(req, res));
router.post('/coletar', (req, res) => controller.coletar(req, res));
router.post('/notificacoes/email', (req, res) => controller.enviarEmailNotificacoes(req, res));

router.get('/clientes/:cnpj/notificacoes', (req, res) => controller.notificacoes(req, res));
// Varredura do SPE avulsa (a coleta já faz isto sozinha no início da rodada).
// Vem ANTES de '/procuracoes/:cnpj' de propósito: registrada depois, a rota
// com parâmetro capturaria 'sincronizar' como se fosse um CNPJ.
router.post('/procuracoes/sincronizar', (req, res) => controller.sincronizarProcuracoes(req, res));
router.post('/procuracoes/:cnpj', (req, res) => controller.informarProcuracao(req, res));

export default router;

/**
 * Rotas do painel de agendamentos (área administrativa).
 *
 * Estáticas antes das com :param, como no resto do projeto.
 */
import { Router } from 'express';
import controller from '../controllers/AgendamentoController';

const router = Router();

router.get('/', (req, res) => controller.listar(req, res));
router.get('/:id/historico', (req, res) => controller.historico(req, res));
router.patch('/:id', (req, res) => controller.atualizar(req, res));
router.post('/:id/emails', (req, res) => controller.adicionarEmail(req, res));
router.delete('/:id/emails', (req, res) => controller.removerEmail(req, res));
router.post('/:id/executar', (req, res) => controller.executarAgora(req, res));

export default router;

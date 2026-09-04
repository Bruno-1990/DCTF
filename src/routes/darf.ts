/**
 * /api/darf — emissão do DARF numerado pela DCTFWeb.
 *
 * Só existe esta via. O DARF avulso do Sicalc (o "preto") chegou a ser
 * implementado e foi retirado: na rotina trabalhista ele é sempre o documento
 * errado, porque contribuição previdenciária e de terceiros se declara na
 * DCTFWeb e só a guia dela quita a declaração.
 */

import { Router } from 'express';
import { DarfController } from '../controllers/DarfController';

const router = Router();
const controller = new DarfController();

// ─── Emissão ───────────────────────────────────────────────────────────────
router.get('/dctfweb/categorias', (req, res) => controller.categoriasDctfWeb(req, res));
router.post('/dctfweb', (req, res) => controller.emitirDctfWeb(req, res));

// ─── Lote mensal para a Acessórias ─────────────────────────────────────────
// Antes das rotas com ':id' pelo mesmo motivo do '/historico' abaixo: 'lote'
// seria capturado como identificador.
router.get('/lote/execucoes', (req, res) => controller.loteExecucoes(req, res));
router.post('/lote/executar', (req, res) => controller.loteExecutar(req, res));
router.get('/lote', (req, res) => controller.loteListar(req, res));
router.post('/lote', (req, res) => controller.loteAdicionar(req, res));
router.patch('/lote/:id', (req, res) => controller.loteAlternar(req, res));
router.delete('/lote/:id', (req, res) => controller.loteRemover(req, res));

// ─── Histórico ─────────────────────────────────────────────────────────────
// '/historico' antes de '/:id/pdf' — se registrada depois, a rota com
// parâmetro capturaria 'historico' como se fosse um id.
router.get('/historico', (req, res) => controller.historico(req, res));
router.get('/:id/pdf', (req, res) => controller.baixarPdf(req, res));
// Dois passos, e a ordem é obrigatória:
//   1. DELETE /:id            → apaga o PDF, mantém o registro (reversível)
//   2. DELETE /:id/definitivo → apaga o registro (sem volta, e só depois do 1)
router.delete('/:id/definitivo', (req, res) => controller.excluirDefinitivo(req, res));
router.delete('/:id', (req, res) => controller.excluir(req, res));
router.post('/:id/restaurar', (req, res) => controller.restaurar(req, res));

export default router;

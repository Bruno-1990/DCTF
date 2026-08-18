/**
 * Rotas da cota de aprendizagem — classificação de porte ME/EPP/Demais.
 *
 * Rotas estáticas vêm ANTES das que têm :param, senão a dinâmica captura o
 * caminho (mesma armadilha registrada em routes/beneficios.ts e clientes.ts).
 */

import { Router } from 'express';
import { CotaAprendizagemController } from '../controllers/CotaAprendizagemController';

const router = Router();
const controller = new CotaAprendizagemController();

// Apuração
router.post('/sincronizar', (req, res) => controller.sincronizar(req, res));
// Reaplica as regras sobre o faturamento já coletado — não toca no SCI.
router.post('/reclassificar', (req, res) => controller.reclassificar(req, res));
router.get('/status', (req, res) => controller.status(req, res));

// Leitura
router.get('/classificacao', (req, res) => controller.classificacao(req, res));
router.get('/exportar', (req, res) => controller.exportar(req, res));

// E-mail
router.post('/aviso', (req, res) => controller.enviarAviso(req, res));

// Histórico de um cliente — por último, é a única com :param
router.get('/historico/:clienteId', (req, res) => controller.historico(req, res));

export default router;

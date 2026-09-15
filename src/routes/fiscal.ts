/**
 * Rotas da aba Fiscal — ficha de perfil/volume/SPED por colaborador.
 *
 * Rotas estáticas vêm ANTES das que têm :param, senão a dinâmica captura o
 * caminho (mesma armadilha registrada em routes/beneficios.ts e clientes.ts).
 */

import { Router } from 'express';
import { FiscalController } from '../controllers/FiscalController';

const router = Router();
const controller = new FiscalController();

// Listas fechadas dos selects (o que era a aba AUX da planilha)
router.get('/opcoes', (req, res) => controller.opcoes(req, res));

// Quem preenche
router.get('/colaboradores', (req, res) => controller.colaboradores(req, res));

// Leitura da carteira e busca para o "adicionar empresa"
router.get('/ficha', (req, res) => controller.ficha(req, res));
router.get('/clientes-disponiveis', (req, res) => controller.clientesDisponiveis(req, res));

// Aviso por e-mail (mesmo padrao de /beneficios/substituto/aviso)
router.post('/aviso', (req, res) => controller.aviso(req, res));

// Questionarios: definicao vem do codigo, respostas vem do banco.
// `/questionarios` ANTES de `/questionarios/:slug`, pela mesma regra do topo.
router.get('/questionarios', (req, res) => controller.questionarios(req, res));
router.get('/questionarios/:slug', (req, res) => controller.questionario(req, res));
router.get('/questionarios/:slug/respostas', (req, res) =>
  controller.questionarioRespostas(req, res)
);
router.get('/questionarios/:slug/respostas/:colaboradorId', (req, res) =>
  controller.questionarioRespostaColaborador(req, res)
);
router.put('/questionarios/:slug/respostas/:colaboradorId', (req, res) =>
  controller.questionarioSalvar(req, res)
);

// Escrita
router.post('/ficha', (req, res) => controller.adicionar(req, res));
router.patch('/ficha/:id', (req, res) => controller.atualizar(req, res));
router.post('/ficha/:id/inutilizar', (req, res) => controller.inutilizar(req, res));
router.post('/ficha/:id/reativar', (req, res) => controller.reativar(req, res));

export default router;

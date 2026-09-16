/**
 * API do painel de agendamentos.
 *
 * Junta as duas fontes: o catálogo (código) diz o que cada job é, e a tabela
 * `agendamentos` diz quando ele roda e para quem avisa. A tela recebe isso já
 * mastigado — a frase "Todo dia 5 às 01:00", a próxima execução e a última
 * execução lida da tabela de log de cada job.
 */
import { Request, Response } from 'express';
import { CATALOGO, buscarNoCatalogo } from '../services/agendamentos/catalogo';
import agendamentoConfigService from '../services/agendamentos/AgendamentoConfigService';
import { descreverJanela, proximaExecucao, ErroValidacaoAgendamento } from '../services/agendamentos/regras';
import type { AgendamentoPatch } from '../services/agendamentos/tipos';

/**
 * Quem está mexendo, para o histórico. A área administrativa autentica na tela.
 *
 * O cabeçalho passa por latin1 (é como o Node lê cabeçalhos HTTP), então "João"
 * chegaria como "JoÃ£o" no banco. A reinterpretação abaixo só é aplicada quando
 * o texto tem a marca dessa troca — nome sem acento passa intacto.
 */
const corrigirAcentos = (valor: string): string => {
  if (!/[ÂÃÅ]/.test(valor)) return valor;
  try {
    return Buffer.from(valor, 'latin1').toString('utf8');
  } catch {
    return valor;
  }
};

const autor = (req: Request): string => {
  const cabecalho = req.header('x-usuario');
  const corpo = (req.body ?? {}).por;
  const bruto = String(cabecalho || corpo || 'painel administrativo');
  return corrigirAcentos(bruto).slice(0, 120);
};

const erro = (res: Response, err: any, contexto: string): void => {
  if (err instanceof ErroValidacaoAgendamento) {
    res.status(400).json({ success: false, error: err.message });
    return;
  }
  console.error(`[AGENDAMENTOS] ${contexto}:`, err?.message || err);
  res.status(500).json({ success: false, error: 'Erro ao processar a solicitação.' });
};

/**
 * Execução manual, só onde o próprio job já expõe uma saída segura.
 *
 * `require` dentro da função de propósito: importar puppeteer (DET) e Firebird
 * (Lançamentos) no topo faria o boot da API pagar por eles mesmo quando ninguém
 * clica em "executar agora".
 */
const ACOES: Record<string, () => Promise<unknown>> = {
  'cota-aprendizagem': async () => {
    const { default: scheduler } = require('../services/CotaAprendizagemScheduler');
    return scheduler.forcar(false);
  },
  'reoa-substituto': async () => {
    const { default: scheduler } = require('../services/SubstitutoScheduler');
    return scheduler.forcar();
  },
  'det-caixas': async () => {
    const { DetColetorService } = require('../services/DetColetorService');
    const coletor = new DetColetorService((m: string) => console.log('[DET]', m));
    return coletor.executar('manual', undefined, { pularSpe: true });
  },
  'lancamentos-sci': async () => {
    const { FirebirdSyncService } = require('../services/FirebirdSyncService');
    return new FirebirdSyncService().sincronizarAutomatico();
  },
};

export class AgendamentoController {
  /** GET /api/agendamentos — tudo que o painel precisa, em uma ida só. */
  async listar(_req: Request, res: Response): Promise<void> {
    try {
      const agora = new Date();
      const itens = await Promise.all(
        CATALOGO.map(async (cat) => {
          const config = await agendamentoConfigService.obter(cat.id);
          const [emails, ultima] = await Promise.all([
            agendamentoConfigService.emails(cat.id),
            agendamentoConfigService.ultimaExecucao(cat),
          ]);
          const prox = proximaExecucao(cat, config, agora);
          return {
            ...cat,
            config,
            janela: descreverJanela(cat, config),
            proximaExecucao: prox ? prox.toISOString() : null,
            ultimaExecucao: ultima,
            podeExecutarAgora: !!cat.executarAgora && !!ACOES[cat.id],
            emails: cat.listasEmail.map((l) => ({
              chave: l.chave,
              rotulo: l.rotulo,
              quando: l.quando,
              enderecos: emails[l.chave] ?? [],
            })),
          };
        })
      );
      res.json({ success: true, data: itens });
    } catch (err: any) {
      erro(res, err, 'listar');
    }
  }

  /** PATCH /api/agendamentos/:id — horário e liga/desliga. Campo ausente não é tocado. */
  async atualizar(req: Request, res: Response): Promise<void> {
    const id = String(req.params['id'] ?? '');
    if (!buscarNoCatalogo(id)) {
      res.status(404).json({ success: false, error: 'Agendamento não encontrado.' });
      return;
    }
    try {
      const body = req.body ?? {};
      const patch: AgendamentoPatch = {};
      if (body.ativo !== undefined) patch.ativo = !!body.ativo;
      if (body.dia !== undefined) patch.dia = body.dia === null ? null : Number(body.dia);
      if (body.hora !== undefined) patch.hora = Number(body.hora);
      if (body.minuto !== undefined) patch.minuto = Number(body.minuto);
      if (body.diasSemana !== undefined) {
        patch.diasSemana = Array.isArray(body.diasSemana) ? body.diasSemana.map(Number) : body.diasSemana;
      }

      const config = await agendamentoConfigService.atualizar(id, patch, autor(req));
      const cat = buscarNoCatalogo(id)!;
      const prox = proximaExecucao(cat, config, new Date());
      res.json({
        success: true,
        data: {
          config,
          janela: descreverJanela(cat, config),
          proximaExecucao: prox ? prox.toISOString() : null,
        },
      });
    } catch (err: any) {
      erro(res, err, `atualizar ${id}`);
    }
  }

  /** POST /api/agendamentos/:id/emails — { lista, email } */
  async adicionarEmail(req: Request, res: Response): Promise<void> {
    const id = String(req.params['id'] ?? '');
    const { lista, email } = req.body ?? {};
    try {
      const enderecos = await agendamentoConfigService.adicionarEmail(
        id,
        String(lista ?? ''),
        String(email ?? ''),
        autor(req)
      );
      res.status(201).json({ success: true, data: { lista, enderecos } });
    } catch (err: any) {
      erro(res, err, `adicionar e-mail ${id}`);
    }
  }

  /** DELETE /api/agendamentos/:id/emails?lista=&email= */
  async removerEmail(req: Request, res: Response): Promise<void> {
    const id = String(req.params['id'] ?? '');
    const lista = String(req.query['lista'] ?? '');
    const email = String(req.query['email'] ?? '');
    try {
      const enderecos = await agendamentoConfigService.removerEmail(id, lista, email, autor(req));
      res.json({ success: true, data: { lista, enderecos } });
    } catch (err: any) {
      erro(res, err, `remover e-mail ${id}`);
    }
  }

  /** GET /api/agendamentos/:id/historico — quem mudou o quê. */
  async historico(req: Request, res: Response): Promise<void> {
    const id = String(req.params['id'] ?? '');
    try {
      res.json({ success: true, data: await agendamentoConfigService.historico(id) });
    } catch (err: any) {
      erro(res, err, `histórico ${id}`);
    }
  }

  /**
   * POST /api/agendamentos/:id/executar — roda agora, fora do horário.
   *
   * Responde assim que dispara: a cota leva mais de uma hora e o DET passa de
   * uma hora também. Segurar a requisição até o fim só produziria timeout no
   * navegador e a impressão de que falhou.
   */
  async executarAgora(req: Request, res: Response): Promise<void> {
    const id = String(req.params['id'] ?? '');
    const cat = buscarNoCatalogo(id);
    const acao = ACOES[id];
    if (!cat || !acao || !cat.executarAgora) {
      res.status(400).json({ success: false, error: 'Este agendamento não pode ser executado por aqui.' });
      return;
    }
    const quem = autor(req);
    console.log(`[AGENDAMENTOS] execução manual de ${id} pedida por ${quem}`);
    void acao().catch((err: any) => console.error(`[AGENDAMENTOS] ${id} falhou:`, err?.message || err));
    res.status(202).json({ success: true, data: { id, iniciado: true } });
  }
}

export default new AgendamentoController();

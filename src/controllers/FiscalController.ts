/**
 * FiscalController — endpoints da aba Fiscal (ficha por colaborador).
 *
 * Só validação de entrada e formato de resposta; a regra vive no serviço.
 * Erro de dado do usuário sai como 400 com a frase pronta para a tela mostrar;
 * qualquer outro vira 500 com log, porque aí é bug nosso, não digitação dele.
 */

import { Request, Response } from 'express';
import fiscalFichaService, { ErroValidacao } from '../services/FiscalFichaService';
import { opcoesFicha } from '../services/FiscalOpcoes';
import { enviarAviso } from '../services/fiscal.email';

/** `id` de rota → inteiro positivo, ou null quando veio lixo. */
function idNumerico(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export class FiscalController {
  /** As três listas fechadas que a tela usa nos selects. */
  async opcoes(_req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: opcoesFicha() });
  }

  /** Colaboradores ativos, já com o progresso de cada um. */
  async colaboradores(_req: Request, res: Response): Promise<void> {
    try {
      const data = await fiscalFichaService.listarColaboradores();
      res.json({ success: true, data });
    } catch (err: any) {
      console.error('[FISCAL] colaboradores:', err);
      res.status(500).json({ success: false, error: 'Erro ao listar colaboradores.' });
    }
  }

  /** A carteira de um colaborador. */
  async ficha(req: Request, res: Response): Promise<void> {
    const colaboradorId = idNumerico(req.query.colaboradorId);
    if (colaboradorId === null) {
      res.status(400).json({ success: false, error: 'Informe o colaborador.' });
      return;
    }
    try {
      const data = await fiscalFichaService.listarFicha(colaboradorId);
      res.json({ success: true, data });
    } catch (err: any) {
      console.error('[FISCAL] ficha:', err);
      res.status(500).json({ success: false, error: 'Erro ao carregar a ficha.' });
    }
  }

  /** Salva o que foi preenchido numa linha. */
  async atualizar(req: Request, res: Response): Promise<void> {
    const fichaId = idNumerico(req.params.id);
    if (fichaId === null) {
      res.status(400).json({ success: false, error: 'Linha inválida.' });
      return;
    }
    try {
      const linha = await fiscalFichaService.atualizar(fichaId, req.body ?? {});
      if (!linha) {
        res.status(404).json({ success: false, error: 'Linha não encontrada.' });
        return;
      }
      res.json({ success: true, data: linha });
    } catch (err: any) {
      if (err instanceof ErroValidacao) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      console.error('[FISCAL] atualizar:', err);
      res.status(500).json({ success: false, error: 'Erro ao salvar.' });
    }
  }

  /** Põe um cliente já cadastrado na carteira do colaborador. */
  async adicionar(req: Request, res: Response): Promise<void> {
    const colaboradorId = idNumerico(req.body?.colaboradorId);
    const clienteId = typeof req.body?.clienteId === 'string' ? req.body.clienteId.trim() : '';
    if (colaboradorId === null || clienteId === '') {
      res.status(400).json({ success: false, error: 'Informe o colaborador e a empresa.' });
      return;
    }
    try {
      const { linha, aviso } = await fiscalFichaService.adicionar(colaboradorId, clienteId);
      res.status(201).json({ success: true, data: linha, aviso });
    } catch (err: any) {
      if (err instanceof ErroValidacao) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      console.error('[FISCAL] adicionar:', err);
      res.status(500).json({ success: false, error: 'Erro ao adicionar a empresa.' });
    }
  }

  /** Marca "essa empresa não é minha" — a linha fica, riscada. */
  async inutilizar(req: Request, res: Response): Promise<void> {
    const fichaId = idNumerico(req.params.id);
    if (fichaId === null) {
      res.status(400).json({ success: false, error: 'Linha inválida.' });
      return;
    }
    try {
      const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo : null;
      const linha = await fiscalFichaService.inutilizar(fichaId, motivo);
      if (!linha) {
        res.status(404).json({ success: false, error: 'Linha não encontrada.' });
        return;
      }
      res.json({ success: true, data: linha });
    } catch (err: any) {
      if (err instanceof ErroValidacao) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      console.error('[FISCAL] inutilizar:', err);
      res.status(500).json({ success: false, error: 'Erro ao inutilizar a linha.' });
    }
  }

  /** Desfaz o "não é minha". */
  async reativar(req: Request, res: Response): Promise<void> {
    const fichaId = idNumerico(req.params.id);
    if (fichaId === null) {
      res.status(400).json({ success: false, error: 'Linha inválida.' });
      return;
    }
    try {
      const linha = await fiscalFichaService.reativar(fichaId);
      if (!linha) {
        res.status(404).json({ success: false, error: 'Linha não encontrada.' });
        return;
      }
      res.json({ success: true, data: linha });
    } catch (err: any) {
      console.error('[FISCAL] reativar:', err);
      res.status(500).json({ success: false, error: 'Erro ao reativar a linha.' });
    }
  }

  /**
   * Dispara o aviso de preenchimento por e-mail.
   *
   * Responde 200 mesmo quando o SMTP falha, com `enviado: false` e o motivo: a
   * tela precisa mostrar a frase ao usuário, e um 500 aqui só diria "deu erro".
   */
  async aviso(req: Request, res: Response): Promise<void> {
    try {
      const colaboradores = await fiscalFichaService.listarColaboradores();
      // `para` no corpo permite mandar para outro endereço sem mexer no .env —
      // útil para conferir o layout antes de disparar para a equipe.
      const para = Array.isArray(req.body?.para)
        ? req.body.para.map((e: unknown) => String(e).trim()).filter(Boolean)
        : undefined;
      const r = await enviarAviso(colaboradores, para);
      res.json({ success: true, data: r });
    } catch (err: any) {
      console.error('[FISCAL] aviso:', err);
      res.status(500).json({ success: false, error: 'Erro ao enviar o aviso.' });
    }
  }

  /** Clientes do cadastro que ainda não estão na carteira — para o "adicionar". */
  async clientesDisponiveis(req: Request, res: Response): Promise<void> {
    const colaboradorId = idNumerico(req.query.colaboradorId);
    if (colaboradorId === null) {
      res.status(400).json({ success: false, error: 'Informe o colaborador.' });
      return;
    }
    try {
      const termo = typeof req.query.q === 'string' ? req.query.q : '';
      const limite = Number(req.query.limite) || 30;
      const data = await fiscalFichaService.clientesDisponiveis(colaboradorId, termo, limite);
      res.json({ success: true, data });
    } catch (err: any) {
      console.error('[FISCAL] clientesDisponiveis:', err);
      res.status(500).json({ success: false, error: 'Erro ao buscar empresas.' });
    }
  }
}

export default FiscalController;

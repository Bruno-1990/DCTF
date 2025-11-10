import { Request, Response } from 'express';
import { Flag } from '../models/Flag';
import { FlagValidationService } from '../services/FlagValidationService';

export class FlagController {
  private flags = new Flag();
  private validation = new FlagValidationService();

  async listarFlags(req: Request, res: Response): Promise<void> {
    try {
      const { page, limit, declaracaoId, codigo, severidade, resolvido, orderBy, order } = req.query;
      const result = await this.flags.search({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        declaracaoId: declaracaoId ? String(declaracaoId) : undefined,
        codigoFlag: codigo ? String(codigo) : undefined,
        severidade: severidade ? String(severidade) : undefined,
        resolvido: typeof resolvido === 'string' ? resolvido === 'true' : undefined,
        orderBy: orderBy ? String(orderBy) : undefined,
        order: order === 'asc' ? 'asc' : order === 'desc' ? 'desc' : undefined,
      });

      if (!result.success || !result.data) {
        res.status(400).json(result);
        return;
      }

      res.json({
        success: true,
        data: result.data.items,
        pagination: result.data.pagination,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  async obterFlag(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const result = await this.flags.findById(id);
      if (!result.success || !result.data) {
        res.status(404).json(result);
        return;
      }
      res.json({ success: true, data: result.data });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  async resolverFlag(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { resolucao } = req.body;
      const result = await this.flags.resolverFlag(id, resolucao);
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  async reabrirFlag(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const result = await this.flags.reabrirFlag(id);
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  async executarValidacao(req: Request, res: Response): Promise<void> {
    try {
      const { declaracaoId, clienteId, periodo } = req.body;

      if (declaracaoId) {
        const result = await this.validation.runForDeclaracao(declaracaoId);
        res.json({ success: true, data: result });
        return;
      }

      if (clienteId) {
        const result = await this.validation.runForCliente(clienteId);
        res.json({ success: true, data: result });
        return;
      }

      if (periodo) {
        const result = await this.validation.runForPeriodo(periodo);
        res.json({ success: true, data: result });
        return;
      }

      const result = await this.validation.runForAll();
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }
}



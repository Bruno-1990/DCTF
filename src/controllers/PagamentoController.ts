/**
 * Controller para gerenciar pagamentos de débitos DCTF
 */

import { Request, Response } from 'express';
import { PagamentoService, FiltroPagamento, UpdatePagamentoRequest } from '../services/PagamentoService';
import { ApiResponse } from '../types';

export class PagamentoController {
  private pagamentoService: PagamentoService;

  constructor() {
    this.pagamentoService = new PagamentoService();
  }

  /**
   * GET /api/pagamentos
   * Lista débitos com filtros opcionais
   */
  async listarDebitos(req: Request, res: Response): Promise<void> {
    try {
      const filtros: FiltroPagamento = {
        clienteId: req.query.clienteId as string | undefined,
        cnpj: req.query.cnpj as string | undefined,
        periodo: req.query.periodo as string | undefined,
        apenasPendentes: req.query.apenasPendentes === 'true',
        saldoMinimo: req.query.saldoMinimo ? Number(req.query.saldoMinimo) : undefined,
      };

      if (req.query.statusPagamento) {
        const status = req.query.statusPagamento as string;
        filtros.statusPagamento = status.includes(',') 
          ? status.split(',') as any
          : status as any;
      }

      const debitos = await this.pagamentoService.buscarDebitos(filtros);

      const response: ApiResponse = {
        success: true,
        data: debitos,
      };

      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };

      res.status(500).json(response);
    }
  }

  /**
   * GET /api/pagamentos/estatisticas
   * Obtém estatísticas de pagamento
   */
  async obterEstatisticas(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.pagamentoService.obterEstatisticas();

      const response: ApiResponse = {
        success: true,
        data: stats,
      };

      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };

      res.status(500).json(response);
    }
  }

  /**
   * PUT /api/pagamentos/:id
   * Atualiza status de pagamento de um débito
   */
  async atualizarPagamento(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const dados: UpdatePagamentoRequest = {
        statusPagamento: req.body.statusPagamento,
        dataPagamento: req.body.dataPagamento,
        comprovantePagamento: req.body.comprovantePagamento,
        observacoesPagamento: req.body.observacoesPagamento,
        usuarioQueAtualizou: req.body.usuarioQueAtualizou || 'sistema',
      };

      if (!dados.statusPagamento) {
        const response: ApiResponse = {
          success: false,
          error: 'statusPagamento é obrigatório',
        };
        res.status(400).json(response);
        return;
      }

      const dctf = await this.pagamentoService.atualizarPagamento(id, dados);

      const response: ApiResponse = {
        success: true,
        data: dctf,
        message: 'Status de pagamento atualizado com sucesso',
      };

      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };

      res.status(500).json(response);
    }
  }

  /**
   * PUT /api/pagamentos/lote
   * Atualiza status de pagamento de múltiplos débitos
   */
  async atualizarPagamentoEmLote(req: Request, res: Response): Promise<void> {
    try {
      const { ids, ...dados } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        const response: ApiResponse = {
          success: false,
          error: 'ids é obrigatório e deve ser um array não vazio',
        };
        res.status(400).json(response);
        return;
      }

      if (!dados.statusPagamento) {
        const response: ApiResponse = {
          success: false,
          error: 'statusPagamento é obrigatório',
        };
        res.status(400).json(response);
        return;
      }

      const updateData: UpdatePagamentoRequest = {
        statusPagamento: dados.statusPagamento,
        dataPagamento: dados.dataPagamento,
        comprovantePagamento: dados.comprovantePagamento,
        observacoesPagamento: dados.observacoesPagamento,
        usuarioQueAtualizou: dados.usuarioQueAtualizou || 'sistema',
      };

      const quantidadeAtualizada = await this.pagamentoService.atualizarPagamentoEmLote(
        ids,
        updateData
      );

      const response: ApiResponse = {
        success: true,
        data: { quantidadeAtualizada },
        message: `${quantidadeAtualizada} débito(s) atualizado(s) com sucesso`,
      };

      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };

      res.status(500).json(response);
    }
  }
}


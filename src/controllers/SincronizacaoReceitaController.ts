/**
 * Controller para sincronizar dados de pagamento com a Receita Federal
 */

import { Request, Response } from 'express';
import { SincronizacaoReceitaService } from '../services/SincronizacaoReceitaService';
import { ApiResponse } from '../types';

export class SincronizacaoReceitaController {
  private sincronizacaoService: SincronizacaoReceitaService;

  constructor() {
    this.sincronizacaoService = new SincronizacaoReceitaService();

    // Configurar autenticação se token estiver disponível
    const token = process.env['RECEITA_API_TOKEN'];
    if (token) {
      this.sincronizacaoService.configurarAutenticacao(token);
    }
  }

  /**
   * POST /api/pagamentos/sincronizar/cliente
   * Sincroniza pagamentos de um cliente específico
   */
  async sincronizarCliente(req: Request, res: Response): Promise<void> {
    try {
      const { cnpj, periodoInicial, periodoFinal } = req.body;

      if (!cnpj) {
        const response: ApiResponse = {
          success: false,
          error: 'CNPJ é obrigatório',
        };
        res.status(400).json(response);
        return;
      }

      const resultado = await this.sincronizacaoService.sincronizarCliente(
        cnpj,
        periodoInicial,
        periodoFinal
      );

      const response: ApiResponse = {
        success: true,
        data: resultado,
        message: `Sincronização concluída: ${resultado.totalAtualizados} atualizado(s), ${resultado.totalErros} erro(s)`,
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
   * POST /api/pagamentos/sincronizar/todos
   * Sincroniza pagamentos de todos os clientes com débitos pendentes
   */
  async sincronizarTodos(req: Request, res: Response): Promise<void> {
    try {
      const { periodoInicial, periodoFinal, limiteClientes } = req.body;

      // Limitar número de clientes por padrão para evitar sobrecarga
      const limite = limiteClientes || 10;

      const resultado = await this.sincronizacaoService.sincronizarTodos(
        periodoInicial,
        periodoFinal,
        limite
      );

      const response: ApiResponse = {
        success: true,
        data: resultado,
        message: `Sincronização concluída: ${resultado.totalAtualizados} atualizado(s) de ${resultado.totalConsultados} consultado(s)`,
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
   * POST /api/pagamentos/sincronizar/debito/:id
   * Sincroniza um débito específico
   */
  async sincronizarDebito(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const resultado = await this.sincronizacaoService.sincronizarDebito(id);

      const response: ApiResponse = {
        success: true,
        data: resultado,
        message: resultado.totalAtualizados > 0
          ? 'Débito sincronizado com sucesso'
          : 'Nenhum pagamento correspondente encontrado na Receita',
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


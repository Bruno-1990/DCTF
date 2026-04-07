/**
 * Controller para consultas simples e em lote na Receita Federal
 */

import { Request, Response } from 'express';
import { ConsultaReceitaService } from '../services/ConsultaReceitaService';
import { ApiResponse } from '../types';

export class ConsultaReceitaController {
  private consultaService: ConsultaReceitaService;

  constructor() {
    this.consultaService = new ConsultaReceitaService();

    // Configurar autenticação se token estiver disponível
    const token = process.env['RECEITA_API_TOKEN'];
    if (token) {
      this.consultaService.configurarAutenticacao(token);
    }
  }

  /**
   * GET /api/receita/validar-token
   * Valida o token de acesso configurado (e opcionalmente a autorização para um CNPJ)
   * Query params:
   *  - cnpj?: string (opcional, para validar se há autorização para este contribuinte)
   */
  async validarToken(req: Request, res: Response): Promise<void> {
    try {
      const { cnpj } = req.query as { cnpj?: string };
      const result = await this.consultaService.validarAcesso(cnpj);
      const response: ApiResponse = {
        success: result.ok,
        message: result.mensagem,
      };
      res.status(result.ok ? 200 : 401).json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao validar token/acesso',
      };
      res.status(500).send(response);
    }
  }
}


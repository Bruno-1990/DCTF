/**
 * Controlador para operações de Relatório
 * Gerencia as requisições HTTP relacionadas aos relatórios
 */

import { Request, Response } from 'express';
import { Relatorio } from '../models/Relatorio';
import { ApiResponse } from '../types';

export class RelatorioController {
  private relatorioModel: Relatorio;

  constructor() {
    this.relatorioModel = new Relatorio();
  }

  /**
   * Listar todos os relatórios
   */
  async listarRelatorios(req: Request, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 10, declaracaoId, tipoRelatorio } = req.query;
      
      let result: ApiResponse<any>;
      
      // Buscar relatórios com filtros
      if (declaracaoId) {
        result = await this.relatorioModel.findByDeclaracao(declaracaoId as string);
      } else {
        result = await this.relatorioModel.findAll();
      }

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      let filteredData = result.data || [];

      // Aplicar filtros adicionais
      if (tipoRelatorio) {
        filteredData = filteredData.filter((r: any) => r.tipoRelatorio === tipoRelatorio);
      }

      // Paginação
      const startIndex = (Number(page) - 1) * Number(limit);
      const endIndex = startIndex + Number(limit);
      const paginatedData = filteredData.slice(startIndex, endIndex);

      res.json({
        success: true,
        data: paginatedData,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: filteredData.length,
          totalPages: Math.ceil(filteredData.length / Number(limit)),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Obter relatório por ID
   */
  async obterRelatorio(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID do relatório é obrigatório',
        });
        return;
      }

      const result = await this.relatorioModel.findById(id);

      if (!result.success) {
        res.status(404).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Criar novo relatório
   */
  async criarRelatorio(req: Request, res: Response): Promise<void> {
    try {
      const relatorioData = req.body;

      const result = await this.relatorioModel.createRelatorio(relatorioData);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Atualizar relatório
   */
  async atualizarRelatorio(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID do relatório é obrigatório',
        });
        return;
      }

      const result = await this.relatorioModel.updateRelatorio(id, updates);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Deletar relatório
   */
  async deletarRelatorio(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID do relatório é obrigatório',
        });
        return;
      }

      const result = await this.relatorioModel.delete(id);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json({
        success: true,
        message: 'Relatório deletado com sucesso',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Obter relatórios por declaração
   */
  async obterRelatoriosPorDeclaracao(req: Request, res: Response): Promise<void> {
    try {
      const { declaracaoId } = req.params;

      if (!declaracaoId) {
        res.status(400).json({
          success: false,
          error: 'ID da declaração é obrigatório',
        });
        return;
      }

      const result = await this.relatorioModel.findByDeclaracao(declaracaoId);

      if (!result.success) {
        res.status(404).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Gerar relatório
   */
  async gerarRelatorio(req: Request, res: Response): Promise<void> {
    try {
      const { declaracaoId, tipoRelatorio, parametros } = req.body;

      if (!declaracaoId || !tipoRelatorio) {
        res.status(400).json({
          success: false,
          error: 'ID da declaração e tipo de relatório são obrigatórios',
        });
        return;
      }

      // Mock temporário para geração de relatório
      const relatorioData = {
        declaracaoId,
        tipoRelatorio,
        titulo: `Relatório ${tipoRelatorio} - ${new Date().toLocaleDateString()}`,
        conteudo: `Conteúdo do relatório ${tipoRelatorio} gerado automaticamente...`,
        arquivoPdf: `http://example.com/relatorio-${Date.now()}.pdf`,
        parametros: parametros || {},
      };

      const result = await this.relatorioModel.createRelatorio(relatorioData);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }
}

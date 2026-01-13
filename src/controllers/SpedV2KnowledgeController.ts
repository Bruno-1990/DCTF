/**
 * Controller para consulta de documentos legais (SPED v2.0)
 * Gerencia requisições HTTP relacionadas ao sistema de conhecimento
 */

import { Request, Response } from 'express';
import { ApiResponse } from '../types';
import { SpedV2KnowledgeService } from '../services/SpedV2KnowledgeService';

export class SpedV2KnowledgeController {
  private service: SpedV2KnowledgeService;

  constructor() {
    this.service = new SpedV2KnowledgeService();
  }

  /**
   * Listar documentos por período/vigência
   * GET /api/sped/v2/knowledge/documents
   * Query params: periodo (MM/YYYY), tipo, status, limit, offset
   */
  async listDocuments(req: Request, res: Response): Promise<void> {
    try {
      const { periodo, tipo, status, limit, offset } = req.query;
      
      const filters = {
        periodo: periodo as string | undefined,
        tipo: tipo as string | undefined,
        status: status as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      };
      
      const result = await this.service.listDocuments(filters);
      
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      
      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao listar documentos',
        data: null
      } as ApiResponse);
    }
  }

  /**
   * Busca semântica (RAG)
   * GET /api/sped/v2/knowledge/query
   * Query params: q (obrigatório), n_results, document_id, min_score
   */
  async queryDocuments(req: Request, res: Response): Promise<void> {
    try {
      const { q, n_results, document_id, min_score } = req.query;
      
      // Validar query obrigatória
      if (!q || (typeof q === 'string' && q.trim().length === 0)) {
        res.status(400).json({
          success: false,
          error: 'Parâmetro "q" (query) é obrigatório e não pode estar vazio',
          data: null
        } as ApiResponse);
        return;
      }
      
      const filters = {
        query: q as string,
        n_results: n_results ? parseInt(n_results as string, 10) : undefined,
        document_id: document_id as string | undefined,
        min_score: min_score ? parseFloat(min_score as string) : undefined,
      };
      
      const result = await this.service.queryDocuments(filters);
      
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      
      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao buscar documentos',
        data: null
      } as ApiResponse);
    }
  }

  /**
   * Buscar regras estruturadas
   * GET /api/sped/v2/knowledge/rules
   * Query params: categoria, tipo, periodo (MM/YYYY), document_id, limit, offset
   */
  async getRules(req: Request, res: Response): Promise<void> {
    try {
      const { categoria, tipo, periodo, document_id, limit, offset } = req.query;
      
      const filters = {
        categoria: categoria as string | undefined,
        tipo: tipo as string | undefined,
        periodo: periodo as string | undefined,
        document_id: document_id as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      };
      
      const result = await this.service.getRules(filters);
      
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      
      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao buscar regras',
        data: null
      } as ApiResponse);
    }
  }

  /**
   * Gerar regra consultando documentos
   * POST /api/sped/v2/knowledge/generate-rule
   */
  async generateRule(req: Request, res: Response): Promise<void> {
    try {
      // TODO: Implementar na subtask 37.5
      res.status(200).json({
        success: true,
        data: null,
        message: 'Endpoint em implementação'
      } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao gerar regra',
        data: null
      } as ApiResponse);
    }
  }
}


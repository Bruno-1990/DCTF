/**
 * Controlador para operações de Cliente
 * Gerencia as requisições HTTP relacionadas aos clientes
 */

import { Request, Response } from 'express';
import { Cliente } from '../models/Cliente';
import { ApiResponse } from '../types';

export class ClienteController {
  private clienteModel: Cliente;

  constructor() {
    this.clienteModel = new Cliente();
  }

  /**
   * Listar todos os clientes
   */
  async listarClientes(req: Request, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 10, search, nome, cnpj } = req.query;

      let result: ApiResponse<any> = await this.clienteModel.findAll();

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      let data = result.data || [];

      // Filtros (compatível com 'search' legado e novos 'nome'/'cnpj')
      const q = (nome as string) || (search as string) || '';
      if (q) {
        const qLower = q.toLowerCase();
        data = data.filter((c: any) => 
          (c.razao_social || c.nome || '').toLowerCase().includes(qLower)
        );
      }

      if (cnpj) {
        const cnpjStr = String(cnpj).replace(/\D/g, '');
        data = data.filter((c: any) => 
          String(c.cnpj_limpo || c.cnpj || '').replace(/\D/g, '').includes(cnpjStr)
        );
      }

      // Paginação
      const pageNum = Number(page);
      const limitNum = Number(limit);
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;
      const paginatedData = data.slice(startIndex, endIndex);

      res.json({
        success: true,
        data: paginatedData,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: data.length,
          totalPages: Math.ceil(data.length / limitNum),
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
   * Obter cliente por ID
   */
  async obterCliente(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID do cliente é obrigatório',
        });
        return;
      }

      const result = await this.clienteModel.findById(id);

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
   * Criar novo cliente
   */
  async criarCliente(req: Request, res: Response): Promise<void> {
    try {
      const clienteData = req.body;

      const result = await this.clienteModel.createCliente(clienteData);

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
   * Atualizar cliente
   */
  async atualizarCliente(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID do cliente é obrigatório',
        });
        return;
      }

      const result = await this.clienteModel.updateCliente(id, updates);

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
   * Deletar cliente
   */
  async deletarCliente(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID do cliente é obrigatório',
        });
        return;
      }

      const result = await this.clienteModel.delete(id);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json({
        success: true,
        message: 'Cliente deletado com sucesso',
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
   * Importar clientes em lote via JSON
   * Body esperado: { clientes: [{ nome: string, cnpj: string, email?, telefone?, endereco? }, ...] }
   */
  async importarClientesJson(req: Request, res: Response): Promise<void> {
    try {
      const { clientes } = req.body as any;
      if (!Array.isArray(clientes) || clientes.length === 0) {
        res.status(400).json({ success: false, error: 'Campo "clientes" é obrigatório e deve ser um array não-vazio' });
        return;
      }

      const resultados: { ok: number; fail: number; erros: string[] } = { ok: 0, fail: 0, erros: [] };
      for (const item of clientes) {
        try {
          const resp = await this.clienteModel.createCliente(item);
          if (resp.success) {
            resultados.ok += 1;
          } else {
            resultados.fail += 1;
            if (resp.error) resultados.erros.push(resp.error);
          }
        } catch (e: any) {
          resultados.fail += 1;
          resultados.erros.push(e?.message || 'Erro desconhecido');
        }
      }

      res.json({ success: resultados.fail === 0, data: resultados });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' });
    }
  }

  /**
   * Buscar cliente por CNPJ
   */
  async buscarPorCNPJ(req: Request, res: Response): Promise<void> {
    try {
      const { cnpj } = req.params;

      if (!cnpj) {
        res.status(400).json({
          success: false,
          error: 'CNPJ é obrigatório',
        });
        return;
      }

      const result = await this.clienteModel.findByCNPJ(cnpj);

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
   * Obter estatísticas dos clientes
   */
  async obterEstatisticas(_req: Request, res: Response): Promise<void> {
    try {
      const result = await this.clienteModel.getStats();

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
}

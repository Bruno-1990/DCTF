/**
 * Controlador para Códigos DCTF
 * Gerencia endpoints para códigos, categorias e validações
 */

import { Request, Response } from 'express';
import { DCTFCodesService } from '../services/DCTFCodesService';
import { DCTFCode, DCTFReceitaCode, DCTFAliquota } from '../models/DCTFCode';

export class DCTFCodesController {
  /**
   * GET /api/dctf-codes
   * Listar todos os códigos DCTF
   */
  static async listCodes(req: Request, res: Response): Promise<void> {
    try {
      const { tipo, ativo, periodo } = req.query;
      
      let codes;
      if (periodo) {
        codes = await DCTFCodesService.getActiveCodesInPeriod(
          periodo as string,
          tipo as any
        );
      } else {
        const dctfCodeModel = new DCTFCode();
        codes = await dctfCodeModel.findAll();
      }

      res.json({
        success: true,
        data: codes,
        total: codes.length
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/dctf-codes/hierarchy
   * Obter hierarquia de códigos por categoria
   */
  static async getHierarchy(req: Request, res: Response): Promise<void> {
    try {
      const hierarchy = await DCTFCodesService.getCodeHierarchy();
      
      res.json({
        success: true,
        data: hierarchy
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/dctf-codes/:codigo
   * Obter informações de um código específico
   */
  static async getCode(req: Request, res: Response): Promise<void> {
    try {
      const { codigo } = req.params;
      const { periodo } = req.query;

      const codeInfo = await DCTFCodesService.getCodeInfo(codigo);
      
      if (!codeInfo) {
        res.status(404).json({
          success: false,
          error: 'Código não encontrado'
        });
        return;
      }

      // Se período especificado, validar se está ativo
      if (periodo) {
        const validation = await DCTFCodesService.validateCode(codigo, periodo as string);
        codeInfo.ativo = validation.isValid;
      }

      res.json({
        success: true,
        data: codeInfo
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/dctf-codes/validate
   * Validar um ou mais códigos
   */
  static async validateCodes(req: Request, res: Response): Promise<void> {
    try {
      const { codigos, periodo, tipo } = req.body;

      if (!codigos || !Array.isArray(codigos)) {
        res.status(400).json({
          success: false,
          error: 'Lista de códigos é obrigatória'
        });
        return;
      }

      const results = await DCTFCodesService.validateCodeSet(codigos, periodo);

      res.json({
        success: true,
        data: results
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/dctf-codes/search
   * Buscar códigos por descrição
   */
  static async searchCodes(req: Request, res: Response): Promise<void> {
    try {
      const { q, tipo } = req.query;

      if (!q) {
        res.status(400).json({
          success: false,
          error: 'Parâmetro de busca (q) é obrigatório'
        });
        return;
      }

      const codes = await DCTFCodesService.searchCodesByDescription(
        q as string,
        tipo as any
      );

      res.json({
        success: true,
        data: codes,
        total: codes.length
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/dctf-codes/statistics
   * Obter estatísticas dos códigos
   */
  static async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const stats = await DCTFCodesService.getCodeStatistics();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/dctf-codes/aliquota/:codigo
   * Obter alíquota para um código e período
   */
  static async getAliquota(req: Request, res: Response): Promise<void> {
    try {
      const { codigo } = req.params;
      const { periodo } = req.query;

      if (!periodo) {
        res.status(400).json({
          success: false,
          error: 'Parâmetro período é obrigatório'
        });
        return;
      }

      const aliquota = await DCTFCodesService.getAliquotaForCode(codigo, periodo as string);
      
      if (!aliquota) {
        res.status(404).json({
          success: false,
          error: 'Alíquota não encontrada para o código e período especificados'
        });
        return;
      }

      res.json({
        success: true,
        data: aliquota
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/dctf-codes/export
   * Exportar códigos para CSV
   */
  static async exportCodes(req: Request, res: Response): Promise<void> {
    try {
      const { tipo } = req.query;
      
      const csvContent = await DCTFCodesService.exportCodesToCSV(tipo as any);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="dctf-codes.csv"');
      res.send(csvContent);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/dctf-codes
   * Criar novo código DCTF
   */
  static async createCode(req: Request, res: Response): Promise<void> {
    try {
      const dctfCodeModel = new DCTFCode();
      
      // Validar dados
      const validation = dctfCodeModel.validate(req.body);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: 'Dados inválidos',
          details: validation.errors
        });
        return;
      }

      const code = await dctfCodeModel.create(req.body);
      
      res.status(201).json({
        success: true,
        data: code
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * PUT /api/dctf-codes/:codigo
   * Atualizar código DCTF
   */
  static async updateCode(req: Request, res: Response): Promise<void> {
    try {
      const { codigo } = req.params;
      const dctfCodeModel = new DCTFCode();
      
      // Validar dados
      const validation = dctfCodeModel.validate(req.body);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: 'Dados inválidos',
          details: validation.errors
        });
        return;
      }

      const code = await dctfCodeModel.update(codigo, req.body);
      
      if (!code) {
        res.status(404).json({
          success: false,
          error: 'Código não encontrado'
        });
        return;
      }

      res.json({
        success: true,
        data: code
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * DELETE /api/dctf-codes/:codigo
   * Desativar código DCTF (soft delete)
   */
  static async deleteCode(req: Request, res: Response): Promise<void> {
    try {
      const { codigo } = req.params;
      const dctfCodeModel = new DCTFCode();
      
      // Desativar em vez de deletar
      const code = await dctfCodeModel.update(codigo, { ativo: false });
      
      if (!code) {
        res.status(404).json({
          success: false,
          error: 'Código não encontrado'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Código desativado com sucesso'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/dctf-codes/receita
   * Listar códigos de receita
   */
  static async listReceitaCodes(req: Request, res: Response): Promise<void> {
    try {
      const { categoria, subcategoria } = req.query;
      const receitaCodeModel = new DCTFReceitaCode();
      
      let codes;
      if (categoria) {
        codes = await receitaCodeModel.findByCategoria(categoria as string);
      } else if (subcategoria) {
        codes = await receitaCodeModel.findBySubcategoria(subcategoria as string);
      } else {
        codes = await receitaCodeModel.findAll();
      }

      res.json({
        success: true,
        data: codes,
        total: codes.length
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/dctf-codes/aliquotas
   * Listar alíquotas por período
   */
  static async listAliquotas(req: Request, res: Response): Promise<void> {
    try {
      const { periodo } = req.query;
      const aliquotaModel = new DCTFAliquota();
      
      let aliquotas;
      if (periodo) {
        aliquotas = await aliquotaModel.findByPeriod(periodo as string);
      } else {
        aliquotas = await aliquotaModel.findAll();
      }

      res.json({
        success: true,
        data: aliquotas,
        total: aliquotas.length
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

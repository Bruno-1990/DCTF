/**
 * Controlador para Regras de Cálculo Fiscal DCTF
 * Gerencia cálculos, validações e regras fiscais
 */

import { Request, Response } from 'express';
import { DCTFCalculationService } from '../services/DCTFCalculationService';
import { DCTFCodesService } from '../services/DCTFCodesService';

export class FiscalCalculationController {
  /**
   * POST /api/fiscal/calculate-imposto
   * Calcular imposto com base na alíquota
   */
  static async calculateImposto(req: Request, res: Response): Promise<void> {
    try {
      const { baseCalculo, codigoDctf, periodo, codigoReceita } = req.body;

      if (!baseCalculo || !codigoDctf || !periodo) {
        res.status(400).json({
          success: false,
          error: 'baseCalculo, codigoDctf e periodo são obrigatórios'
        });
        return;
      }

      const result = await DCTFCalculationService.calcularImposto(
        baseCalculo,
        codigoDctf,
        periodo,
        codigoReceita
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/fiscal/validate-total
   * Validar total de uma seção DCTF
   */
  static async validateTotal(req: Request, res: Response): Promise<void> {
    try {
      const { totalInformado, itens, periodo } = req.body;

      if (!totalInformado || !itens || !periodo) {
        res.status(400).json({
          success: false,
          error: 'totalInformado, itens e periodo são obrigatórios'
        });
        return;
      }

      if (!Array.isArray(itens)) {
        res.status(400).json({
          success: false,
          error: 'itens deve ser um array'
        });
        return;
      }

      const result = DCTFCalculationService.validarTotal(totalInformado, itens, periodo);

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/fiscal/calculate-compensacao
   * Calcular compensação de impostos
   */
  static async calculateCompensacao(req: Request, res: Response): Promise<void> {
    try {
      const { valorDevido, valorCompensar, limiteCompensacao } = req.body;

      if (!valorDevido || !valorCompensar) {
        res.status(400).json({
          success: false,
          error: 'valorDevido e valorCompensar são obrigatórios'
        });
        return;
      }

      const result = DCTFCalculationService.calcularCompensacao(
        valorDevido,
        valorCompensar,
        limiteCompensacao
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/fiscal/calculate-aliquota-efetiva
   * Calcular alíquota efetiva
   */
  static async calculateAliquotaEfetiva(req: Request, res: Response): Promise<void> {
    try {
      const { baseCalculo, valorImposto } = req.body;

      if (!baseCalculo || !valorImposto) {
        res.status(400).json({
          success: false,
          error: 'baseCalculo e valorImposto são obrigatórios'
        });
        return;
      }

      const result = DCTFCalculationService.calcularAliquotaEfetiva(
        baseCalculo,
        valorImposto
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/fiscal/validate-consistency
   * Validar consistência de dados DCTF
   */
  static async validateConsistency(req: Request, res: Response): Promise<void> {
    try {
      const { receitaBruta, deducoes, receitaLiquida, impostos, periodo } = req.body;

      if (!receitaBruta || !receitaLiquida || !impostos || !periodo) {
        res.status(400).json({
          success: false,
          error: 'receitaBruta, receitaLiquida, impostos e periodo são obrigatórios'
        });
        return;
      }

      const result = DCTFCalculationService.validarConsistenciaDCTF({
        receitaBruta,
        deducoes: deducoes || 0,
        receitaLiquida,
        impostos,
        periodo
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/fiscal/calculate-totals-by-category
   * Calcular total de impostos por categoria
   */
  static async calculateTotalsByCategory(req: Request, res: Response): Promise<void> {
    try {
      const { itens } = req.body;

      if (!itens || !Array.isArray(itens)) {
        res.status(400).json({
          success: false,
          error: 'itens é obrigatório e deve ser um array'
        });
        return;
      }

      const result = DCTFCalculationService.calcularTotalImpostosPorCategoria(itens);

      // Converter Map para objeto
      const totals = Object.fromEntries(result);

      res.json({
        success: true,
        data: {
          totais: totals,
          categorias: Object.keys(totals),
          totalGeral: Object.values(totals).reduce((sum, val) => sum + val, 0)
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/fiscal/validate-rounding
   * Validar regras de arredondamento
   */
  static async validateRounding(req: Request, res: Response): Promise<void> {
    try {
      const { valorOriginal, valorArredondado, casasDecimais } = req.body;

      if (!valorOriginal || !valorArredondado) {
        res.status(400).json({
          success: false,
          error: 'valorOriginal e valorArredondado são obrigatórios'
        });
        return;
      }

      const result = DCTFCalculationService.validarArredondamento(
        valorOriginal,
        valorArredondado,
        casasDecimais
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/fiscal/calculate-variation
   * Calcular percentual de variação
   */
  static async calculateVariation(req: Request, res: Response): Promise<void> {
    try {
      const { valorAnterior, valorAtual } = req.body;

      if (!valorAnterior || !valorAtual) {
        res.status(400).json({
          success: false,
          error: 'valorAnterior e valorAtual são obrigatórios'
        });
        return;
      }

      const result = DCTFCalculationService.calcularPercentualVariacao(
        valorAnterior,
        valorAtual
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/fiscal/aliquota/:codigo
   * Obter alíquota para um código e período
   */
  static async getAliquota(req: Request, res: Response): Promise<void> {
    try {
      const { codigo } = req.params;
      const { periodo } = req.query;

      if (!periodo) {
        res.status(400).json({
          success: false,
          error: 'Parâmetro periodo é obrigatório'
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
   * GET /api/fiscal/calculation-rules
   * Obter regras de cálculo fiscal
   */
  static async getCalculationRules(req: Request, res: Response): Promise<void> {
    try {
      const rules = {
        arredondamento: {
          casasDecimais: 2,
          metodo: 'round',
          tolerancia: 0.01
        },
        compensacao: {
          limiteMaximo: 0.3, // 30% do valor devido
          periodoValidade: 5, // 5 anos
          ordem: 'FIFO' // First In, First Out
        },
        validacao: {
          toleranciaTotal: 0.01,
          validarPeriodo: true,
          validarCodigos: true,
          validarValores: true
        },
        calculos: {
          irrf: {
            aliquota: 0.015,
            baseCalculo: 'Valor da Operação',
            observacoes: 'Alíquota pode variar conforme o tipo de operação'
          },
          csll: {
            aliquota: 0.01,
            baseCalculo: 'Valor da Operação',
            observacoes: 'Contribuição Social sobre Lucro Líquido'
          },
          pis: {
            aliquota: 0.0065,
            baseCalculo: 'Valor da Operação',
            observacoes: 'Programa de Integração Social'
          },
          cofins: {
            aliquota: 0.03,
            baseCalculo: 'Valor da Operação',
            observacoes: 'Contribuição para Financiamento da Seguridade Social'
          }
        }
      };

      res.json({
        success: true,
        data: rules
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

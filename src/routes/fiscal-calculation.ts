/**
 * Rotas para Regras de Cálculo Fiscal DCTF
 * Endpoints para cálculos, validações e regras fiscais
 */

import { Router } from 'express';
import { FiscalCalculationController } from '../controllers/FiscalCalculationController';

const router = Router();

// ==============================================
// ROTAS DE CÁLCULO
// ==============================================

/**
 * POST /api/fiscal/calculate-imposto
 * Calcular imposto com base na alíquota
 * Body: { baseCalculo, codigoDctf, periodo, codigoReceita? }
 */
router.post('/calculate-imposto', FiscalCalculationController.calculateImposto);

/**
 * POST /api/fiscal/calculate-compensacao
 * Calcular compensação de impostos
 * Body: { valorDevido, valorCompensar, limiteCompensacao? }
 */
router.post('/calculate-compensacao', FiscalCalculationController.calculateCompensacao);

/**
 * POST /api/fiscal/calculate-aliquota-efetiva
 * Calcular alíquota efetiva
 * Body: { baseCalculo, valorImposto }
 */
router.post('/calculate-aliquota-efetiva', FiscalCalculationController.calculateAliquotaEfetiva);

/**
 * POST /api/fiscal/calculate-totals-by-category
 * Calcular total de impostos por categoria
 * Body: { itens: [{ valor, codigo, categoria }] }
 */
router.post('/calculate-totals-by-category', FiscalCalculationController.calculateTotalsByCategory);

/**
 * POST /api/fiscal/calculate-variation
 * Calcular percentual de variação
 * Body: { valorAnterior, valorAtual }
 */
router.post('/calculate-variation', FiscalCalculationController.calculateVariation);

// ==============================================
// ROTAS DE VALIDAÇÃO
// ==============================================

/**
 * POST /api/fiscal/validate-total
 * Validar total de uma seção DCTF
 * Body: { totalInformado, itens, periodo }
 */
router.post('/validate-total', FiscalCalculationController.validateTotal);

/**
 * POST /api/fiscal/validate-consistency
 * Validar consistência de dados DCTF
 * Body: { receitaBruta, deducoes?, receitaLiquida, impostos, periodo }
 */
router.post('/validate-consistency', FiscalCalculationController.validateConsistency);

/**
 * POST /api/fiscal/validate-rounding
 * Validar regras de arredondamento
 * Body: { valorOriginal, valorArredondado, casasDecimais? }
 */
router.post('/validate-rounding', FiscalCalculationController.validateRounding);

// ==============================================
// ROTAS DE INFORMAÇÕES
// ==============================================

/**
 * GET /api/fiscal/aliquota/:codigo
 * Obter alíquota para um código e período
 * Query params: periodo
 */
router.get('/aliquota/:codigo', FiscalCalculationController.getAliquota);

/**
 * GET /api/fiscal/calculation-rules
 * Obter regras de cálculo fiscal
 */
router.get('/calculation-rules', FiscalCalculationController.getCalculationRules);

export default router;


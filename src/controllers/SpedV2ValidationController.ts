/**
 * Controller para Validação SPED v2.0
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getSpedV2ValidationService } from '../services/SpedV2ValidationService';
import { sanitizeData } from '../middleware/validation';

const spedV2ValidationService = getSpedV2ValidationService();

/**
 * POST /api/sped/v2/validar
 * Inicia uma nova validação SPED v2.0
 */
export async function iniciarValidacao(req: Request, res: Response): Promise<void> {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    
    if (!files || !files.sped || files.sped.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Arquivo SPED é obrigatório'
      });
      return;
    }

    const spedFile = files.sped[0];
    const xmlFiles = files.xmls || [];

    // Obter dados opcionais do body
    const {
      clienteId,
      competencia,
      perfilFiscal
    } = req.body;

    // Criar ID de validação
    const validationId = uuidv4();

    // Preparar request
    const request = {
      validationId,
      spedBuffer: spedFile.buffer,
      xmlBuffers: xmlFiles.map(f => f.buffer),
      clienteId: clienteId || undefined,
      competencia: competencia || undefined,
      perfilFiscal: perfilFiscal ? JSON.parse(perfilFiscal) : undefined
    };

    // Iniciar validação
    const status = await spedV2ValidationService.iniciarValidacao(request);

    res.status(202).json({
      success: true,
      validationId: status.validationId,
      status: status.status,
      message: status.message
    });
  } catch (error: any) {
    console.error('[SpedV2ValidationController] Erro ao iniciar validação:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao iniciar validação'
    });
  }
}

/**
 * GET /api/sped/v2/status/:validationId
 * Obtém status de uma validação
 */
export async function obterStatus(req: Request, res: Response): Promise<void> {
  try {
    const { validationId } = req.params;

    if (!validationId) {
      res.status(400).json({
        success: false,
        error: 'validationId é obrigatório'
      });
      return;
    }

    const status = spedV2ValidationService.getStatus(validationId);

    if (!status) {
      res.status(404).json({
        success: false,
        error: 'Validação não encontrada'
      });
      return;
    }

    res.json({
      success: true,
      ...status
    });
  } catch (error: any) {
    console.error('[SpedV2ValidationController] Erro ao obter status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao obter status'
    });
  }
}

/**
 * GET /api/sped/v2/validacoes
 * Lista todas as validações
 */
export async function listarValidacoes(req: Request, res: Response): Promise<void> {
  try {
    const validacoes = spedV2ValidationService.listValidations();

    res.json({
      success: true,
      validacoes
    });
  } catch (error: any) {
    console.error('[SpedV2ValidationController] Erro ao listar validações:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao listar validações'
    });
  }
}

/**
 * DELETE /api/sped/v2/validacoes/:validationId
 * Remove uma validação
 */
export async function removerValidacao(req: Request, res: Response): Promise<void> {
  try {
    const { validationId } = req.params;

    if (!validationId) {
      res.status(400).json({
        success: false,
        error: 'validationId é obrigatório'
      });
      return;
    }

    const removido = spedV2ValidationService.removeValidation(validationId);

    if (!removido) {
      res.status(404).json({
        success: false,
        error: 'Validação não encontrada'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Validação removida com sucesso'
    });
  } catch (error: any) {
    console.error('[SpedV2ValidationController] Erro ao remover validação:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao remover validação'
    });
  }
}

/**
 * GET /api/sped/v2/resultado/:validationId
 * Obtém resultado de uma validação concluída
 */
export async function obterResultado(req: Request, res: Response): Promise<void> {
  try {
    const { validationId } = req.params;

    if (!validationId) {
      res.status(400).json({
        success: false,
        error: 'validationId é obrigatório'
      });
      return;
    }

    const status = spedV2ValidationService.getStatus(validationId);

    if (!status) {
      res.status(404).json({
        success: false,
        error: 'Validação não encontrada'
      });
      return;
    }

    if (status.status !== 'completed') {
      res.status(400).json({
        success: false,
        error: `Validação ainda não concluída. Status: ${status.status}`
      });
      return;
    }

    res.json({
      success: true,
      validationId: status.validationId,
      resultado: status.resultado,
      completedAt: status.completedAt
    });
  } catch (error: any) {
    console.error('[SpedV2ValidationController] Erro ao obter resultado:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao obter resultado'
    });
  }
}



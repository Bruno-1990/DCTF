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
    
    console.log(`[SpedV2ValidationController] ✅ Validação ${status.validationId} criada com status: ${status.status}`);

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
      // Log para debug - não é erro crítico, apenas status ainda não criado
      console.log(`[SpedV2ValidationController] ⚠️ Status não encontrado para ${validationId} (pode estar sendo criado ainda)`);
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

    // Extrair divergências do resultado
    const divergencias = status.resultado?.validacoes?.divergencias || [];
    
    res.json({
      success: true,
      validationId: status.validationId,
      resultado: status.resultado,
      divergencias: divergencias, // Adicionar divergências no nível raiz para compatibilidade
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

/**
 * POST /api/sped/v2/extract-metadata
 * Extrai metadados do arquivo SPED (CNPJ, competência, regime, etc)
 * Conforme Precheck: combina metadados do SPED com flags dos XMLs
 */
export async function extrairMetadados(req: Request, res: Response): Promise<void> {
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
    
    // Extrair metadados do SPED
    const metadataSped = await spedV2ValidationService.extrairMetadadosSped(spedFile.buffer);
    
    // Extrair flags dos XMLs (se houver)
    let flagsXMLs: any = null;
    if (xmlFiles.length > 0) {
      try {
        flagsXMLs = await spedV2ValidationService.extrairFlagsXMLs(
          xmlFiles.map(f => f.buffer)
        );
        
        // Combinar flags: SPED OU XML (se qualquer um detectar, marcar como true)
        // Conforme Precheck: XML prevalece para "ocorrência operacional"
        metadataSped.opera_st = metadataSped.opera_st || flagsXMLs.opera_st;
        metadataSped.opera_difal = metadataSped.opera_difal || flagsXMLs.opera_difal;
        metadataSped.opera_fcp = metadataSped.opera_fcp || flagsXMLs.opera_fcp;
        metadataSped.opera_interestadual = metadataSped.opera_interestadual || flagsXMLs.opera_interestadual;
        
        // Adicionar fonte das flags
        metadataSped.fonte_flags = {
          st: flagsXMLs.opera_st ? 'XML' : (metadataSped.opera_st ? 'SPED' : null),
          difal: flagsXMLs.opera_difal ? 'XML' : (metadataSped.opera_difal ? 'SPED' : null),
          fcp: flagsXMLs.opera_fcp ? 'XML' : (metadataSped.opera_fcp ? 'SPED' : null),
          interestadual: flagsXMLs.opera_interestadual ? 'XML' : (metadataSped.opera_interestadual ? 'SPED' : null),
        };
        
        // Adicionar estatísticas dos XMLs
        metadataSped.stats_xmls = {
          total_xmls: flagsXMLs.total_xmls,
          xmls_com_st: flagsXMLs.xmls_com_st,
          xmls_com_difal: flagsXMLs.xmls_com_difal,
          xmls_com_fcp: flagsXMLs.xmls_com_fcp,
          xmls_interestaduais: flagsXMLs.xmls_interestaduais,
        };
      } catch (error: any) {
        console.warn('[SpedV2ValidationController] Erro ao extrair flags XML (continuando):', error);
        // Continuar mesmo se falhar (flags XML são opcionais)
      }
    }
    
    // Adicionar fonte dos campos principais (conforme Precheck)
    metadataSped.fonte_campos = {
      razao_social: metadataSped.razao_social ? 'SPED|0000' : null,
      competencia: metadataSped.competencia ? 'SPED|0000' : null,
      segmento: metadataSped.fonte_segmento ? `SPED|${metadataSped.fonte_segmento}` : null,
      regime_tributario: metadataSped.regime_tributario ? 'SPED|0000' : null,
      uf: metadataSped.uf ? 'SPED|0000' : null,
    };

    res.json({
      success: true,
      metadata: metadataSped
    });
  } catch (error: any) {
    console.error('[SpedV2ValidationController] Erro ao extrair metadados:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao extrair metadados'
    });
  }
}






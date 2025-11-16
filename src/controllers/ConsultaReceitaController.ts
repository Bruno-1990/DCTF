/**
 * Controller para consultas simples e em lote na Receita Federal
 */

import { Request, Response } from 'express';
import { ConsultaReceitaService } from '../services/ConsultaReceitaService';
import { consultaProgressService } from '../services/ConsultaProgressService';
import { ApiResponse } from '../types';
import { v4 as uuidv4 } from 'uuid';

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
   * POST /api/receita/consulta-simples
   * Consulta pagamentos de um único CNPJ
   * Requisição simples para usuários comuns
   */
  async consultarSimples(req: Request, res: Response): Promise<void> {
    try {
      console.log('[ConsultaReceitaController] Iniciando consulta simples...');
      const { cnpj, dataInicial, dataFinal } = req.body;

      console.log('[ConsultaReceitaController] Parâmetros recebidos:', {
        cnpj: cnpj ? `${cnpj.substring(0, 5)}***` : 'não fornecido',
        dataInicial,
        dataFinal,
      });

      if (!cnpj) {
        const response: ApiResponse = {
          success: false,
          error: 'CNPJ é obrigatório',
          details: 'O campo CNPJ não foi fornecido na requisição',
        };
        res.status(400).json(response);
        return;
      }

      if (!dataInicial || !dataFinal) {
        const response: ApiResponse = {
          success: false,
          error: 'Data inicial e data final são obrigatórias',
          details: `Data inicial: ${dataInicial || 'não fornecida'}, Data final: ${dataFinal || 'não fornecida'}`,
        };
        res.status(400).json(response);
        return;
      }

      console.log('[ConsultaReceitaController] Chamando serviço de consulta...');
      const resultado = await this.consultaService.consultarSimples(
        cnpj,
        dataInicial,
        dataFinal
      );

      console.log('[ConsultaReceitaController] Consulta concluída com sucesso:', {
        totalEncontrados: resultado.totalEncontrados,
        totalSalvos: resultado.totalSalvos,
        totalAtualizados: resultado.totalAtualizados,
      });

      const response: ApiResponse = {
        success: true,
        data: resultado,
        message: resultado.mensagem,
      };

      res.json(response);
    } catch (error) {
      console.error('[ConsultaReceitaController] Erro na consulta simples:', error);
      
      // Extrair informações detalhadas do erro
      let errorMessage = 'Erro desconhecido';
      let errorDetails: string | undefined;
      let errorStack: string | undefined;

      if (error instanceof Error) {
        errorMessage = error.message;
        errorDetails = error.stack;
        
        // Em desenvolvimento, incluir stack trace
        if (process.env['NODE_ENV'] === 'development') {
          errorStack = error.stack;
        }

        // Se o erro contém informações adicionais (axios errors)
        if ('response' in error && (error as any).response) {
          const axiosError = error as any;
          errorDetails = `Status HTTP: ${axiosError.response?.status}\n` +
            `Mensagem: ${axiosError.response?.data?.message || axiosError.message}\n` +
            `Dados: ${JSON.stringify(axiosError.response?.data, null, 2)}`;
          
          if (axiosError.response?.status === 401) {
            errorMessage = 'Erro de autenticação: Token inválido ou expirado. Verifique a configuração da API da Receita Federal.';
          } else if (axiosError.response?.status === 403) {
            errorMessage = 'Erro de autorização: Acesso negado à API da Receita Federal.';
          } else if (axiosError.response?.status >= 500) {
            errorMessage = `Erro no servidor da Receita Federal: ${axiosError.response?.status} - ${axiosError.response?.statusText}`;
          }
        }
      }

      const response: ApiResponse = {
        success: false,
        error: errorMessage,
        details: errorDetails,
        ...(errorStack && process.env['NODE_ENV'] === 'development' && { stack: errorStack }),
      };

      res.status(500).json(response);
    }
  }

  /**
   * POST /api/receita/consulta-lote
   * Consulta pagamentos de todos os CNPJs cadastrados
   * Requisição para painel administrativo (deve ter autenticação)
   * Retorna imediatamente um ID de progresso e processa de forma assíncrona
   */
  async consultarLote(req: Request, res: Response): Promise<void> {
    try {
      const { dataInicial, dataFinal, limiteCNPJs, apenasFaltantes, waitMs } = req.body;

      if (!dataInicial || !dataFinal) {
        const response: ApiResponse = {
          success: false,
          error: 'Data inicial e data final são obrigatórias',
        };
        res.status(400).json(response);
        return;
      }

      // Gerar ID de progresso
      const progressId = uuidv4();

      // Limitar por padrão para evitar sobrecarga
      const limite = limiteCNPJs || 50;

      // Criar progresso inicial ANTES de retornar resposta para evitar 404 no polling
      // O total será atualizado quando os CNPJs forem contados
      consultaProgressService.criarProgresso(progressId, 0);

      // Retornar imediatamente com ID de progresso
      const response: ApiResponse = {
        success: true,
        data: { progressId },
        message: apenasFaltantes 
          ? 'Consulta em lote iniciada (apenas CNPJs faltantes). Use o ID de progresso para acompanhar o status.'
          : 'Consulta em lote iniciada. Use o ID de progresso para acompanhar o status.',
      };

      res.json(response);

      // Processar de forma assíncrona (não bloquear a resposta)
      this.consultaService.consultarLote(
        dataInicial,
        dataFinal,
        limite,
        progressId,
        apenasFaltantes === true, // Converter para boolean explícito
        typeof waitMs === 'number' ? waitMs : undefined
      ).catch((error) => {
        console.error('[ConsultaReceitaController] Erro na consulta em lote assíncrona:', error);
        consultaProgressService.atualizarProgresso(progressId, {
          status: 'erro',
          erro: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      });
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };

      res.status(500).json(response);
    }
  }

  /**
   * GET /api/receita/consulta-lote/:progressId
   * Verifica o progresso de uma consulta em lote
   */
  async verificarProgresso(req: Request, res: Response): Promise<void> {
    try {
      const { progressId } = req.params;

      if (!progressId) {
        const response: ApiResponse = {
          success: false,
          error: 'ID de progresso é obrigatório',
        };
        res.status(400).json(response);
        return;
      }

      // Desabilitar cache para este endpoint de polling
      // É crítico que cada requisição retorne dados atualizados
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });

      const progresso = consultaProgressService.obterProgresso(progressId);

      if (!progresso) {
        const response: ApiResponse = {
          success: false,
          error: 'Progresso não encontrado. O ID pode ser inválido ou a consulta foi limpa da memória.',
        };
        res.status(404).json(response);
        return;
      }

      // Calcular porcentagem
      const porcentagem = progresso.totalCNPJs > 0
        ? Math.round((progresso.processados / progresso.totalCNPJs) * 100)
        : 0;

      const response: ApiResponse = {
        success: true,
        data: {
          ...progresso,
          porcentagem,
          // Garantir que os campos novos sempre existam no payload
          currentTotalItens: progresso.currentTotalItens || 0,
          currentProcessados: progresso.currentProcessados || 0,
        },
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
   * POST /api/receita/consulta-lote/:progressId/cancelar
   * Cancela uma consulta em lote em andamento
   */
  async cancelarConsulta(req: Request, res: Response): Promise<void> {
    try {
      const { progressId } = req.params;

      if (!progressId) {
        const response: ApiResponse = {
          success: false,
          error: 'ID de progresso é obrigatório',
        };
        res.status(400).json(response);
        return;
      }

      const cancelado = consultaProgressService.cancelar(progressId);

      if (!cancelado) {
        const response: ApiResponse = {
          success: false,
          error: 'Não foi possível cancelar a consulta. Ela pode não estar em andamento ou não existir.',
        };
        res.status(400).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        message: 'Consulta cancelada com sucesso.',
        data: { progressId },
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


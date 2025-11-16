/**
 * Serviço para consultas simples e em lote na Receita Federal
 * Diferente do SincronizacaoReceitaService, este foca apenas em consultar e salvar
 * sem relacionar com DCTFs
 */

import { ReceitaFederalService, ReceitaPagamentoItem } from './ReceitaFederalService';
import { ReceitaPagamentoModel, ReceitaErroConsultaModel } from '../models/ReceitaPagamento';
import { consultaProgressService } from './ConsultaProgressService';
import axios from 'axios';

export interface ConsultaSimplesResult {
  totalConsultados: number;
  totalEncontrados: number;
  totalSalvos: number;
  totalAtualizados: number;
  totalErros: number;
  mensagem: string;
}

export interface ConsultaLoteResult {
  totalCNPJs: number;
  totalConsultados: number;
  totalEncontrados: number;
  totalSalvos: number;
  totalAtualizados: number;
  totalErros: number;
  mensagem?: string;
  detalhes: Array<{
    cnpj: string;
    status: 'sucesso' | 'erro';
    encontrados?: number;
    salvos?: number;
    atualizados?: number;
    erro?: string;
  }>;
}

export class ConsultaReceitaService {
  private receitaService: ReceitaFederalService;
  private receitaPagamentoModel: ReceitaPagamentoModel;
  private erroConsultaModel: ReceitaErroConsultaModel;

  constructor() {
    this.receitaService = new ReceitaFederalService();
    this.receitaPagamentoModel = new ReceitaPagamentoModel();
    this.erroConsultaModel = new ReceitaErroConsultaModel();
  }

  /**
   * Valida o token de acesso com a API da Receita (e opcionalmente a procuração para um CNPJ)
   * - Se cnpj for informado, apenas tenta obter um token e executar uma chamada leve de validação.
   * - Caso contrário, apenas valida a obtenção do token.
   */
  async validarAcesso(cnpj?: string): Promise<{ ok: boolean; mensagem: string }> {
    try {
      // Garante que o token está válido
      await this.receitaService.obterToken(true);
      if (!cnpj) {
        return { ok: true, mensagem: 'Token válido' };
      }
      // Opcional: validar autorização (procuração) com uma chamada leve
      // Aproveitamos o próprio endpoint de pagamentos com janela de 1 dia para verificar permissão,
      // mas sem efetuar gravações.
      try {
        const hoje = new Date();
        const ontem = new Date(hoje.getTime() - 24 * 60 * 60 * 1000);
        const dataFinal = hoje.toISOString().split('T')[0];
        const dataInicial = ontem.toISOString().split('T')[0];
        await this.receitaService.consultarPagamentos(cnpj, dataInicial, dataFinal);
        return { ok: true, mensagem: 'Token válido e acesso autorizado para o CNPJ informado.' };
      } catch (e: any) {
        // Se for 401 → token inválido/expirado
        if (e?.response?.status === 401) {
          return { ok: false, mensagem: 'Token inválido ou expirado. Verifique as credenciais da API da Receita.' };
        }
        // Se for 403 → sem permissão/procuração para o CNPJ
        if (e?.response?.status === 403) {
          return { ok: false, mensagem: e?.response?.data?.mensagens?.[0]?.texto || 'Acesso negado pela API da Receita (sem autorização/procuração para o CNPJ informado).' };
        }
        // Outros erros da API
        return { ok: false, mensagem: e?.message || 'Falha ao validar acesso na API da Receita.' };
      }
    } catch (err: any) {
      return { ok: false, mensagem: err?.message || 'Falha ao obter token de acesso da Receita.' };
    }
  }

  /**
   * Classifica o tipo de erro baseado na mensagem e código HTTP
   */
  private classificarTipoErro(error: any): 'erro_api' | 'erro_autenticacao' | 'erro_rate_limit' | 'erro_validacao' | 'erro_banco_dados' | 'erro_rede' | 'erro_desconhecido' {
    // Erro de autenticação
    if (error.statusCode === 401 || error.statusCode === 403) {
      return 'erro_autenticacao';
    }
    
    // Erro de rate limiting
    if (error.statusCode === 429) {
      return 'erro_rate_limit';
    }
    
    // Erro de validação (CNPJ inválido, etc)
    if (error.statusCode === 400 || (error.message && /inválido|invalid|validação|validation/i.test(error.message))) {
      return 'erro_validacao';
    }
    
    // Erro de rede/timeout
    if (axios.isAxiosError(error) && (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND')) {
      return 'erro_rede';
    }
    
    // Erro de banco de dados
    if (error.message && /database|banco|supabase|sql/i.test(error.message)) {
      return 'erro_banco_dados';
    }
    
    // Erro de API (5xx)
    if (error.statusCode >= 500) {
      return 'erro_api';
    }
    
    // Erro de API (4xx, exceto os já tratados)
    if (error.statusCode >= 400 && error.statusCode < 500) {
      return 'erro_api';
    }
    
    // Erro desconhecido
    return 'erro_desconhecido';
  }

  /**
   * Extrai detalhes do erro para armazenamento
   */
  private extrairDetalhesErro(error: any): Record<string, any> {
    const detalhes: Record<string, any> = {};
    
    if (error instanceof Error) {
      detalhes.message = error.message;
      detalhes.name = error.name;
      detalhes.stack = error.stack;
    }
    
    if (error.statusCode) {
      detalhes.statusCode = error.statusCode;
    }
    
    if (error.responseData) {
      detalhes.responseData = error.responseData;
    }
    
    if (error.apiMessage) {
      detalhes.apiMessage = error.apiMessage;
    }
    
    if (axios.isAxiosError(error)) {
      detalhes.axiosError = {
        code: error.code,
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
        } : null,
      };
    }
    
    return detalhes;
  }

  /**
   * Configura autenticação com a Receita Federal
   * Nota: O token é obtido automaticamente no ReceitaFederalService
   */
  configurarAutenticacao(token: string): void {
    // Token é obtido automaticamente via obterToken() no ReceitaFederalService
    // Este método existe apenas para compatibilidade futura
  }

  /**
   * Consulta simples: Consulta pagamentos de um único CNPJ
   * Verifica no banco se existe e atualiza/cria
   */
  async consultarSimples(
    cnpj: string,
    dataInicial: string,
    dataFinal: string
  ): Promise<ConsultaSimplesResult> {
    const result: ConsultaSimplesResult = {
      totalConsultados: 0,
      totalEncontrados: 0,
      totalSalvos: 0,
      totalAtualizados: 0,
      totalErros: 0,
      mensagem: '',
    };

    // Declarar cnpjLimpo fora do try para usar no catch
    const cnpjLimpo = cnpj.replace(/\D/g, '');

    try {
      if (cnpjLimpo.length !== 14) {
        throw new Error('CNPJ inválido. Deve conter 14 dígitos.');
      }

      // 1. Consultar na Receita Federal
      const pagamentosReceita = await this.receitaService.consultarPagamentos(
        cnpjLimpo,
        dataInicial,
        dataFinal
      );

      result.totalConsultados = 1; // Um CNPJ consultado
      result.totalEncontrados = pagamentosReceita.length;

      if (pagamentosReceita.length === 0) {
        result.mensagem = 'Nenhum pagamento encontrado na Receita Federal para os filtros informados.';
        return result;
      }

      // 2. Mapear e fazer upsert de cada pagamento
      const pagamentosParaSalvar = pagamentosReceita.map(item =>
        this.mapearReceitaItemParaTabela(item, cnpjLimpo, dataInicial, dataFinal)
      );

      // Log do primeiro pagamento mapeado para debug de valores
      if (pagamentosParaSalvar.length > 0) {
        console.log(`[ConsultaReceita] Primeiro pagamento mapeado:`, {
          numero_documento: pagamentosParaSalvar[0].numero_documento,
          valor_documento: pagamentosParaSalvar[0].valor_documento,
          valor_saldo_documento: pagamentosParaSalvar[0].valor_saldo_documento,
          valor_principal: pagamentosParaSalvar[0].valor_principal,
          valor_saldo_principal: pagamentosParaSalvar[0].valor_saldo_principal,
        });
      }

      // 3. Fazer upsert em lote
      const upsertResult = await this.receitaPagamentoModel.upsertPagamentosEmLote(pagamentosParaSalvar);

      result.totalSalvos = upsertResult.criados;
      result.totalAtualizados = upsertResult.atualizados;
      result.totalErros = upsertResult.erros;

      result.mensagem = `Consulta realizada: ${result.totalEncontrados} pagamento(s) encontrado(s) na Receita Federal. ${result.totalSalvos} salvo(s) e ${result.totalAtualizados} atualizado(s).`;

      return result;
    } catch (error) {
      result.totalErros++;
      
      console.error('[ConsultaReceita] Erro na consulta simples:', error);
      
      let errorMessage = 'Erro desconhecido';
      let errorDetails: string | undefined;

      if (error instanceof Error) {
        errorMessage = error.message;
        
        // Extrair informações adicionais se disponíveis
        if ('statusCode' in error) {
          errorDetails = `Status HTTP: ${(error as any).statusCode}`;
        }
        // Se houver payload de resposta (axios), extrair mensagem amigável
        if ('responseData' in error) {
          const responseData = (error as any).responseData;
          const mensagemApi = responseData?.mensagens?.[0]?.texto || responseData?.message;
          if (mensagemApi) {
            errorDetails = `${errorDetails ? errorDetails + '\n' : ''}${mensagemApi}`;
          }
        }
      }

      const tipoErro = this.classificarTipoErro(error);
      const detalhesErro = this.extrairDetalhesErro(error);
      
      // Registrar erro na tabela de logs (sem sincronização pois é consulta simples)
      try {
        await this.erroConsultaModel.registrarErro({
          sincronizacao_id: null,
          cnpj_contribuinte: cnpjLimpo,
          periodo_inicial: dataInicial ? new Date(dataInicial) : null,
          periodo_final: dataFinal ? new Date(dataFinal) : null,
          tipo_consulta: 'consulta_simples',
          tipo_erro: tipoErro,
          mensagem_erro: errorMessage,
          detalhes_erro: detalhesErro,
          codigo_http: (error as any).statusCode || null,
          status_http: (error as any).statusText || null,
          dados_requisicao: {
            cnpj: cnpjLimpo,
            periodoInicial: dataInicial,
            periodoFinal: dataFinal,
          },
        });
      } catch (logError) {
        console.error('[ConsultaReceita] Erro ao registrar log de erro:', logError);
        // Não falhar o processamento se o log falhar
      }

      result.mensagem = `Erro na consulta: ${errorMessage}${errorDetails ? `\n${errorDetails}` : ''}`;
      
      // Propagar erro com contexto adicional
      const fullError = new Error(result.mensagem);
      if (error instanceof Error && error.stack) {
        (fullError as any).originalError = error;
        (fullError as any).stack = error.stack;
      }
      throw fullError;
    }
  }

  /**
   * Consulta em lote: Itera sobre todos os CNPJs da tabela clientes
   * Faz requisição para cada CNPJ e salva/atualiza no banco
   * @param progressId ID do progresso para acompanhamento (opcional)
   * @param apenasFaltantes Se true, busca apenas CNPJs que não têm registros de pagamento no período
   */
  async consultarLote(
    dataInicial: string,
    dataFinal: string,
    limiteCNPJs?: number,
    progressId?: string,
    apenasFaltantes: boolean = false,
    waitMs?: number
  ): Promise<ConsultaLoteResult> {
    const result: ConsultaLoteResult = {
      totalCNPJs: 0,
      totalConsultados: 0,
      totalEncontrados: 0,
      totalSalvos: 0,
      totalAtualizados: 0,
      totalErros: 0,
      detalhes: [],
    };

    // Declarar sincronizacaoId fora do try para usar no catch externo
    let sincronizacaoId: string | undefined;

    try {
      let cnpjsUnicos: string[] = [];

      if (apenasFaltantes) {
        // Buscar apenas CNPJs que não têm registros de pagamento no período
        console.log('[ConsultaReceita] Buscando apenas CNPJs faltantes...');
        cnpjsUnicos = await this.receitaPagamentoModel.buscarCNPJsFaltantes(
          dataInicial,
          dataFinal,
          limiteCNPJs
        );

        if (cnpjsUnicos.length === 0) {
          result.mensagem = 'Todos os CNPJs já possuem registros de pagamento no período especificado.';
          return result;
        }

        result.totalCNPJs = cnpjsUnicos.length;
        console.log(`[ConsultaReceita] Encontrados ${cnpjsUnicos.length} CNPJs faltantes para consultar.`);
        
        // Atualizar total no progresso se existir
        if (progressId) {
          consultaProgressService.atualizarProgresso(progressId, {
            totalCNPJs: result.totalCNPJs,
          });
        }
      } else {
        // Buscar todos os CNPJs da tabela clientes (comportamento original)
        if (!process.env['SUPABASE_URL']) {
          throw new Error('Supabase não configurado');
        }

        // Acessar supabase através de cast temporário (propriedade protected)
        const { supabase: supabaseClient } = this.receitaPagamentoModel as any;
        console.log('[ConsultaReceita] Modo TODOS os CNPJs. Parâmetros:', {
          dataInicial,
          dataFinal,
          limiteCNPJs: limiteCNPJs ?? 'não informado',
        });
        let query = supabaseClient
          .from('clientes')
          .select('cnpj_limpo')
          .not('cnpj_limpo', 'is', null);

        if (limiteCNPJs) {
          query = query.limit(limiteCNPJs);
        }

        const { data: clientes, error: errorClientes } = await query;

        if (errorClientes) {
          throw new Error(`Erro ao buscar clientes: ${errorClientes.message}`);
        }

        if (!clientes || clientes.length === 0) {
          result.mensagem = 'Nenhum cliente encontrado no banco de dados.';
          return result;
        }

        // Log de diagnóstico: quantidade e amostra de CNPJs retornados
        try {
          const sample = (clientes as any[]).slice(0, 10).map((c) => c.cnpj_limpo);
          console.log('[ConsultaReceita] Clientes retornados da tabela "clientes":', {
            quantidade: clientes.length,
            amostraPrimeiros10: sample,
          });
        } catch {}

        result.totalCNPJs = clientes.length;
        cnpjsUnicos = [...new Set(clientes.map((c: any) => c.cnpj_limpo).filter(Boolean))].filter((cnpj): cnpj is string => typeof cnpj === 'string');
        console.log('[ConsultaReceita] CNPJs únicos após normalização:', {
          quantidadeUnicos: cnpjsUnicos.length,
          amostraPrimeiros10: cnpjsUnicos.slice(0, 10),
        });
        
        // Atualizar total no progresso se existir
        if (progressId) {
          consultaProgressService.atualizarProgresso(progressId, {
            totalCNPJs: result.totalCNPJs,
          });
        }
      }

      // Criar registro de sincronização para rastrear erros
      try {
        const { ReceitaSincronizacaoModel } = await import('../models/ReceitaPagamento');
        const sincronizacaoModel = new ReceitaSincronizacaoModel();
        
        const sincronizacao = await sincronizacaoModel.criarSincronizacao({
          cnpj_contribuinte: 'TODOS',
          periodo_inicial: dataInicial ? new Date(`${dataInicial}-01`) : null,
          periodo_final: dataFinal 
            ? new Date(`${dataFinal}-${new Date(parseInt(dataFinal.split('-')[0]), parseInt(dataFinal.split('-')[1]), 0).getDate()}`)
            : null,
          tipo_sincronizacao: 'todos',
          total_consultados: 0,
          total_encontrados: 0,
          total_atualizados: 0,
          total_erros: 0,
          status: 'em_andamento',
          executado_por: 'consulta-receita-lote',
        });
        sincronizacaoId = sincronizacao.id;
      } catch (syncError) {
        console.warn('[ConsultaReceita] Erro ao criar registro de sincronização:', syncError);
        // Continuar mesmo se não conseguir criar sincronização
      }

      const tempoInicio = Date.now();

      // Progresso já foi criado no controller, apenas atualizar o total quando souber
      // (o progresso foi criado com totalCNPJs = 0 para evitar 404 no polling inicial)
      // Se não houver CNPJs a processar, concluir imediatamente para a UI mostrar o estado
      if (progressId && result.totalCNPJs === 0) {
        consultaProgressService.atualizarProgresso(progressId, {
          status: 'concluida',
          resultado: {
            mensagem: 'Nenhum CNPJ a processar neste período (modo Apenas Faltantes).',
            totalCNPJs: 0,
            totalEncontrados: 0,
            totalSalvos: 0,
            totalAtualizados: 0,
          },
        });
      }

      // 2. Para cada CNPJ, fazer consulta na Receita
      for (let i = 0; i < cnpjsUnicos.length; i++) {
        const cnpj = cnpjsUnicos[i];
        console.log(`[ConsultaReceita] Início da iteração ${i + 1}/${cnpjsUnicos.length} - CNPJ: ${cnpj}`);
        
        // Verificar se foi cancelado
        if (progressId) {
          const progresso = consultaProgressService.obterProgresso(progressId);
          if (progresso && progresso.status === 'cancelada') {
            result.mensagem = 'Consulta cancelada pelo usuário.';
            if (progressId) {
              consultaProgressService.atualizarProgresso(progressId, {
                status: 'cancelada',
                resultado: result,
              });
            }
            console.log('[ConsultaReceita] Execução cancelada pelo usuário');
            return result;
          }
        }

        if (!cnpj || typeof cnpj !== 'string') continue;

        // Atualizar progresso
        if (progressId) {
          consultaProgressService.atualizarProgresso(progressId, {
            processados: i,
            cnpjAtual: cnpj,
          });
        }

        try {
          // Consultar na Receita Federal
          const pagamentosReceita = await this.receitaService.consultarPagamentos(
            cnpj,
            dataInicial,
            dataFinal
          );

          result.totalConsultados++;
          result.totalEncontrados += pagamentosReceita.length;

          // Atualizar contadores em tempo real (encontrados/pulados)
          if (progressId) {
            const progresso = consultaProgressService.obterProgresso(progressId);
            const encontrados = (progresso?.encontrados || 0) + pagamentosReceita.length;
            const pulados = (progresso?.pulados || 0) + (pagamentosReceita.length === 0 ? 1 : 0);
            consultaProgressService.atualizarProgresso(progressId, { encontrados, pulados });
          }

          if (pagamentosReceita.length === 0) {
            result.detalhes.push({
              cnpj,
              status: 'sucesso',
              encontrados: 0,
              salvos: 0,
              atualizados: 0,
            });
            continue;
          }

          // Mapear e fazer upsert
          const pagamentosParaSalvar = pagamentosReceita.map(item =>
            this.mapearReceitaItemParaTabela(item, cnpj, dataInicial, dataFinal)
          );

          // Inicializar progresso granular do CNPJ atual
          if (progressId) {
            consultaProgressService.atualizarProgresso(progressId, {
              currentTotalItens: pagamentosParaSalvar.length,
              currentProcessados: 0,
            });
          }

          const upsertResult = await this.receitaPagamentoModel.upsertPagamentosEmLote(
            pagamentosParaSalvar,
            (info) => {
              if (progressId) {
                consultaProgressService.atualizarProgresso(progressId, {
                  currentProcessados: info.index,
                  // Também refletir salvos/atualizados acumulados em tempo real
                  salvos: (consultaProgressService.obterProgresso(progressId!)?.salvos || 0) + 0, // já atualizamos abaixo ao final
                });
              }
            }
          );

          result.totalSalvos += upsertResult.criados;
          result.totalAtualizados += upsertResult.atualizados;
          result.totalErros += upsertResult.erros;

          // Atualizar contadores em tempo real (salvos/atualizados)
          if (progressId) {
            const progresso = consultaProgressService.obterProgresso(progressId);
            const salvos = (progresso?.salvos || 0) + upsertResult.criados;
            const atualizados = (progresso?.atualizados || 0) + upsertResult.atualizados;
            consultaProgressService.atualizarProgresso(progressId, {
              salvos,
              atualizados,
              currentProcessados: pagamentosParaSalvar.length, // finalizado
            });
          }

          result.detalhes.push({
            cnpj,
            status: 'sucesso',
            encontrados: pagamentosReceita.length,
            salvos: upsertResult.criados,
            atualizados: upsertResult.atualizados,
          });

          // Delay configurável entre requisições para evitar rate limiting (waiter)
          const delay = typeof waitMs === 'number' ? Math.max(0, waitMs) : 2000;
          console.log(`[ConsultaReceita] Aguardando ${delay}ms antes da próxima requisição...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } catch (error) {
          result.totalErros++;
          
          const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
          const tipoErro = this.classificarTipoErro(error);
          const detalhesErro = this.extrairDetalhesErro(error);
          console.error(`[ConsultaReceita] Erro ao processar CNPJ ${cnpj}:`, errorMessage);
          
          // Registrar erro na tabela de logs
          try {
            await this.erroConsultaModel.registrarErro({
              sincronizacao_id: sincronizacaoId || null,
              cnpj_contribuinte: cnpj,
              periodo_inicial: dataInicial ? new Date(dataInicial) : null,
              periodo_final: dataFinal ? new Date(dataFinal) : null,
              tipo_consulta: 'consulta_lote',
              tipo_erro: tipoErro,
              mensagem_erro: errorMessage,
              detalhes_erro: detalhesErro,
              codigo_http: (error as any).statusCode || null,
              status_http: (error as any).statusText || null,
              dados_requisicao: {
                cnpj,
                periodoInicial: dataInicial,
                periodoFinal: dataFinal,
              },
            });
          } catch (logError) {
            console.error('[ConsultaReceita] Erro ao registrar log de erro:', logError);
            // Não falhar o processamento se o log falhar
          }
          
          result.detalhes.push({
            cnpj,
            status: 'erro',
            erro: errorMessage,
          });
        }

        // Atualizar progresso após processar cada CNPJ
        if (progressId) {
          consultaProgressService.atualizarProgresso(progressId, {
            processados: i + 1,
          });
        }
        console.log(`[ConsultaReceita] Fim da iteração ${i + 1}/${cnpjsUnicos.length} - processados=${i + 1}`);
      }

      // Finalizar sincronização com resultados
      if (sincronizacaoId) {
        try {
          const { ReceitaSincronizacaoModel } = await import('../models/ReceitaPagamento');
          const sincronizacaoModel = new ReceitaSincronizacaoModel();
          
          await sincronizacaoModel.atualizarStatus(sincronizacaoId, 'concluida', {
            total_consultados: cnpjsUnicos.length,
            total_encontrados: result.totalEncontrados,
            total_atualizados: result.totalAtualizados,
            total_erros: result.totalErros,
            resultado_completo: result.detalhes,
            tempo_execucao_ms: Date.now() - tempoInicio,
            mensagem: `Consulta em lote concluída: ${result.totalErros} erro(s) de ${cnpjsUnicos.length} CNPJ(s)`,
          });
        } catch (syncError) {
          console.warn('[ConsultaReceita] Erro ao atualizar sincronização:', syncError);
        }
      }

      // Marcar como concluída
      if (progressId) {
        consultaProgressService.atualizarProgresso(progressId, {
          status: 'concluida',
          resultado: result,
        });
      }
      console.log('[ConsultaReceita] Consulta em lote concluída.');

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      
      // Finalizar sincronização com erro geral
      if (sincronizacaoId) {
        try {
          const { ReceitaSincronizacaoModel } = await import('../models/ReceitaPagamento');
          const sincronizacaoModel = new ReceitaSincronizacaoModel();
          
          await sincronizacaoModel.atualizarStatus(sincronizacaoId, 'erro', {
            total_consultados: result.totalCNPJs || 0,
            total_encontrados: 0,
            total_atualizados: 0,
            total_erros: result.totalCNPJs || 0,
            erros: [{ mensagem: errorMessage }],
            mensagem: `Erro na consulta em lote: ${errorMessage}`,
          });
        } catch (syncError) {
          console.warn('[ConsultaReceita] Erro ao atualizar sincronização:', syncError);
        }
      }
      
      // Marcar como erro no progresso
      if (progressId) {
        consultaProgressService.atualizarProgresso(progressId, {
          status: 'erro',
          erro: errorMessage,
        });
      }
      
      throw new Error(`Erro na consulta em lote: ${errorMessage}`);
    }
  }

  /**
   * Mapeia item da Receita para formato da tabela receita_pagamentos
   */
  private mapearReceitaItemParaTabela(
    item: ReceitaPagamentoItem,
    cnpj: string,
    periodoInicial?: string,
    periodoFinal?: string
  ) {
    // Garantir que o CNPJ esteja sempre limpo (apenas números) antes de salvar
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      console.warn(`[ConsultaReceita] CNPJ inválido ao mapear item: ${cnpj} -> ${cnpjLimpo}`);
    }
    
    return {
      cnpj_contribuinte: cnpjLimpo, // Salvar sempre limpo
      periodo_consulta_inicial: periodoInicial ? new Date(periodoInicial) : null,
      periodo_consulta_final: periodoFinal ? new Date(periodoFinal) : null,
      data_sincronizacao: new Date(),
      numero_documento: item.numeroDocumento,
      tipo_documento: item.tipoDocumento,
      periodo_apuracao: item.periodoApuracao ? new Date(item.periodoApuracao) : null,
      competencia: item.competencia || (item.periodoApuracao ? item.periodoApuracao.substring(0, 7) : null),
      data_arrecadacao: item.dataArrecadacao ? new Date(item.dataArrecadacao) : null,
      data_vencimento: item.dataVencimento ? new Date(item.dataVencimento) : null,
      codigo_receita_doc: item.codigoReceitaDoc,
      valor_documento: item.valorDocumento,
      valor_saldo_documento: item.valorSaldoDocumento,
      valor_principal: item.valorPrincipal,
      valor_saldo_principal: item.valorSaldoPrincipal,
      sequencial: item.sequencial || null,
      codigo_receita_linha: item.codigoReceitaLinha || null,
      descricao_receita_linha: item.descricaoReceitaLinha || null,
      periodo_apuracao_linha: item.periodoApuracaoLinha ? new Date(item.periodoApuracaoLinha) : null,
      data_vencimento_linha: item.dataVencimentoLinha ? new Date(item.dataVencimentoLinha) : null,
      valor_linha: item.valorLinha || null,
      valor_principal_linha: item.valorPrincipalLinha || null,
      valor_saldo_linha: item.valorSaldoLinha || null,
      dctf_id: null, // Não relaciona com DCTF nesta consulta
      status_processamento: 'novo' as const,
      dados_completos: item, // Salva item completo para referência
      observacoes: null,
      erro_sincronizacao: null,
    };
  }
}


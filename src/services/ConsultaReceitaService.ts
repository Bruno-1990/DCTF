/**
 * Serviço para consultas simples e em lote na Receita Federal
 * Diferente do SincronizacaoReceitaService, este foca apenas em consultar e salvar
 * sem relacionar com DCTFs
 */

import { ReceitaFederalService, ReceitaPagamentoItem } from './ReceitaFederalService';
import { ReceitaPagamentoModel } from '../models/ReceitaPagamento';
import { consultaProgressService } from './ConsultaProgressService';

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

  constructor() {
    this.receitaService = new ReceitaFederalService();
    this.receitaPagamentoModel = new ReceitaPagamentoModel();
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

    try {
      const cnpjLimpo = cnpj.replace(/\D/g, '');

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
        if ('responseData' in error) {
          const responseData = (error as any).responseData;
          if (responseData) {
            errorDetails = `${errorDetails ? errorDetails + '\n' : ''}Dados da resposta: ${JSON.stringify(responseData, null, 2)}`;
          }
        }
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
   */
  async consultarLote(
    dataInicial: string,
    dataFinal: string,
    limiteCNPJs?: number,
    progressId?: string
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

    try {
      // 1. Buscar todos os CNPJs da tabela clientes
      if (!process.env['SUPABASE_URL']) {
        throw new Error('Supabase não configurado');
      }

      // Acessar supabase através de cast temporário (propriedade protected)
      const { supabase: supabaseClient } = this.receitaPagamentoModel as any;
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

      result.totalCNPJs = clientes.length;
      const cnpjsUnicos = [...new Set(clientes.map((c: any) => c.cnpj_limpo).filter(Boolean))];

      // Inicializar progresso se ID fornecido
      if (progressId) {
        consultaProgressService.criarProgresso(progressId, result.totalCNPJs);
      }

      // 2. Para cada CNPJ, fazer consulta na Receita
      for (let i = 0; i < cnpjsUnicos.length; i++) {
        const cnpj = cnpjsUnicos[i];
        
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

          const upsertResult = await this.receitaPagamentoModel.upsertPagamentosEmLote(pagamentosParaSalvar);

          result.totalSalvos += upsertResult.criados;
          result.totalAtualizados += upsertResult.atualizados;
          result.totalErros += upsertResult.erros;

          result.detalhes.push({
            cnpj,
            status: 'sucesso',
            encontrados: pagamentosReceita.length,
            salvos: upsertResult.criados,
            atualizados: upsertResult.atualizados,
          });

          // Delay de 3 segundos entre requisições para evitar rate limiting
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
          result.totalErros++;
          result.detalhes.push({
            cnpj,
            status: 'erro',
            erro: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }

        // Atualizar progresso após processar cada CNPJ
        if (progressId) {
          consultaProgressService.atualizarProgresso(progressId, {
            processados: i + 1,
          });
        }
      }

      // Marcar como concluída
      if (progressId) {
        consultaProgressService.atualizarProgresso(progressId, {
          status: 'concluida',
          resultado: result,
        });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      
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
    return {
      cnpj_contribuinte: cnpj,
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


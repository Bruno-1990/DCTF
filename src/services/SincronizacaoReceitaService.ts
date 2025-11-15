/**
 * Serviço para sincronizar dados de pagamento da Receita Federal com nosso sistema
 */

import { ReceitaFederalService, ReceitaPagamentoItem } from './ReceitaFederalService';
import { PagamentoService, UpdatePagamentoRequest } from './PagamentoService';
import { ReceitaPagamentoModel, ReceitaSincronizacaoModel } from '../models/ReceitaPagamento';
import { DCTF } from '../types';

export interface SincronizacaoResult {
  totalConsultados: number;
  totalEncontrados: number;
  totalAtualizados: number;
  totalErros: number;
  sincronizacaoId?: string; // ID do registro de sincronização criado
  detalhes: Array<{
    dctfId: string;
    cnpj: string;
    periodo: string;
    status: 'atualizado' | 'nao_encontrado' | 'erro';
    mensagem?: string;
    dadosReceita?: ReceitaPagamentoItem;
    receitaPagamentoId?: string; // ID do pagamento salvo na tabela
  }>;
}

export class SincronizacaoReceitaService {
  private receitaService: ReceitaFederalService;
  private pagamentoService: PagamentoService;
  private receitaPagamentoModel: ReceitaPagamentoModel;
  private receitaSincronizacaoModel: ReceitaSincronizacaoModel;

  constructor() {
    this.receitaService = new ReceitaFederalService();
    this.pagamentoService = new PagamentoService();
    this.receitaPagamentoModel = new ReceitaPagamentoModel();
    this.receitaSincronizacaoModel = new ReceitaSincronizacaoModel();
  }

  /**
   * Configura autenticação com a Receita Federal
   */
  configurarAutenticacao(token: string): void {
    this.receitaService.setAccessToken(token);
  }

  /**
   * Sincroniza pagamentos de um cliente específico
   */
  async sincronizarCliente(
    cnpj: string,
    periodoInicial?: string,
    periodoFinal?: string
  ): Promise<SincronizacaoResult> {
    const tempoInicio = Date.now();
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    let sincronizacaoId: string | undefined;

    const result: SincronizacaoResult = {
      totalConsultados: 0,
      totalEncontrados: 0,
      totalAtualizados: 0,
      totalErros: 0,
      detalhes: [],
    };

    try {
      // 0. Criar registro de sincronização
      const sincronizacaoRecord = await this.receitaSincronizacaoModel.criarSincronizacao({
        cnpj_contribuinte: cnpjLimpo,
        periodo_inicial: periodoInicial ? new Date(`${periodoInicial}-01`) : null,
        periodo_final: periodoFinal 
          ? new Date(`${periodoFinal}-${new Date(parseInt(periodoFinal.split('-')[0]), parseInt(periodoFinal.split('-')[1]), 0).getDate()}`)
          : null,
        tipo_sincronizacao: 'cliente',
        total_consultados: 0,
        total_encontrados: 0,
        total_atualizados: 0,
        total_erros: 0,
        status: 'em_andamento',
        executado_por: 'sistema-sincronizacao-receita',
      });
      sincronizacaoId = sincronizacaoRecord.id;
      result.sincronizacaoId = sincronizacaoId;

      // 1. Buscar débitos pendentes deste cliente no nosso sistema
      const debitosPendentes = await this.pagamentoService.buscarDebitos({
        cnpj,
        apenasPendentes: true,
      });

      result.totalConsultados = debitosPendentes.length;

      if (debitosPendentes.length === 0) {
        // Atualizar sincronização como concluída
        await this.receitaSincronizacaoModel.atualizarStatus(sincronizacaoId, 'concluida', {
          total_consultados: 0,
          mensagem: 'Nenhum débito pendente encontrado',
          tempo_execucao_ms: Date.now() - tempoInicio,
        });
        return result;
      }

      // 2. Consultar pagamentos na Receita Federal
      const dataInicial = periodoInicial ? `${periodoInicial}-01` : undefined;
      const dataFinal = periodoFinal 
        ? `${periodoFinal}-${new Date(parseInt(periodoFinal.split('-')[0]), parseInt(periodoFinal.split('-')[1]), 0).getDate()}`
        : undefined;

      const pagamentosReceita = await this.receitaService.consultarPagamentos(
        cnpj,
        dataInicial,
        dataFinal
      );

      // 3. Salvar todos os pagamentos retornados na tabela receita_pagamentos (com upsert)
      if (pagamentosReceita.length > 0) {
        try {
          const pagamentosParaSalvar = pagamentosReceita.map(item => 
            this.mapearReceitaItemParaTabela(item, cnpjLimpo, dataInicial, dataFinal)
          );
          
          // Usar upsert para verificar se existe e atualizar/criar
          await this.receitaPagamentoModel.upsertPagamentosEmLote(pagamentosParaSalvar);
        } catch (error) {
          console.error('Erro ao salvar pagamentos na tabela:', error);
          // Continuar mesmo se houver erro ao salvar, não bloquear a sincronização
        }
      }

      // 4. Para cada débito pendente, tentar encontrar pagamento correspondente
      for (const debito of debitosPendentes) {
        try {
          // Procurar pagamento correspondente na Receita
          const pagamentoEncontrado = this.encontrarPagamentoCorrespondente(
            debito,
            pagamentosReceita
          );

          if (!pagamentoEncontrado) {
            result.detalhes.push({
              dctfId: debito.id,
              cnpj,
              periodo: debito.periodo || '',
              status: 'nao_encontrado',
              mensagem: 'Nenhum pagamento correspondente encontrado na Receita',
            });
            continue;
          }

          result.totalEncontrados++;

          // 5. Buscar o pagamento salvo na tabela para vincular com DCTF
          const pagamentoSalvo = await this.receitaPagamentoModel.buscarPorNumeroDocumento(
            pagamentoEncontrado.numeroDocumento
          );

          // 6. Mapear dados da Receita para nosso formato
          const dadosPagamento = this.receitaService.mapearParaSistemaPagamento(
            pagamentoEncontrado
          );

          // 7. Atualizar status de pagamento na DCTF
          const updateData: UpdatePagamentoRequest = {
            statusPagamento: dadosPagamento.statusPagamento,
            dataPagamento: dadosPagamento.dataPagamento,
            comprovantePagamento: dadosPagamento.comprovantePagamento,
            observacoesPagamento: dadosPagamento.observacoesPagamento,
            usuarioQueAtualizou: 'sistema-sincronizacao-receita',
          };

          await this.pagamentoService.atualizarPagamento(debito.id, updateData);

          // 8. Vincular pagamento com DCTF na tabela receita_pagamentos
          if (pagamentoSalvo) {
            await this.receitaPagamentoModel.vincularDCTF(pagamentoSalvo.id, debito.id);
          }

          result.totalAtualizados++;
          result.detalhes.push({
            dctfId: debito.id,
            cnpj,
            periodo: debito.periodo || '',
            status: 'atualizado',
            mensagem: `Status atualizado para: ${dadosPagamento.statusPagamento}`,
            dadosReceita: pagamentoEncontrado,
            receitaPagamentoId: pagamentoSalvo?.id,
          });
        } catch (error) {
          result.totalErros++;
          result.detalhes.push({
            dctfId: debito.id,
            cnpj,
            periodo: debito.periodo || '',
            status: 'erro',
            mensagem: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      }

      // 9. Atualizar registro de sincronização com resultados
      await this.receitaSincronizacaoModel.atualizarStatus(sincronizacaoId, 'concluida', {
        total_consultados: result.totalConsultados,
        total_encontrados: result.totalEncontrados,
        total_atualizados: result.totalAtualizados,
        total_erros: result.totalErros,
        resultado_completo: result,
        tempo_execucao_ms: Date.now() - tempoInicio,
        mensagem: `Sincronização concluída: ${result.totalAtualizados} atualizado(s) de ${result.totalConsultados} consultado(s)`,
      });

      return result;
    } catch (error) {
      // Atualizar sincronização como erro
      if (sincronizacaoId) {
        await this.receitaSincronizacaoModel.atualizarStatus(sincronizacaoId, 'erro', {
          total_consultados: result.totalConsultados,
          total_encontrados: result.totalEncontrados,
          total_atualizados: result.totalAtualizados,
          total_erros: result.totalErros,
          erros: [{ mensagem: error instanceof Error ? error.message : 'Erro desconhecido' }],
          tempo_execucao_ms: Date.now() - tempoInicio,
          mensagem: `Erro na sincronização: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        });
      }

      throw new Error(
        `Erro na sincronização: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
      );
    }
  }

  /**
   * Sincroniza pagamentos de todos os clientes com débitos pendentes
   */
  async sincronizarTodos(
    periodoInicial?: string,
    periodoFinal?: string,
    limiteClientes?: number
  ): Promise<SincronizacaoResult> {
    const tempoInicio = Date.now();
    let sincronizacaoId: string | undefined;

    const result: SincronizacaoResult = {
      totalConsultados: 0,
      totalEncontrados: 0,
      totalAtualizados: 0,
      totalErros: 0,
      detalhes: [],
    };

    try {
      // 0. Criar registro de sincronização
      const sincronizacaoRecord = await this.receitaSincronizacaoModel.criarSincronizacao({
        cnpj_contribuinte: null,
        periodo_inicial: periodoInicial ? new Date(`${periodoInicial}-01`) : null,
        periodo_final: periodoFinal 
          ? new Date(`${periodoFinal}-${new Date(parseInt(periodoFinal.split('-')[0]), parseInt(periodoFinal.split('-')[1]), 0).getDate()}`)
          : null,
        tipo_sincronizacao: 'todos',
        total_consultados: 0,
        total_encontrados: 0,
        total_atualizados: 0,
        total_erros: 0,
        status: 'em_andamento',
        executado_por: 'sistema-sincronizacao-receita',
      });
      sincronizacaoId = sincronizacaoRecord.id;
      result.sincronizacaoId = sincronizacaoId;

      // 1. Buscar todos os débitos pendentes
      const debitosPendentes = await this.pagamentoService.buscarDebitos({
        apenasPendentes: true,
      });

      // 2. Agrupar por CNPJ
      const debitosPorCNPJ = new Map<string, DCTF[]>();
      
      for (const debito of debitosPendentes) {
        if (!debito.numeroIdentificacao) continue;
        
        const cnpj = debito.numeroIdentificacao.replace(/\D/g, '');
        if (!debitosPorCNPJ.has(cnpj)) {
          debitosPorCNPJ.set(cnpj, []);
        }
        debitosPorCNPJ.get(cnpj)!.push(debito);
      }

      // 3. Sincronizar cada CNPJ
      const cnpjs = Array.from(debitosPorCNPJ.keys());
      const cnpjsParaProcessar = limiteClientes 
        ? cnpjs.slice(0, limiteClientes) 
        : cnpjs;

      for (const cnpj of cnpjsParaProcessar) {
        try {
          const resultadoCliente = await this.sincronizarCliente(
            cnpj,
            periodoInicial,
            periodoFinal
          );

          // Consolidar resultados
          result.totalConsultados += resultadoCliente.totalConsultados;
          result.totalEncontrados += resultadoCliente.totalEncontrados;
          result.totalAtualizados += resultadoCliente.totalAtualizados;
          result.totalErros += resultadoCliente.totalErros;
          result.detalhes.push(...resultadoCliente.detalhes);

          // Delay de 3 segundos entre requisições para evitar rate limiting
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
          result.totalErros++;
          result.detalhes.push({
            dctfId: '',
            cnpj,
            periodo: '',
            status: 'erro',
            mensagem: `Erro ao sincronizar cliente: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
          });

          // Delay mesmo em caso de erro para evitar rate limiting
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      // 4. Atualizar registro de sincronização geral
      await this.receitaSincronizacaoModel.atualizarStatus(sincronizacaoId, 'concluida', {
        total_consultados: result.totalConsultados,
        total_encontrados: result.totalEncontrados,
        total_atualizados: result.totalAtualizados,
        total_erros: result.totalErros,
        resultado_completo: result,
        tempo_execucao_ms: Date.now() - tempoInicio,
        mensagem: `Sincronização geral concluída: ${result.totalAtualizados} atualizado(s) de ${result.totalConsultados} consultado(s)`,
      });

      return result;
    } catch (error) {
      // Atualizar sincronização como erro
      if (sincronizacaoId) {
        await this.receitaSincronizacaoModel.atualizarStatus(sincronizacaoId, 'erro', {
          total_consultados: result.totalConsultados,
          total_encontrados: result.totalEncontrados,
          total_atualizados: result.totalAtualizados,
          total_erros: result.totalErros,
          erros: [{ mensagem: error instanceof Error ? error.message : 'Erro desconhecido' }],
          tempo_execucao_ms: Date.now() - tempoInicio,
          mensagem: `Erro na sincronização geral: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        });
      }

      throw new Error(
        `Erro na sincronização geral: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
      );
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
      dctf_id: null, // Será preenchido quando encontrar match
      status_processamento: 'novo' as const,
      dados_completos: item, // Salva item completo para referência
      observacoes: null,
      erro_sincronizacao: null,
    };
  }

  /**
   * Encontra pagamento correspondente na resposta da Receita
   */
  private encontrarPagamentoCorrespondente(
    debito: DCTF,
    pagamentosReceita: ReceitaPagamentoItem[]
  ): ReceitaPagamentoItem | null {
    // Extrair período da DCTF (pode ser periodo ou periodoApuracao)
    const periodoDCTF = debito.periodoApuracao || debito.periodo;
    if (!periodoDCTF) return null;

    const competenciaDCTF = periodoDCTF.includes('-') 
      ? periodoDCTF.substring(0, 7) 
      : periodoDCTF;

    // Procurar pagamento correspondente
    for (const pagamento of pagamentosReceita) {
      const competenciaPagamento = pagamento.competencia || 
        (pagamento.periodoApuracao ? pagamento.periodoApuracao.substring(0, 7) : null);

      if (!competenciaPagamento) continue;

      // Comparar competência
      if (competenciaPagamento !== competenciaDCTF) {
        continue;
      }

      // Comparar valores (com tolerância de 10% para diferenças de arredondamento)
      if (debito.saldoAPagar !== null && debito.saldoAPagar !== undefined) {
        const valorDCTF = Math.abs(Number(debito.saldoAPagar));
        const valorPagamento = Math.abs(pagamento.valorSaldoDocumento);
        
        if (valorDCTF > 0 || valorPagamento > 0) {
          const maxValor = Math.max(valorDCTF, valorPagamento);
          const diferencaPercentual = maxValor > 0 
            ? Math.abs(valorDCTF - valorPagamento) / maxValor 
            : 0;

          // Se valores são muito diferentes, não é o mesmo pagamento
          if (diferencaPercentual > 0.1) { // 10% de tolerância
            continue;
          }
        }
      }

      // Encontrou pagamento correspondente!
      return pagamento;
    }

    return null;
  }

  /**
   * Sincroniza um débito específico
   */
  async sincronizarDebito(dctfId: string): Promise<SincronizacaoResult> {
    const tempoInicio = Date.now();
    const cnpjLimpo = '';
    let sincronizacaoId: string | undefined;

    const result: SincronizacaoResult = {
      totalConsultados: 1,
      totalEncontrados: 0,
      totalAtualizados: 0,
      totalErros: 0,
      detalhes: [],
    };

    try {
      // Buscar débito no nosso sistema
      const debitos = await this.pagamentoService.buscarDebitos({});
      const debito = debitos.find(d => d.id === dctfId);

      if (!debito || !debito.numeroIdentificacao) {
        result.totalErros++;
        result.detalhes.push({
          dctfId,
          cnpj: '',
          periodo: '',
          status: 'erro',
          mensagem: 'Débito não encontrado ou sem CNPJ',
        });
        return result;
      }

      const cnpj = debito.numeroIdentificacao.replace(/\D/g, '');
      const periodo = debito.periodoApuracao || debito.periodo || '';

      // Criar registro de sincronização
      const sincronizacaoRecord = await this.receitaSincronizacaoModel.criarSincronizacao({
        cnpj_contribuinte: cnpj,
        periodo_inicial: null,
        periodo_final: null,
        tipo_sincronizacao: 'debito_especifico',
        total_consultados: 1,
        total_encontrados: 0,
        total_atualizados: 0,
        total_erros: 0,
        status: 'em_andamento',
        executado_por: 'sistema-sincronizacao-receita',
      });
      sincronizacaoId = sincronizacaoRecord.id;
      result.sincronizacaoId = sincronizacaoId;

      // Extrair ano e mês para buscar na Receita
      const [ano, mes] = periodo.split('-');
      const periodoFinal = `${ano}-${mes}`;

      const resultadoCliente = await this.sincronizarCliente(
        cnpj,
        periodoFinal,
        periodoFinal
      );

      // Filtrar apenas o débito específico
      const detalheEspecifico = resultadoCliente.detalhes.find(d => d.dctfId === dctfId);
      
      if (detalheEspecifico) {
        result.totalEncontrados = detalheEspecifico.status === 'atualizado' ? 1 : 0;
        result.totalAtualizados = detalheEspecifico.status === 'atualizado' ? 1 : 0;
        result.totalErros = detalheEspecifico.status === 'erro' ? 1 : 0;
        result.detalhes.push(detalheEspecifico);
      } else {
        result.totalErros++;
        result.detalhes.push({
          dctfId,
          cnpj,
          periodo,
          status: 'nao_encontrado',
          mensagem: 'Nenhum pagamento correspondente encontrado na Receita',
        });
      }

      // Atualizar registro de sincronização
      await this.receitaSincronizacaoModel.atualizarStatus(sincronizacaoId, 'concluida', {
        total_consultados: result.totalConsultados,
        total_encontrados: result.totalEncontrados,
        total_atualizados: result.totalAtualizados,
        total_erros: result.totalErros,
        resultado_completo: result,
        tempo_execucao_ms: Date.now() - tempoInicio,
        mensagem: result.totalAtualizados > 0 
          ? 'Débito sincronizado com sucesso' 
          : 'Nenhum pagamento correspondente encontrado',
      });

      return result;
    } catch (error) {
      // Atualizar sincronização como erro
      if (sincronizacaoId) {
        await this.receitaSincronizacaoModel.atualizarStatus(sincronizacaoId, 'erro', {
          total_consultados: result.totalConsultados,
          total_encontrados: result.totalEncontrados,
          total_atualizados: result.totalAtualizados,
          total_erros: result.totalErros,
          erros: [{ mensagem: error instanceof Error ? error.message : 'Erro desconhecido' }],
          tempo_execucao_ms: Date.now() - tempoInicio,
          mensagem: `Erro ao sincronizar débito: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        });
      }

      result.totalErros++;
      result.detalhes.push({
        dctfId,
        cnpj: cnpjLimpo || '',
        periodo: '',
        status: 'erro',
        mensagem: error instanceof Error ? error.message : 'Erro desconhecido',
      });
      return result;
    }
  }
}


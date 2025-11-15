/**
 * Controller para buscar pagamentos da Receita Federal salvos na tabela
 */

import { Request, Response } from 'express';
import { ReceitaPagamentoModel } from '../models/ReceitaPagamento';
import { ApiResponse } from '../types';

export class ReceitaPagamentoController {
  private receitaPagamentoModel: ReceitaPagamentoModel;

  constructor() {
    this.receitaPagamentoModel = new ReceitaPagamentoModel();
  }

  /**
   * GET /api/receita-pagamentos
   * Lista pagamentos salvos na tabela receita_pagamentos
   */
  async listarPagamentos(req: Request, res: Response): Promise<void> {
    try {
      const { cnpj, dataInicial, dataFinal, competencia, statusProcessamento } = req.query;

      if (!process.env['SUPABASE_URL']) {
        const response: ApiResponse = {
          success: false,
          error: 'Supabase não configurado',
        };
        res.status(500).json(response);
        return;
      }

      // Usar método do modelo para buscar pagamentos
      let pagamentosSalvos: any[] = [];
      
      // Buscar por CNPJ e competência se fornecido
      if (cnpj && typeof cnpj === 'string') {
        const cnpjLimpo = cnpj.replace(/\D/g, '');
        
        if (competencia && typeof competencia === 'string') {
          pagamentosSalvos = await this.receitaPagamentoModel.buscarPorCNPJCompetencia(cnpjLimpo, competencia);
        } else {
          // Buscar todos do CNPJ e filtrar manualmente por datas se necessário
          // Acessar supabase através de método público ou criar método na classe
          const { supabase: supabaseClient } = this.receitaPagamentoModel as any;
          let query = supabaseClient
            .from('receita_pagamentos')
            .select('*')
            .eq('cnpj_contribuinte', cnpjLimpo)
            .order('data_sincronizacao', { ascending: false });

          // Filtrar por data inicial
          if (dataInicial && typeof dataInicial === 'string') {
            query = query.gte('periodo_consulta_inicial', dataInicial);
          }

          // Filtrar por data final
          if (dataFinal && typeof dataFinal === 'string') {
            query = query.lte('periodo_consulta_final', dataFinal);
          }

          // Filtrar por status de processamento
          if (statusProcessamento && typeof statusProcessamento === 'string') {
            query = query.eq('status_processamento', statusProcessamento);
          }

          const { data, error } = await query;
          
          if (error) {
            throw new Error(`Erro ao buscar pagamentos: ${error.message}`);
          }
          
          pagamentosSalvos = data || [];
        }
      } else {
        // Buscar todos (aumentar limite ou remover para buscar todos)
        const { supabase: supabaseClient } = this.receitaPagamentoModel as any;
        let query = supabaseClient
          .from('receita_pagamentos')
          .select('*')
          .order('data_sincronizacao', { ascending: false })
          .limit(1000); // Aumentar limite para 1000

        // Filtrar por data inicial se fornecido
        if (dataInicial && typeof dataInicial === 'string') {
          query = query.gte('periodo_consulta_inicial', dataInicial);
        }

        // Filtrar por data final se fornecido
        if (dataFinal && typeof dataFinal === 'string') {
          query = query.lte('periodo_consulta_final', dataFinal);
        }

        // Filtrar por status de processamento
        if (statusProcessamento && typeof statusProcessamento === 'string') {
          query = query.eq('status_processamento', statusProcessamento);
        }

        const { data, error } = await query;
        
        if (error) {
          throw new Error(`Erro ao buscar pagamentos: ${error.message}`);
        }
        
        pagamentosSalvos = data || [];
        console.log(`[ReceitaPagamentoController] Buscados ${pagamentosSalvos.length} pagamentos sem filtro de CNPJ`);
      }

      // Buscar dados dos clientes baseado nos CNPJs únicos dos pagamentos
      // Garantir que CNPJs estejam limpos (apenas números)
      const cnpjsUnicos = [...new Set(
        pagamentosSalvos
          .map((p: any) => {
            if (!p.cnpj_contribuinte) return null;
            const cnpjLimpo = String(p.cnpj_contribuinte).replace(/\D/g, '');
            return cnpjLimpo.length === 14 ? cnpjLimpo : null;
          })
          .filter((cnpj: string | null): cnpj is string => Boolean(cnpj))
      )];
      
      console.log(`[ReceitaPagamentoController] Total de pagamentos: ${pagamentosSalvos.length}, CNPJs únicos: ${cnpjsUnicos.length}`);
      
      const clientesMap = new Map<string, any>();

      if (cnpjsUnicos.length > 0) {
        console.log('[ReceitaPagamentoController] Buscando clientes para CNPJs:', cnpjsUnicos.slice(0, 10), cnpjsUnicos.length > 10 ? `... e mais ${cnpjsUnicos.length - 10}` : '');
        
        const { supabase: supabaseClient } = this.receitaPagamentoModel as any;
        
        // Dividir em chunks se houver muitos CNPJs (limite do Supabase .in() é ~1000)
        const chunkSize = 500;
        const chunks: string[][] = [];
        for (let i = 0; i < cnpjsUnicos.length; i += chunkSize) {
          chunks.push(cnpjsUnicos.slice(i, i + chunkSize));
        }
        
        for (const chunk of chunks) {
          const { data: clientesData, error: clientesError } = await supabaseClient
            .from('clientes')
            .select('id, razao_social, nome, cnpj_limpo')
            .in('cnpj_limpo', chunk);

          if (clientesError) {
            console.error('[ReceitaPagamentoController] Erro ao buscar clientes:', clientesError);
          } else if (clientesData) {
            console.log(`[ReceitaPagamentoController] Clientes encontrados neste chunk: ${clientesData.length}`);
            clientesData.forEach((cliente: any) => {
              // Garantir que o CNPJ do cliente também esteja limpo para comparação
              const cnpjLimpo = String(cliente.cnpj_limpo || '').replace(/\D/g, '');
              if (cnpjLimpo.length === 14) {
                clientesMap.set(cnpjLimpo, {
                  ...cliente,
                  nome: cliente.razao_social || cliente.nome || 'SEM NOME',
                });
                console.log(`[ReceitaPagamentoController] Cliente mapeado: ${cnpjLimpo} -> ${cliente.razao_social || cliente.nome || 'SEM NOME'}`);
              }
            });
          }
        }
        
        console.log(`[ReceitaPagamentoController] Total de clientes mapeados: ${clientesMap.size} de ${cnpjsUnicos.length} CNPJs únicos`);
        
        if (clientesMap.size === 0) {
          console.warn('[ReceitaPagamentoController] Nenhum cliente encontrado para os CNPJs. Verifique se os CNPJs na tabela clientes correspondem aos CNPJs nos pagamentos.');
        }
      } else {
        console.warn('[ReceitaPagamentoController] Nenhum CNPJ válido encontrado nos pagamentos retornados');
      }

      // Mapear para formato esperado pelo frontend
      const pagamentos = pagamentosSalvos.map(item => {
        // Garantir que o CNPJ esteja limpo para busca
        const cnpjOriginal = item.cnpj_contribuinte ? String(item.cnpj_contribuinte) : '';
        const cnpjLimpo = cnpjOriginal.replace(/\D/g, '');
        const cliente = cnpjLimpo && cnpjLimpo.length === 14 && clientesMap.has(cnpjLimpo) ? clientesMap.get(cnpjLimpo) : null;
        
        // Priorizar razao_social ou nome do cliente, senão usar CNPJ formatado
        let clienteNome = cnpjOriginal || 'SEM CNPJ'; // fallback: CNPJ original
        
        if (cliente) {
          const nomeCliente = cliente.razao_social || cliente.nome;
          if (nomeCliente && String(nomeCliente).trim()) {
            clienteNome = String(nomeCliente).trim();
          }
        } else if (cnpjLimpo && cnpjLimpo.length === 14) {
          // Se não encontrou cliente, manter o CNPJ original (já pode estar formatado)
          console.log(`[ReceitaPagamentoController] Cliente não encontrado para CNPJ: ${cnpjLimpo}`);
        }
        
        return {
          cnpj: item.cnpj_contribuinte,
          clienteNome: clienteNome,
          clienteId: cliente?.id || undefined,
          clienteEncontrado: !!cliente, // Flag indicando se o cliente foi encontrado na tabela
          clienteNaoEncontrado: !cliente && !!cnpjLimpo, // Flag indicando se tentou buscar mas não encontrou
          numeroDocumento: item.numero_documento,
          tipoDocumento: item.tipo_documento || '',
          periodoApuracao: item.periodo_apuracao ? new Date(item.periodo_apuracao).toISOString().split('T')[0] : '',
          competencia: item.competencia || '',
          dataArrecadacao: item.data_arrecadacao ? new Date(item.data_arrecadacao).toISOString().split('T')[0] : '',
          dataVencimento: item.data_vencimento ? new Date(item.data_vencimento).toISOString().split('T')[0] : '',
          codigoReceitaDoc: item.codigo_receita_doc || '',
          valorDocumento: parseFloat(item.valor_documento?.toString() || '0'),
          valorSaldoDocumento: parseFloat(item.valor_saldo_documento?.toString() || '0'),
          valorPrincipal: parseFloat(item.valor_principal?.toString() || '0'),
          valorSaldoPrincipal: parseFloat(item.valor_saldo_principal?.toString() || '0'),
          sequencial: item.sequencial || undefined,
          codigoReceitaLinha: item.codigo_receita_linha || undefined,
          descricaoReceitaLinha: item.descricao_receita_linha || undefined,
          periodoApuracaoLinha: item.periodo_apuracao_linha ? new Date(item.periodo_apuracao_linha).toISOString().split('T')[0] : undefined,
          dataVencimentoLinha: item.data_vencimento_linha ? new Date(item.data_vencimento_linha).toISOString().split('T')[0] : undefined,
          valorLinha: item.valor_linha ? parseFloat(item.valor_linha.toString()) : undefined,
          valorPrincipalLinha: item.valor_principal_linha ? parseFloat(item.valor_principal_linha.toString()) : undefined,
          valorSaldoLinha: item.valor_saldo_linha ? parseFloat(item.valor_saldo_linha.toString()) : undefined,
        };
      });

      const response: ApiResponse = {
        success: true,
        data: pagamentos,
        message: `${pagamentos.length} pagamento(s) encontrado(s)`,
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
}


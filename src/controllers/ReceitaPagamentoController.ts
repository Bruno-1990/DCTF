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
   * Formata CNPJ com máscara: XX.XXX.XXX/XXXX-XX
   */
  private formatCNPJ(cnpj: string): string {
    const digits = String(cnpj).replace(/\D/g, '');
    if (digits.length !== 14) return cnpj; // Retornar original se inválido
    
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }

  /**
   * GET /api/receita-pagamentos
   * Lista pagamentos salvos na tabela receita_pagamentos
   */
  async listarPagamentos(req: Request, res: Response): Promise<void> {
    try {
      const { cnpj, nomeCliente, dataInicial, dataFinal, competencia, statusProcessamento } = req.query;

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
      let cnpjsParaBuscar: string[] = [];
      
      // Se fornecido nomeCliente, buscar CNPJs correspondentes primeiro
      if (nomeCliente && typeof nomeCliente === 'string' && nomeCliente.trim()) {
        const { supabase: supabaseClient } = this.receitaPagamentoModel as any;
        const nomeBusca = nomeCliente.trim().toLowerCase();
        
        // Buscar clientes por razao_social (ilike para busca parcial case-insensitive)
        const { data: clientesEncontrados, error: clientesError } = await supabaseClient
          .from('clientes')
          .select('cnpj_limpo')
          .ilike('razao_social', `%${nomeBusca}%`);
        
        if (clientesError) {
          console.warn('[ReceitaPagamentoController] Erro ao buscar clientes por nome:', clientesError);
        } else if (clientesEncontrados && clientesEncontrados.length > 0) {
          cnpjsParaBuscar = clientesEncontrados
            .map((c: any) => String(c.cnpj_limpo || '').replace(/\D/g, '').trim())
            .filter((cnpj: string) => cnpj.length === 14);
          console.log(`[ReceitaPagamentoController] Encontrados ${cnpjsParaBuscar.length} CNPJ(s) para o nome "${nomeBusca}"`);
        }
      }
      
      // Buscar por CNPJ e competência se fornecido
      if (cnpj && typeof cnpj === 'string') {
        const cnpjLimpo = cnpj.replace(/\D/g, '');
        
        // Se já há CNPJs da busca por nome, adicionar este também (se válido)
        if (cnpjLimpo.length === 14) {
          if (cnpjsParaBuscar.length > 0) {
            // Se já há CNPJs da busca por nome, adicionar este também (evitar duplicatas)
            if (!cnpjsParaBuscar.includes(cnpjLimpo)) {
              cnpjsParaBuscar.push(cnpjLimpo);
            }
          } else {
            cnpjsParaBuscar = [cnpjLimpo];
          }
        }
        
        if (competencia && typeof competencia === 'string') {
          // Se há múltiplos CNPJs da busca por nome, buscar todos
          if (cnpjsParaBuscar.length > 1) {
            const { supabase: supabaseClient } = this.receitaPagamentoModel as any;
            const { data, error } = await supabaseClient
              .from('receita_pagamentos')
              .select('*')
              .in('cnpj_contribuinte', cnpjsParaBuscar)
              .eq('competencia', competencia)
              .order('data_sincronizacao', { ascending: false });
            
            if (error) {
              throw new Error(`Erro ao buscar pagamentos: ${error.message}`);
            }
            pagamentosSalvos = data || [];
          } else {
            pagamentosSalvos = await this.receitaPagamentoModel.buscarPorCNPJCompetencia(cnpjsParaBuscar[0] || cnpjLimpo, competencia);
          }
        } else {
          // Buscar todos do(s) CNPJ(s) e filtrar manualmente por datas se necessário
          const { supabase: supabaseClient } = this.receitaPagamentoModel as any;
          let query = supabaseClient
            .from('receita_pagamentos')
            .select('*');
          
          // Usar .in() se há múltiplos CNPJs, senão usar .eq()
          if (cnpjsParaBuscar.length > 1) {
            query = query.in('cnpj_contribuinte', cnpjsParaBuscar);
          } else if (cnpjsParaBuscar.length === 1) {
            query = query.eq('cnpj_contribuinte', cnpjsParaBuscar[0]);
          } else if (cnpjLimpo.length === 14) {
            query = query.eq('cnpj_contribuinte', cnpjLimpo);
          }
          
          query = query.order('data_sincronizacao', { ascending: false });

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
      } else if (cnpjsParaBuscar.length > 0) {
        // Buscar por CNPJs encontrados pelo nome do cliente (sem CNPJ direto no query)
        const { supabase: supabaseClient } = this.receitaPagamentoModel as any;
        let query = supabaseClient
          .from('receita_pagamentos')
          .select('*')
          .in('cnpj_contribuinte', cnpjsParaBuscar)
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
      } else {
        // Buscar todos (usar paginação para buscar todos os registros)
        const { supabase: supabaseClient } = this.receitaPagamentoModel as any;
        
        // Construir query base
        let baseQuery = supabaseClient
          .from('receita_pagamentos')
          .select('*')
          .order('data_sincronizacao', { ascending: false });

        // Filtrar por data inicial se fornecido
        if (dataInicial && typeof dataInicial === 'string') {
          baseQuery = baseQuery.gte('periodo_consulta_inicial', dataInicial);
        }

        // Filtrar por data final se fornecido
        if (dataFinal && typeof dataFinal === 'string') {
          baseQuery = baseQuery.lte('periodo_consulta_final', dataFinal);
        }

        // Filtrar por status de processamento
        if (statusProcessamento && typeof statusProcessamento === 'string') {
          baseQuery = baseQuery.eq('status_processamento', statusProcessamento);
        }

        // Buscar todos os registros em batches (Supabase limita a 1000 por padrão)
        pagamentosSalvos = [];
        const batchSize = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const query = baseQuery.range(offset, offset + batchSize - 1);
          const { data, error } = await query;
          
          if (error) {
            throw new Error(`Erro ao buscar pagamentos: ${error.message}`);
          }
          
          if (!data || data.length === 0) {
            hasMore = false;
          } else {
            pagamentosSalvos.push(...data);
            offset += batchSize;
            
            // Se retornou menos que o batch size, chegamos ao fim
            if (data.length < batchSize) {
              hasMore = false;
            }
          }
        }
        
        console.log(`[ReceitaPagamentoController] Buscados ${pagamentosSalvos.length} pagamentos sem filtro de CNPJ (em ${Math.ceil(pagamentosSalvos.length / batchSize)} batch[es])`);
      }

      // Buscar dados dos clientes baseado nos CNPJs únicos dos pagamentos
      // Garantir que CNPJs estejam limpos (apenas números)
      const cnpjsUnicos = [...new Set(
        pagamentosSalvos
          .map((p: any) => {
            if (!p.cnpj_contribuinte) return null;
            // Limpar e normalizar CNPJ: remover todos os caracteres não numéricos
            const cnpjOriginal = String(p.cnpj_contribuinte).trim();
            const cnpjLimpo = cnpjOriginal.replace(/\D/g, '').trim();
            
            if (cnpjLimpo.length !== 14) {
              console.warn(`[ReceitaPagamentoController] CNPJ inválido encontrado nos pagamentos: "${cnpjOriginal}" -> "${cnpjLimpo}" (${cnpjLimpo.length} dígitos)`);
              return null;
            }
            
            // Garantir que é string
            return String(cnpjLimpo);
          })
          .filter((cnpj: string | null): cnpj is string => Boolean(cnpj))
      )].sort(); // Ordenar para facilitar debug
      
      console.log(`[ReceitaPagamentoController] Total de pagamentos: ${pagamentosSalvos.length}, CNPJs únicos: ${cnpjsUnicos.length}`);
      if (cnpjsUnicos.length > 0) {
        console.log('[ReceitaPagamentoController] Primeiros CNPJs únicos:', cnpjsUnicos.slice(0, 5));
      }
      
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
          console.log(`[ReceitaPagamentoController] Buscando chunk de ${chunk.length} CNPJs...`);
          console.log(`[ReceitaPagamentoController] Primeiros CNPJs do chunk (tipo e valor):`, chunk.slice(0, 3).map(cnpj => ({ tipo: typeof cnpj, valor: cnpj, length: String(cnpj).length })));
          
          // Garantir que todos os CNPJs do chunk sejam strings e estejam limpos
          const chunkLimpo = chunk.map(cnpj => String(cnpj).replace(/\D/g, '').trim()).filter(c => c.length === 14);
          
          if (chunkLimpo.length === 0) {
            console.warn(`[ReceitaPagamentoController] ⚠ Chunk sem CNPJs válidos após limpeza`);
            continue;
          }
          
          console.log(`[ReceitaPagamentoController] CNPJs limpos para busca (${chunkLimpo.length}):`, chunkLimpo.slice(0, 3));
          
          const { data: clientesData, error: clientesError } = await supabaseClient
            .from('clientes')
            .select('id, razao_social, cnpj_limpo')
            .in('cnpj_limpo', chunkLimpo);

          if (clientesError) {
            console.error('[ReceitaPagamentoController] Erro ao buscar clientes:', clientesError);
            console.error('[ReceitaPagamentoController] CNPJs que causaram erro:', chunkLimpo.slice(0, 5));
            
            // Tentar busca individual para debug
            console.log('[ReceitaPagamentoController] Tentando busca individual para debug...');
            for (const cnpjTest of chunkLimpo.slice(0, 3)) {
              const { data: testData, error: testError } = await supabaseClient
                .from('clientes')
                .select('id, razao_social, cnpj_limpo')
                .eq('cnpj_limpo', cnpjTest)
                .maybeSingle();
              
              if (testError) {
                console.error(`[ReceitaPagamentoController] Erro ao buscar CNPJ individual ${cnpjTest}:`, testError);
              } else if (testData) {
                console.log(`[ReceitaPagamentoController] ✓ CNPJ individual encontrado: ${cnpjTest} -> "${testData.razao_social || 'SEM NOME'}"`);
              } else {
                console.warn(`[ReceitaPagamentoController] ✗ CNPJ individual não encontrado: ${cnpjTest}`);
              }
            }
          } else if (clientesData) {
            console.log(`[ReceitaPagamentoController] Clientes encontrados neste chunk: ${clientesData.length} de ${chunkLimpo.length} CNPJs`);
            
            // Log detalhado dos dados retornados
            if (clientesData.length > 0) {
              console.log(`[ReceitaPagamentoController] Primeiro cliente retornado:`, {
                id: clientesData[0].id,
                razao_social: clientesData[0].razao_social,
                cnpj_limpo: clientesData[0].cnpj_limpo,
                cnpj_limpo_tipo: typeof clientesData[0].cnpj_limpo,
                cnpj_limpo_length: String(clientesData[0].cnpj_limpo).length,
              });
            }
            
            // Log dos CNPJs encontrados vs não encontrados
            const cnpjsEncontrados = new Set<string>();
            
            clientesData.forEach((cliente: any) => {
              // Garantir que o CNPJ do cliente também esteja limpo para comparação
              const cnpjLimpoCliente = String(cliente.cnpj_limpo || '').replace(/\D/g, '').trim();
              
              if (cnpjLimpoCliente.length === 14) {
                clientesMap.set(cnpjLimpoCliente, {
                  ...cliente,
                  nome: cliente.razao_social || 'SEM NOME', // Apenas razao_social existe na tabela
                });
                cnpjsEncontrados.add(cnpjLimpoCliente);
                console.log(`[ReceitaPagamentoController] ✓ Cliente encontrado: ${cnpjLimpoCliente} -> "${cliente.razao_social || 'SEM NOME'}"`);
              } else {
                console.warn(`[ReceitaPagamentoController] ⚠ CNPJ inválido do cliente na resposta: "${cliente.cnpj_limpo}" (tipo: ${typeof cliente.cnpj_limpo}) -> "${cnpjLimpoCliente}" (${cnpjLimpoCliente.length} dígitos)`);
              }
            });
            
            // Log dos CNPJs não encontrados neste chunk
            const cnpjsNaoEncontrados = chunkLimpo.filter(cnpj => !cnpjsEncontrados.has(cnpj));
            if (cnpjsNaoEncontrados.length > 0) {
              console.warn(`[ReceitaPagamentoController] ✗ CNPJs não encontrados neste chunk (${cnpjsNaoEncontrados.length}):`, cnpjsNaoEncontrados.slice(0, 10));
              
              // Tentar busca individual para os não encontrados
              console.log('[ReceitaPagamentoController] Tentando busca individual para CNPJs não encontrados...');
              for (const cnpjMissing of cnpjsNaoEncontrados.slice(0, 5)) {
                const { data: missingData, error: missingError } = await supabaseClient
                  .from('clientes')
                  .select('id, razao_social, cnpj_limpo')
                  .eq('cnpj_limpo', cnpjMissing)
                  .maybeSingle();
                
                if (missingError) {
                  console.error(`[ReceitaPagamentoController] Erro ao buscar CNPJ faltante ${cnpjMissing}:`, missingError);
                } else if (missingData) {
                  console.log(`[ReceitaPagamentoController] ⚠ CNPJ encontrado em busca individual (mas não em .in()): ${cnpjMissing} -> "${missingData.razao_social || 'SEM NOME'}"`);
                  // Adicionar manualmente ao map
                  clientesMap.set(cnpjMissing, {
                    ...missingData,
                    nome: missingData.razao_social || 'SEM NOME', // Apenas razao_social existe na tabela
                  });
                } else {
                  console.warn(`[ReceitaPagamentoController] ✗ CNPJ realmente não existe na tabela: ${cnpjMissing}`);
                }
              }
            }
          } else {
            console.warn(`[ReceitaPagamentoController] ⚠ Resposta vazia (sem erro) para chunk de ${chunkLimpo.length} CNPJs`);
          }
        }
        
        console.log(`[ReceitaPagamentoController] Total de clientes mapeados: ${clientesMap.size} de ${cnpjsUnicos.length} CNPJs únicos`);
        
        if (clientesMap.size === 0) {
          console.warn('[ReceitaPagamentoController] ⚠ Nenhum cliente encontrado para os CNPJs. Verifique:');
          console.warn('  1. Se os CNPJs na tabela clientes estão no formato correto (apenas números, 14 dígitos)');
          console.warn('  2. Se os CNPJs nos pagamentos correspondem aos CNPJs dos clientes');
          console.warn(`  3. Primeiros CNPJs dos pagamentos: ${cnpjsUnicos.slice(0, 3).join(', ')}`);
        } else if (clientesMap.size < cnpjsUnicos.length) {
          const cnpjsNaoEncontrados = cnpjsUnicos.filter(cnpj => !clientesMap.has(cnpj));
          console.warn(`[ReceitaPagamentoController] ⚠ Apenas ${clientesMap.size} de ${cnpjsUnicos.length} CNPJs encontrados na tabela clientes`);
          console.warn(`[ReceitaPagamentoController] CNPJs não encontrados (primeiros 10):`, cnpjsNaoEncontrados.slice(0, 10));
        }
      } else {
        console.warn('[ReceitaPagamentoController] ⚠ Nenhum CNPJ válido encontrado nos pagamentos retornados');
      }

      // Mapear para formato esperado pelo frontend
      const pagamentos = pagamentosSalvos.map(item => {
        // Garantir que o CNPJ esteja limpo para busca (normalizar)
        const cnpjOriginal = item.cnpj_contribuinte ? String(item.cnpj_contribuinte).trim() : '';
        const cnpjLimpo = cnpjOriginal.replace(/\D/g, '');
        
        // Buscar cliente usando CNPJ limpo
        const cliente = cnpjLimpo && cnpjLimpo.length === 14 && clientesMap.has(cnpjLimpo) 
          ? clientesMap.get(cnpjLimpo) 
          : null;
        
        // Priorizar razao_social ou nome do cliente, senão usar CNPJ formatado
        let clienteNome: string;
        let clienteEncontradoFlag = false;
        let clienteNaoEncontradoFlag = false;
        
        if (cliente) {
          const nomeCliente = cliente.razao_social; // Apenas razao_social existe na tabela clientes
          if (nomeCliente && String(nomeCliente).trim()) {
            clienteNome = String(nomeCliente).trim();
            clienteEncontradoFlag = true;
          } else {
            // Cliente foi encontrado mas não tem razao_social válido
            clienteNome = cnpjLimpo.length === 14 ? this.formatCNPJ(cnpjLimpo) : cnpjOriginal || 'SEM CNPJ';
            clienteEncontradoFlag = true;
          }
        } else if (cnpjLimpo && cnpjLimpo.length === 14) {
          // Se não encontrou cliente, usar CNPJ formatado
          clienteNome = this.formatCNPJ(cnpjLimpo);
          clienteNaoEncontradoFlag = true;
        } else {
          // CNPJ inválido
          clienteNome = cnpjOriginal || 'SEM CNPJ';
        }
        
        return {
          id: item.id, // ID do pagamento no banco de dados
          cnpj: cnpjLimpo.length === 14 ? cnpjLimpo : item.cnpj_contribuinte, // Retornar CNPJ limpo se válido
          clienteNome: clienteNome,
          clienteId: cliente?.id || undefined,
          clienteEncontrado: clienteEncontradoFlag, // Flag indicando se o cliente foi encontrado na tabela
          clienteNaoEncontrado: clienteNaoEncontradoFlag, // Flag indicando se tentou buscar mas não encontrou
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

  /**
   * DELETE /api/receita-pagamentos/:id
   * Exclui um pagamento por ID, todos os pagamentos de um número de documento, ou todos os pagamentos de um cliente
   */
  async excluirPagamento(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { numeroDocumento, cnpj } = req.query; // Opcional: se fornecido, exclui todos os registros do documento ou cliente

      if (!id && !numeroDocumento && !cnpj) {
        const response: ApiResponse = {
          success: false,
          error: 'ID do pagamento, número de documento ou CNPJ não fornecido',
        };
        res.status(400).json(response);
        return;
      }

      if (cnpj && typeof cnpj === 'string') {
        // Excluir todos os pagamentos do cliente por CNPJ
        const totalExcluidos = await this.receitaPagamentoModel.excluirPagamentosPorCNPJ(cnpj);
        const response: ApiResponse = {
          success: true,
          data: { 
            message: `${totalExcluidos} pagamento(s) do cliente excluído(s) com sucesso`,
            totalExcluidos 
          },
        };
        res.json(response);
      } else if (numeroDocumento && typeof numeroDocumento === 'string') {
        // Excluir todos os registros relacionados ao número de documento
        const totalExcluidos = await this.receitaPagamentoModel.excluirPagamentosPorNumeroDocumento(numeroDocumento);
        const response: ApiResponse = {
          success: true,
          data: { 
            message: `${totalExcluidos} registro(s) excluído(s) com sucesso`,
            totalExcluidos 
          },
        };
        res.json(response);
      } else if (id) {
        // Excluir apenas o registro específico
        await this.receitaPagamentoModel.excluirPagamento(id);
        const response: ApiResponse = {
          success: true,
          data: { message: 'Pagamento excluído com sucesso' },
        };
        res.json(response);
      }
    } catch (error: any) {
      console.error('[ReceitaPagamentoController] Erro ao excluir pagamento:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message || 'Erro ao excluir pagamento',
      };
      res.status(500).json(response);
    }
  }

  /**
   * GET /api/receita-pagamentos/comprovante
   * Busca comprovante de pagamento na Receita Federal por CNPJ e número do documento
   */
  async buscarComprovante(req: Request, res: Response): Promise<void> {
    try {
      const { cnpj, numeroDocumento } = req.query;

      if (!cnpj || typeof cnpj !== 'string') {
        const response: ApiResponse = {
          success: false,
          error: 'CNPJ não fornecido',
        };
        res.status(400).json(response);
        return;
      }

      if (!numeroDocumento || typeof numeroDocumento !== 'string') {
        const response: ApiResponse = {
          success: false,
          error: 'Número do documento não fornecido',
        };
        res.status(400).json(response);
        return;
      }

      // Importar ReceitaFederalService dinamicamente
      const { ReceitaFederalService } = await import('../services/ReceitaFederalService');
      const receitaService = new ReceitaFederalService();

      const comprovante = await receitaService.buscarComprovantePagamento(cnpj, numeroDocumento);

      const response: ApiResponse = {
        success: true,
        data: comprovante,
        message: 'Comprovante encontrado com sucesso',
      };
      res.json(response);
    } catch (error: any) {
      console.error('[ReceitaPagamentoController] Erro ao buscar comprovante:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message || 'Erro ao buscar comprovante na Receita Federal',
      };
      res.status(500).json(response);
    }
  }

  /**
   * GET /api/receita-pagamentos/e-processos
   * Consulta processos eletrônicos (E-Processos) na Receita Federal por CNPJ
   */
  async consultarEProcessos(req: Request, res: Response): Promise<void> {
    try {
      const { cnpj } = req.query;

      if (!cnpj || typeof cnpj !== 'string') {
        const response: ApiResponse = {
          success: false,
          error: 'CNPJ não fornecido',
        };
        res.status(400).json(response);
        return;
      }

      // Importar ReceitaFederalService dinamicamente
      const { ReceitaFederalService } = await import('../services/ReceitaFederalService');
      const receitaService = new ReceitaFederalService();

      const processos = await receitaService.consultarEProcessos(cnpj);

      const response: ApiResponse = {
        success: true,
        data: processos,
        message: 'E-Processos consultados com sucesso',
      };
      res.json(response);
    } catch (error: any) {
      console.error('[ReceitaPagamentoController] Erro ao consultar E-Processos:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message || 'Erro ao consultar E-Processos na Receita Federal',
      };
      res.status(500).json(response);
    }
  }
}


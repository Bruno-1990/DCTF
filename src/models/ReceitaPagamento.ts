/**
 * Modelo para tabela receita_pagamentos
 * Armazena dados de pagamento retornados pela API da Receita Federal
 */

import { DatabaseService } from '../services/DatabaseService';

export interface ReceitaPagamento {
  id: string;
  cnpj_contribuinte: string;
  periodo_consulta_inicial?: string | Date | null;
  periodo_consulta_final?: string | Date | null;
  data_sincronizacao: string | Date;
  numero_documento: string;
  tipo_documento?: string | null;
  periodo_apuracao?: string | Date | null;
  competencia?: string | null;
  data_arrecadacao?: string | Date | null;
  data_vencimento?: string | Date | null;
  codigo_receita_doc?: string | null;
  valor_documento?: number | null;
  valor_saldo_documento?: number | null;
  valor_principal?: number | null;
  valor_saldo_principal?: number | null;
  sequencial?: string | null;
  codigo_receita_linha?: string | null;
  descricao_receita_linha?: string | null;
  periodo_apuracao_linha?: string | Date | null;
  data_vencimento_linha?: string | Date | null;
  valor_linha?: number | null;
  valor_principal_linha?: number | null;
  valor_saldo_linha?: number | null;
  dctf_id?: string | null;
  status_processamento: 'novo' | 'processado' | 'correspondido' | 'erro';
  dados_completos?: Record<string, any> | null;
  observacoes?: string | null;
  erro_sincronizacao?: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface ReceitaSincronizacao {
  id: string;
  cnpj_contribuinte?: string | null;
  periodo_inicial?: string | Date | null;
  periodo_final?: string | Date | null;
  tipo_sincronizacao: 'cliente' | 'todos' | 'debito_especifico';
  total_consultados: number;
  total_encontrados: number;
  total_atualizados: number;
  total_erros: number;
  resultado_completo?: Record<string, any> | null;
  erros?: any[] | null;
  tempo_execucao_ms?: number | null;
  status: 'em_andamento' | 'concluida' | 'erro' | 'cancelada';
  mensagem?: string | null;
  executado_por: string;
  iniciado_em?: string | Date; // Opcional pois tem DEFAULT now() no banco
  concluido_em?: string | Date | null;
  created_at: string | Date;
}

export interface ReceitaErroConsulta {
  id: string;
  sincronizacao_id?: string | null;
  cnpj_contribuinte: string;
  periodo_inicial?: string | Date | null;
  periodo_final?: string | Date | null;
  tipo_consulta: 'consulta_simples' | 'consulta_lote' | 'sincronizacao_cliente' | 'sincronizacao_todos';
  tipo_erro: 'erro_api' | 'erro_autenticacao' | 'erro_rate_limit' | 'erro_validacao' | 'erro_banco_dados' | 'erro_rede' | 'erro_desconhecido';
  mensagem_erro: string;
  detalhes_erro?: Record<string, any> | null;
  codigo_http?: number | null;
  status_http?: string | null;
  dados_requisicao?: Record<string, any> | null;
  ocorrido_em: string | Date;
  reprocessado: boolean;
  reprocessado_em?: string | Date | null;
  reprocessado_sincronizacao_id?: string | null;
  observacoes?: string | null;
  created_at: string | Date;
}

export class ReceitaPagamentoModel extends DatabaseService<ReceitaPagamento> {
  constructor() {
    super('receita_pagamentos');
  }

  /**
   * Insere um novo pagamento da Receita
   */
  async criarPagamento(pagamento: Omit<ReceitaPagamento, 'id' | 'created_at' | 'updated_at'>): Promise<ReceitaPagamento> {
    if (!process.env['SUPABASE_URL']) {
      throw new Error('Supabase não configurado');
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert(pagamento)
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao criar pagamento: ${error.message}`);
    }

    return data;
  }

  /**
   * Insere múltiplos pagamentos
   */
  async criarPagamentosEmLote(pagamentos: Array<Omit<ReceitaPagamento, 'id' | 'created_at' | 'updated_at'>>): Promise<ReceitaPagamento[]> {
    if (!process.env['SUPABASE_URL']) {
      throw new Error('Supabase não configurado');
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert(pagamentos)
      .select();

    if (error) {
      throw new Error(`Erro ao criar pagamentos em lote: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Busca pagamentos por CNPJ e competência
   */
  async buscarPorCNPJCompetencia(cnpj: string, competencia: string): Promise<ReceitaPagamento[]> {
    if (!process.env['SUPABASE_URL']) {
      return [];
    }

    const cnpjLimpo = cnpj.replace(/\D/g, '');

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('cnpj_contribuinte', cnpjLimpo)
      .eq('competencia', competencia)
      .order('data_sincronizacao', { ascending: false });

    if (error) {
      console.error('Erro ao buscar pagamentos:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Busca CNPJs que não têm registros de pagamento no período especificado
   * Útil para consultas em lote que devem processar apenas CNPJs faltantes
   */
  async buscarCNPJsFaltantes(
    periodoInicial: string,
    periodoFinal: string,
    limite?: number
  ): Promise<string[]> {
    if (!process.env['SUPABASE_URL']) {
      return [];
    }

    try {
      // Normalizar períodos aceitando 'YYYY-MM' ou 'YYYY-MM-DD'
      const normalizarPeriodo = (p: string): string => {
        if (!p) return '';
        const s = p.trim();
        if (/^\d{4}-\d{2}$/.test(s)) return s;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
        // Tentativa de parsear datas em outros formatos
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          return `${y}-${m}`;
        }
        return s;
      };

      const pInicial = normalizarPeriodo(periodoInicial);
      const pFinal = normalizarPeriodo(periodoFinal);

      // Converter períodos para Date para comparação
      const dataInicial = new Date(`${pInicial}-01`);
      // último dia do mês final
      const [anoF, mesF] = pFinal.split('-').map((v) => parseInt(v, 10));
      const ultimoDiaMesFinal = new Date(anoF, mesF, 0).getDate();
      const dataFinal = new Date(`${pFinal}-${ultimoDiaMesFinal}`);

      // Buscar todos os CNPJs únicos que têm registros de pagamento no período
      const { data: pagamentosExistentes, error: errorPagamentos } = await this.supabase
        .from(this.tableName)
        .select('cnpj_contribuinte')
        .gte('periodo_consulta_inicial', dataInicial.toISOString().split('T')[0])
        .lte('periodo_consulta_final', dataFinal.toISOString().split('T')[0]);

      if (errorPagamentos) {
        console.error('[ReceitaPagamentoModel] Erro ao buscar CNPJs com pagamentos:', errorPagamentos);
        // Em caso de erro, retornar vazio para não bloquear a consulta
        return [];
      }

      // Extrair CNPJs únicos que já têm registros
      const cnpjsComPagamentos = new Set<string>();
      if (pagamentosExistentes && pagamentosExistentes.length > 0) {
        pagamentosExistentes.forEach((p: any) => {
          if (p.cnpj_contribuinte) {
            cnpjsComPagamentos.add(p.cnpj_contribuinte);
          }
        });
      }

      // Buscar todos os CNPJs da tabela clientes
      const { data: todosClientes, error: errorClientes } = await this.supabase
        .from('clientes')
        .select('cnpj_limpo')
        .not('cnpj_limpo', 'is', null);

      if (errorClientes) {
        console.error('[ReceitaPagamentoModel] Erro ao buscar clientes:', errorClientes);
        return [];
      }

      if (!todosClientes || todosClientes.length === 0) {
        return [];
      }

      // Filtrar CNPJs que não têm registros de pagamento
      const cnpjsFaltantes: string[] = [];
      for (const cliente of todosClientes) {
        const cnpjLimpo = cliente.cnpj_limpo?.replace(/\D/g, '');
        if (cnpjLimpo && cnpjLimpo.length === 14 && !cnpjsComPagamentos.has(cnpjLimpo)) {
          cnpjsFaltantes.push(cnpjLimpo);
        }
      }

      // Aplicar limite se especificado
      if (limite && limite > 0) {
        return cnpjsFaltantes.slice(0, limite);
      }

      return cnpjsFaltantes;
    } catch (error) {
      console.error('[ReceitaPagamentoModel] Erro ao buscar CNPJs faltantes:', error);
      return [];
    }
  }

  /**
   * Busca pagamentos não correspondidos (sem dctf_id)
   */
  async buscarNaoCorrespondidos(cnpj?: string): Promise<ReceitaPagamento[]> {
    if (!process.env['SUPABASE_URL']) {
      return [];
    }

    let query = this.supabase
      .from(this.tableName)
      .select('*')
      .is('dctf_id', null)
      .order('data_sincronizacao', { ascending: false });

    if (cnpj) {
      const cnpjLimpo = cnpj.replace(/\D/g, '');
      query = query.eq('cnpj_contribuinte', cnpjLimpo);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar pagamentos não correspondidos:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Atualiza o relacionamento com DCTF
   */
  async vincularDCTF(pagamentoId: string, dctfId: string): Promise<ReceitaPagamento> {
    if (!process.env['SUPABASE_URL']) {
      throw new Error('Supabase não configurado');
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .update({
        dctf_id: dctfId,
        status_processamento: 'correspondido',
      })
      .eq('id', pagamentoId)
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao vincular DCTF: ${error.message}`);
    }

    return data;
  }

  /**
   * Busca pagamentos por número de documento
   */
  async buscarPorNumeroDocumento(numeroDocumento: string): Promise<ReceitaPagamento | null> {
    if (!process.env['SUPABASE_URL']) {
      return null;
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('numero_documento', numeroDocumento)
      .order('data_sincronizacao', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar pagamento:', error);
      return null;
    }

    return data;
  }

  /**
   * Busca pagamento por número do documento E sequencial
   * Usado para identificar registros únicos quando há desmembramentos
   */
  async buscarPorNumeroDocumentoESequencial(
    numeroDocumento: string,
    sequencial: string | null | undefined
  ): Promise<ReceitaPagamento | null> {
    if (!process.env['SUPABASE_URL']) {
      return null;
    }

    let query = this.supabase
      .from(this.tableName)
      .select('*')
      .eq('numero_documento', numeroDocumento);

    // Se sequencial for fornecido, filtrar por ele também
    // Se não, buscar apenas registros sem sequencial (null)
    if (sequencial) {
      query = query.eq('sequencial', sequencial);
    } else {
      query = query.is('sequencial', null);
    }

    const { data, error } = await query
      .order('data_sincronizacao', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar pagamento por documento e sequencial:', error);
      return null;
    }

    return data;
  }

  /**
   * Upsert: Atualiza pagamento se existir, cria se não existir
   * Verifica por numero_documento e cnpj_contribuinte
   */
  async upsertPagamento(pagamento: Omit<ReceitaPagamento, 'id' | 'created_at' | 'updated_at'>): Promise<ReceitaPagamento> {
    if (!process.env['SUPABASE_URL']) {
      throw new Error('Supabase não configurado');
    }

    // Verificar se já existe
    const existente = await this.buscarPorNumeroDocumento(pagamento.numero_documento);

    if (existente) {
      // Atualizar existente
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update({
          ...pagamento,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existente.id)
        .select()
        .single();

      if (error) {
        throw new Error(`Erro ao atualizar pagamento: ${error.message}`);
      }

      return data;
    } else {
      // Criar novo
      return await this.criarPagamento(pagamento);
    }
  }

  /**
   * Upsert em lote: Atualiza ou cria múltiplos pagamentos
   * Considera numero_documento + sequencial como chave única
   */
  async upsertPagamentosEmLote(
    pagamentos: Array<Omit<ReceitaPagamento, 'id' | 'created_at' | 'updated_at'>>,
    onProgress?: (info: { index: number; total: number; criados: number; atualizados: number; erros: number }) => void
  ): Promise<{
    criados: number;
    atualizados: number;
    erros: number;
  }> {
    let criados = 0;
    let atualizados = 0;
    let erros = 0;

    const total = pagamentos.length;
    let index = 0;

    for (const pagamento of pagamentos) {
      try {
        // Buscar por numero_documento + sequencial para identificar registro único
        const existente = await this.buscarPorNumeroDocumentoESequencial(
          pagamento.numero_documento,
          pagamento.sequencial || null
        );
        
        if (existente) {
          // Atualizar existente usando ID encontrado
          const { error: updateError } = await this.supabase
            .from(this.tableName)
            .update({
              ...pagamento,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existente.id);

          if (updateError) {
            throw new Error(`Erro ao atualizar pagamento: ${updateError.message}`);
          }
          atualizados++;
        } else {
          // Criar novo registro
          await this.criarPagamento(pagamento);
          criados++;
        }
      } catch (error) {
        console.error('Erro ao fazer upsert de pagamento:', error);
        console.error('Pagamento que causou erro:', JSON.stringify(pagamento, null, 2));
        erros++;
      }
      index++;
      if (onProgress) {
        try { onProgress({ index, total, criados, atualizados, erros }); } catch {}
      }
    }

    return { criados, atualizados, erros };
  }
}

export class ReceitaErroConsultaModel extends DatabaseService<ReceitaErroConsulta> {
  constructor() {
    super('receita_erros_consulta');
  }

  /**
   * Registra um novo erro de consulta
   */
  async registrarErro(erro: Omit<ReceitaErroConsulta, 'id' | 'ocorrido_em' | 'reprocessado' | 'created_at'>): Promise<ReceitaErroConsulta> {
    if (!process.env['SUPABASE_URL']) {
      throw new Error('Supabase não configurado');
    }

    const erroParaInserir = {
      ...erro,
      reprocessado: false,
      ocorrido_em: new Date().toISOString(),
    };

    const { data, error: insertError } = await this.supabase
      .from(this.tableName)
      .insert(erroParaInserir)
      .select()
      .single();

    if (insertError) {
      throw new Error(`Erro ao registrar erro de consulta: ${insertError.message}`);
    }

    return data;
  }

  /**
   * Registra múltiplos erros em lote
   */
  async registrarErrosEmLote(errosParaRegistrar: Array<Omit<ReceitaErroConsulta, 'id' | 'ocorrido_em' | 'reprocessado' | 'created_at'>>): Promise<{
    registrados: number;
    erros: number;
  }> {
    if (!process.env['SUPABASE_URL']) {
      throw new Error('Supabase não configurado');
    }

    let registrados = 0;
    let erros = 0;

    // Processar em chunks de 100 para evitar limites do Supabase
    const chunkSize = 100;
    for (let i = 0; i < errosParaRegistrar.length; i += chunkSize) {
      const chunk = errosParaRegistrar.slice(i, i + chunkSize);
      
      const errosParaInserir = chunk.map(erro => ({
        ...erro,
        reprocessado: false,
        ocorrido_em: new Date().toISOString(),
      }));

      try {
        const { error: insertError } = await this.supabase
          .from(this.tableName)
          .insert(errosParaInserir);

        if (insertError) {
          console.error(`[ReceitaErroConsultaModel] Erro ao registrar chunk de erros:`, insertError);
          erros += chunk.length;
        } else {
          registrados += chunk.length;
        }
      } catch (error) {
        console.error(`[ReceitaErroConsultaModel] Erro ao registrar chunk de erros:`, error);
        erros += chunk.length;
      }
    }

    return { registrados, erros };
  }

  /**
   * Busca erros por CNPJ
   */
  async buscarPorCNPJ(cnpj: string, limit: number = 100): Promise<ReceitaErroConsulta[]> {
    if (!process.env['SUPABASE_URL']) {
      return [];
    }

    const cnpjLimpo = cnpj.replace(/\D/g, '');

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('cnpj_contribuinte', cnpjLimpo)
      .order('ocorrido_em', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[ReceitaErroConsultaModel] Erro ao buscar erros por CNPJ:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Busca erros por sincronização
   */
  async buscarPorSincronizacao(sincronizacaoId: string): Promise<ReceitaErroConsulta[]> {
    if (!process.env['SUPABASE_URL']) {
      return [];
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('sincronizacao_id', sincronizacaoId)
      .order('ocorrido_em', { ascending: false });

    if (error) {
      console.error('[ReceitaErroConsultaModel] Erro ao buscar erros por sincronização:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Busca erros não reprocessados
   */
  async buscarNaoReprocessados(limit: number = 100): Promise<ReceitaErroConsulta[]> {
    if (!process.env['SUPABASE_URL']) {
      return [];
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('reprocessado', false)
      .order('ocorrido_em', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[ReceitaErroConsultaModel] Erro ao buscar erros não reprocessados:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Marca erro como reprocessado
   */
  async marcarComoReprocessado(
    erroId: string,
    reprocessadoSincronizacaoId?: string
  ): Promise<void> {
    if (!process.env['SUPABASE_URL']) {
      throw new Error('Supabase não configurado');
    }

    const updateData: any = {
      reprocessado: true,
      reprocessado_em: new Date().toISOString(),
    };

    if (reprocessadoSincronizacaoId) {
      updateData.reprocessado_sincronizacao_id = reprocessadoSincronizacaoId;
    }

    const { error } = await this.supabase
      .from(this.tableName)
      .update(updateData)
      .eq('id', erroId);

    if (error) {
      throw new Error(`Erro ao marcar erro como reprocessado: ${error.message}`);
    }
  }

  /**
   * Obtém estatísticas de erros
   */
  async obterEstatisticas(periodoInicial?: Date, periodoFinal?: Date): Promise<{
    totalErros: number;
    porTipoErro: Record<string, number>;
    porCNPJ: Array<{ cnpj: string; total: number }>;
    naoReprocessados: number;
  }> {
    if (!process.env['SUPABASE_URL']) {
      return {
        totalErros: 0,
        porTipoErro: {},
        porCNPJ: [],
        naoReprocessados: 0,
      };
    }

    let query = this.supabase
      .from(this.tableName)
      .select('tipo_erro, cnpj_contribuinte, reprocessado');

    if (periodoInicial) {
      query = query.gte('ocorrido_em', periodoInicial.toISOString());
    }
    if (periodoFinal) {
      query = query.lte('ocorrido_em', periodoFinal.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ReceitaErroConsultaModel] Erro ao obter estatísticas:', error);
      return {
        totalErros: 0,
        porTipoErro: {},
        porCNPJ: [],
        naoReprocessados: 0,
      };
    }

    const totalErros = data?.length || 0;
    const porTipoErro: Record<string, number> = {};
    const porCNPJMap = new Map<string, number>();
    let naoReprocessados = 0;

    data?.forEach(erro => {
      // Contar por tipo
      porTipoErro[erro.tipo_erro] = (porTipoErro[erro.tipo_erro] || 0) + 1;
      
      // Contar por CNPJ
      const cnpj = erro.cnpj_contribuinte;
      porCNPJMap.set(cnpj, (porCNPJMap.get(cnpj) || 0) + 1);
      
      // Contar não reprocessados
      if (!erro.reprocessado) {
        naoReprocessados++;
      }
    });

    const porCNPJ = Array.from(porCNPJMap.entries())
      .map(([cnpj, total]) => ({ cnpj, total }))
      .sort((a, b) => b.total - a.total);

    return {
      totalErros,
      porTipoErro,
      porCNPJ,
      naoReprocessados,
    };
  }
}

export class ReceitaSincronizacaoModel extends DatabaseService<ReceitaSincronizacao> {
  constructor() {
    super('receita_sincronizacoes');
  }

  /**
   * Cria um novo registro de sincronização
   */
  async criarSincronizacao(
    sincronizacao: Omit<ReceitaSincronizacao, 'id' | 'created_at'>
  ): Promise<ReceitaSincronizacao> {
    if (!process.env['SUPABASE_URL']) {
      throw new Error('Supabase não configurado');
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert(sincronizacao)
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao criar sincronização: ${error.message}`);
    }

    return data;
  }

  /**
   * Atualiza status da sincronização
   */
  async atualizarStatus(
    sincronizacaoId: string,
    status: ReceitaSincronizacao['status'],
    dados?: Partial<Omit<ReceitaSincronizacao, 'id' | 'created_at'>>
  ): Promise<ReceitaSincronizacao> {
    if (!process.env['SUPABASE_URL']) {
      throw new Error('Supabase não configurado');
    }

    const updateData: any = {
      status,
      concluido_em: status !== 'em_andamento' ? new Date().toISOString() : null,
      ...dados,
    };

    const { data, error } = await this.supabase
      .from(this.tableName)
      .update(updateData)
      .eq('id', sincronizacaoId)
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao atualizar sincronização: ${error.message}`);
    }

    return data;
  }

  /**
   * Busca histórico de sincronizações
   */
  async buscarHistorico(filtros?: {
    cnpj?: string;
    tipo?: ReceitaSincronizacao['tipo_sincronizacao'];
    status?: ReceitaSincronizacao['status'];
    limite?: number;
  }): Promise<ReceitaSincronizacao[]> {
    if (!process.env['SUPABASE_URL']) {
      return [];
    }

    let query = this.supabase
      .from(this.tableName)
      .select('*')
      .order('iniciado_em', { ascending: false });

    if (filtros?.cnpj) {
      const cnpjLimpo = filtros.cnpj.replace(/\D/g, '');
      query = query.eq('cnpj_contribuinte', cnpjLimpo);
    }

    if (filtros?.tipo) {
      query = query.eq('tipo_sincronizacao', filtros.tipo);
    }

    if (filtros?.status) {
      query = query.eq('status', filtros.status);
    }

    if (filtros?.limite) {
      query = query.limit(filtros.limite);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar histórico:', error);
      return [];
    }

    return data || [];
  }
}


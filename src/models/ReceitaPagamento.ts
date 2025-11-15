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
  async upsertPagamentosEmLote(pagamentos: Array<Omit<ReceitaPagamento, 'id' | 'created_at' | 'updated_at'>>): Promise<{
    criados: number;
    atualizados: number;
    erros: number;
  }> {
    let criados = 0;
    let atualizados = 0;
    let erros = 0;

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
    }

    return { criados, atualizados, erros };
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


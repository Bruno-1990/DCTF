/**
 * Serviço para gerenciar status de pagamento de débitos DCTF
 * Permite verificar, atualizar e consultar pagamentos de débitos
 */

import { DatabaseService } from './DatabaseService';
import { DCTF } from '../types';

export type StatusPagamento = 'pendente' | 'pago' | 'parcelado' | 'cancelado' | 'em_analise';

export interface UpdatePagamentoRequest {
  statusPagamento: StatusPagamento;
  dataPagamento?: string | Date;
  comprovantePagamento?: string;
  observacoesPagamento?: string;
  usuarioQueAtualizou?: string;
}

export interface FiltroPagamento {
  clienteId?: string;
  cnpj?: string;
  periodo?: string;
  statusPagamento?: StatusPagamento | StatusPagamento[];
  apenasPendentes?: boolean;
  saldoMinimo?: number;
}

export class PagamentoService extends DatabaseService<DCTF> {
  constructor() {
    super('dctf_declaracoes');
  }

  /**
   * Busca débitos com filtros de pagamento
   */
  async buscarDebitos(filtros: FiltroPagamento = {}): Promise<DCTF[]> {
    if (!process.env['SUPABASE_URL']) {
      return [];
    }

    let query = this.supabase
      .from(this.tableName)
      .select(`
        *,
        clientes (
          id,
          razao_social,
          cnpj_limpo
        )
      `);

    // Filtrar apenas débitos pendentes se solicitado
    if (filtros.apenasPendentes) {
      query = query.eq('status_pagamento', 'pendente')
        .or('saldo_a_pagar.gt.0,saldo_a_pagar.is.null');
    }

    // Filtrar por status de pagamento
    if (filtros.statusPagamento) {
      if (Array.isArray(filtros.statusPagamento)) {
        query = query.in('status_pagamento', filtros.statusPagamento);
      } else {
        query = query.eq('status_pagamento', filtros.statusPagamento);
      }
    }

    // Filtrar por cliente
    if (filtros.clienteId) {
      query = query.eq('cliente_id', filtros.clienteId);
    }

    // Filtrar por CNPJ
    if (filtros.cnpj) {
      const cnpjLimpo = filtros.cnpj.replace(/\D/g, '');
      query = query.eq('numero_identificacao', cnpjLimpo);
    }

    // Filtrar por período
    if (filtros.periodo) {
      query = query.eq('periodo', filtros.periodo);
    }

    // Filtrar por saldo mínimo
    if (filtros.saldoMinimo !== undefined) {
      query = query.gte('saldo_a_pagar', filtros.saldoMinimo);
    }

    // Ordenar por saldo decrescente (maiores débitos primeiro)
    query = query.order('saldo_a_pagar', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Erro ao buscar débitos: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Atualiza status de pagamento de um débito
   */
  async atualizarPagamento(
    dctfId: string,
    dados: UpdatePagamentoRequest
  ): Promise<DCTF> {
    if (!process.env['SUPABASE_URL']) {
      throw new Error('Supabase não configurado');
    }

    const updateData: any = {
      status_pagamento: dados.statusPagamento,
      data_atualizacao_pagamento: new Date().toISOString(),
    };

    if (dados.dataPagamento) {
      updateData.data_pagamento = dados.dataPagamento instanceof Date
        ? dados.dataPagamento.toISOString().split('T')[0]
        : dados.dataPagamento;
    }

    if (dados.comprovantePagamento) {
      updateData.comprovante_pagamento = dados.comprovantePagamento;
    }

    if (dados.observacoesPagamento) {
      updateData.observacoes_pagamento = dados.observacoesPagamento;
    }

    if (dados.usuarioQueAtualizou) {
      updateData.usuario_que_atualizou = dados.usuarioQueAtualizou;
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .update(updateData)
      .eq('id', dctfId)
      .select(`
        *,
        clientes (
          id,
          razao_social,
          cnpj_limpo
        )
      `)
      .single();

    if (error) {
      throw new Error(`Erro ao atualizar pagamento: ${error.message}`);
    }

    return data;
  }

  /**
   * Atualiza pagamento em lote (múltiplos débitos)
   */
  async atualizarPagamentoEmLote(
    dctfIds: string[],
    dados: UpdatePagamentoRequest
  ): Promise<number> {
    if (!process.env['SUPABASE_URL']) {
      throw new Error('Supabase não configurado');
    }

    const updateData: any = {
      status_pagamento: dados.statusPagamento,
      data_atualizacao_pagamento: new Date().toISOString(),
    };

    if (dados.dataPagamento) {
      updateData.data_pagamento = dados.dataPagamento instanceof Date
        ? dados.dataPagamento.toISOString().split('T')[0]
        : dados.dataPagamento;
    }

    if (dados.comprovantePagamento) {
      updateData.comprovante_pagamento = dados.comprovantePagamento;
    }

    if (dados.observacoesPagamento) {
      updateData.observacoes_pagamento = dados.observacoesPagamento;
    }

    if (dados.usuarioQueAtualizou) {
      updateData.usuario_que_atualizou = dados.usuarioQueAtualizou;
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .update(updateData)
      .in('id', dctfIds)
      .select('id');

    if (error) {
      throw new Error(`Erro ao atualizar pagamentos em lote: ${error.message}`);
    }

    return data?.length || 0;
  }

  /**
   * Busca estatísticas de pagamento
   */
  async obterEstatisticas(): Promise<{
    total: number;
    pendentes: number;
    pagos: number;
    parcelados: number;
    valorTotalPendente: number;
    valorTotalPago: number;
  }> {
    if (!process.env['SUPABASE_URL']) {
      return {
        total: 0,
        pendentes: 0,
        pagos: 0,
        parcelados: 0,
        valorTotalPendente: 0,
        valorTotalPago: 0,
      };
    }

    // Buscar todas as declarações com saldo
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('status_pagamento, saldo_a_pagar')
      .or('saldo_a_pagar.gt.0,saldo_a_pagar.is.null');

    if (error) {
      throw new Error(`Erro ao obter estatísticas: ${error.message}`);
    }

    const stats = {
      total: 0,
      pendentes: 0,
      pagos: 0,
      parcelados: 0,
      valorTotalPendente: 0,
      valorTotalPago: 0,
    };

    data?.forEach((item) => {
      const saldo = Number(item.saldo_a_pagar) || 0;
      const status = (item.status_pagamento as StatusPagamento) || 'pendente';

      stats.total++;

      if (status === 'pendente') {
        stats.pendentes++;
        stats.valorTotalPendente += saldo;
      } else if (status === 'pago') {
        stats.pagos++;
        stats.valorTotalPago += saldo;
      } else if (status === 'parcelado') {
        stats.parcelados++;
        stats.valorTotalPendente += saldo;
      }
    });

    return stats;
  }
}


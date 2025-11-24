/**
 * Serviço base para operações de banco de dados
 * Implementa padrões comuns para CRUD e operações de banco
 * MIGRADO PARA MYSQL - Agora usa MySQLDatabaseService internamente
 */

import { MySQLDatabaseService } from './MySQLDatabaseService';
import { ApiResponse } from '../types';
import { createSupabaseAdapter } from './SupabaseAdapter';

// Tipo do adapter para uso nos models
export type SupabaseAdapterType = ReturnType<typeof createSupabaseAdapter>;

export abstract class DatabaseService<T> extends MySQLDatabaseService<T> {
  /**
   * Mantido para compatibilidade - agora herda de MySQLDatabaseService
   * Todas as operações CRUD agora usam MySQL em vez de Supabase
   * 
   * Métodos disponíveis (herdados de MySQLDatabaseService):
   * - findAll(): Promise<ApiResponse<T[]>>
   * - findById(id: string | number): Promise<ApiResponse<T>>
   * - create(record: Partial<T>): Promise<ApiResponse<T>>
   * - update(id: string | number, updates: Partial<T>): Promise<ApiResponse<T>>
   * - delete(id: string | number): Promise<ApiResponse<boolean>>
   * - findBy(filters: Record<string, any>): Promise<ApiResponse<T[]>>
   * - count(filters?: Record<string, any>): Promise<ApiResponse<number>>
   * - executeCustomQuery<TResult>(query: string, params?: any[]): Promise<ApiResponse<TResult[]>>
   * - runTransaction<TResult>(callback: (connection: PoolConnection) => Promise<TResult>): Promise<ApiResponse<TResult>>
   */

  // Adapter para compatibilidade com código que usa this.supabase
  protected readonly supabase: SupabaseAdapterType;

  constructor(tableName: string) {
    super(tableName);
    // Inicializar adapter no construtor para garantir tipagem correta
    const adapter = createSupabaseAdapter();
    if (!adapter || !adapter.from) {
      console.error('[DatabaseService] ERRO: createSupabaseAdapter não retornou um adapter válido!');
      console.error('[DatabaseService] Adapter recebido:', adapter);
    }
    this.supabase = adapter;
    console.log('[DatabaseService] Adapter inicializado para tabela:', tableName);
  }

  /**
   * Helper para compatibilidade - permite executar queries SQL diretamente
   * Use este método para substituir chamadas this.supabase.from().select()
   */
  protected async querySQL<TResult = T>(
    query: string,
    params?: any[]
  ): Promise<ApiResponse<TResult[]>> {
    return this.executeCustomQuery<TResult>(query, params);
  }

  /**
   * Helper para buscar com filtro simples (substitui this.supabase.from().select().eq())
   */
  protected async queryWithFilter(
    filters: Record<string, any>,
    orderBy?: { column: string; ascending?: boolean },
    limit?: number
  ): Promise<ApiResponse<T[]>> {
    try {
      let query = `SELECT * FROM \`${this.tableName}\``;
      const values: any[] = [];

      // Adicionar WHERE
      if (Object.keys(filters).length > 0) {
        const conditions = Object.keys(filters)
          .map((key, index) => {
            values.push(filters[key]);
            return `\`${key}\` = ?`;
          })
          .join(' AND ');
        query += ` WHERE ${conditions}`;
      }

      // Adicionar ORDER BY
      if (orderBy) {
        query += ` ORDER BY \`${orderBy.column}\` ${orderBy.ascending !== false ? 'ASC' : 'DESC'}`;
      }

      // Adicionar LIMIT
      if (limit) {
        const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
        query += ` LIMIT ${safeLimit}`;
      }

      return await this.executeCustomQuery<T>(query, values.length > 0 ? values : undefined);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }
}

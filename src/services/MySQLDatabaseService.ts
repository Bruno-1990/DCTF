/**
 * Serviço base para operações de banco de dados MySQL
 * Implementa padrões comuns para CRUD e operações de banco
 */

import { mysqlPool, executeQuery, executeTransaction } from '../config/mysql';
import { ApiResponse } from '../types';
import { PoolConnection } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';

export abstract class MySQLDatabaseService<T> {
  protected tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  /**
   * Buscar todos os registros
   */
  async findAll(): Promise<ApiResponse<T[]>> {
    try {
      const query = `SELECT * FROM \`${this.tableName}\``;
      const data = await executeQuery<T>(query);

      return {
        success: true,
        data: data || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Buscar registro por ID
   */
  async findById(id: string | number): Promise<ApiResponse<T>> {
    try {
      const query = `SELECT * FROM \`${this.tableName}\` WHERE id = ? LIMIT 1`;
      const results = await executeQuery<T>(query, [id]);

      if (results.length === 0) {
        return {
          success: false,
          error: 'Registro não encontrado',
        };
      }

      return {
        success: true,
        data: results[0],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Criar novo registro
   */
  async create(record: Partial<T>): Promise<ApiResponse<T>> {
    try {
      // Para este projeto, a grande maioria das tabelas usa UUID string em `id`.
      // Se `id` não vier no record, geramos automaticamente.
      const mutable: any = { ...(record as any) };
      if (mutable.id === undefined || mutable.id === null || String(mutable.id).trim() === '') {
        mutable.id = uuidv4();
      }

      // Remover campos undefined do objeto
      // O MySQL não aceita undefined, apenas null ou omitir o campo
      const cleaned: Record<string, any> = {};
      Object.keys(mutable).forEach(key => {
        const value = mutable[key];
        if (value !== undefined) {
          cleaned[key] = value;
        }
      });

      const keys = Object.keys(cleaned);
      if (keys.length === 0) {
        return { success: false, error: 'Registro vazio: nenhum campo para inserir' };
      }

      const fields = keys.map((k) => `\`${k}\``).join(', ');
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map((k) => cleaned[k]);

      const query = `INSERT INTO \`${this.tableName}\` (${fields}) VALUES (${placeholders})`;
      
      const connection = await mysqlPool.getConnection();
      try {
        await connection.execute(query, values);

        // Buscar o registro criado pelo ID (UUID) ou fallback para insertId se aplicável
        const createdId = mutable.id;
        const selectQuery = `SELECT * FROM \`${this.tableName}\` WHERE id = ? LIMIT 1`;
        const [rows] = await connection.execute(selectQuery, [createdId]);
        const data = (rows as any[])[0] as T;

        return {
          success: true,
          data,
        };
      } finally {
        connection.release();
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Atualizar registro
   */
  async update(id: string | number, updates: Partial<T>): Promise<ApiResponse<T>> {
    try {
      // Remover campos undefined do objeto updates
      // O MySQL não aceita undefined, apenas null ou omitir o campo
      const cleanedUpdates: Record<string, any> = {};
      Object.keys(updates).forEach(key => {
        const value = (updates as any)[key];
        if (value !== undefined) {
          cleanedUpdates[key] = value;
        }
      });

      if (Object.keys(cleanedUpdates).length === 0) {
        return {
          success: false,
          error: 'Nenhum campo para atualizar',
        };
      }

      const fields = Object.keys(cleanedUpdates)
        .map(key => `\`${key}\` = ?`)
        .join(', ');
      const values = [...Object.values(cleanedUpdates), id];

      const query = `UPDATE \`${this.tableName}\` SET ${fields} WHERE id = ?`;
      
      const connection = await mysqlPool.getConnection();
      try {
        await connection.execute(query, values);
        
        // Buscar o registro atualizado
        const selectQuery = `SELECT * FROM \`${this.tableName}\` WHERE id = ?`;
        const [rows] = await connection.execute(selectQuery, [id]);
        
        if ((rows as any[]).length === 0) {
          return {
            success: false,
            error: 'Registro não encontrado',
          };
        }

        const data = (rows as any[])[0] as T;

        return {
          success: true,
          data,
        };
      } finally {
        connection.release();
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Deletar registro
   */
  async delete(id: string | number): Promise<ApiResponse<boolean>> {
    try {
      const query = `DELETE FROM \`${this.tableName}\` WHERE id = ?`;
      await executeQuery(query, [id]);

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Buscar com filtros personalizados
   */
  async findBy(filters: Record<string, any>): Promise<ApiResponse<T[]>> {
    try {
      // Remover campos undefined dos filtros
      const cleanedFilters: Record<string, any> = {};
      Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value !== undefined) {
          cleanedFilters[key] = value;
        }
      });

      if (Object.keys(cleanedFilters).length === 0) {
        // Se não há filtros válidos, retornar todos os registros
        return this.findAll();
      }

      const conditions = Object.keys(cleanedFilters)
        .map(key => `\`${key}\` = ?`)
        .join(' AND ');
      const values = Object.values(cleanedFilters);

      const query = `SELECT * FROM \`${this.tableName}\` WHERE ${conditions}`;
      const data = await executeQuery<T>(query, values);

      return {
        success: true,
        data: data || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Contar registros
   */
  async count(filters?: Record<string, any>): Promise<ApiResponse<number>> {
    try {
      let query = `SELECT COUNT(*) as total FROM ${this.tableName}`;
      let values: any[] = [];

      if (filters && Object.keys(filters).length > 0) {
        const conditions = Object.keys(filters)
          .map(key => `${key} = ?`)
          .join(' AND ');
        values = Object.values(filters);
        query += ` WHERE ${conditions}`;
      }

      const results = await executeQuery<{ total: number }>(query, values);
      const count = results[0]?.total || 0;

      return {
        success: true,
        data: count,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Executar query customizada
   */
  async executeCustomQuery<TResult = any>(
    query: string,
    params?: any[]
  ): Promise<ApiResponse<TResult[]>> {
    try {
      const data = await executeQuery<TResult>(query, params);
      return {
        success: true,
        data: data || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Executar transação
   */
  async runTransaction<TResult>(
    callback: (connection: PoolConnection) => Promise<TResult>
  ): Promise<ApiResponse<TResult>> {
    try {
      const result = await executeTransaction(callback);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }
}


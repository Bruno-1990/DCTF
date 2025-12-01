/**
 * Adapter para compatibilidade com código que usa Supabase
 * Converte chamadas do Supabase para MySQL
 */

import { executeQuery, getConnection } from '../config/mysql';
import { ApiResponse } from '../types';

export interface SupabaseQueryBuilder {
  from(table: string): SupabaseQueryBuilder;
  select(columns?: string, options?: { count?: 'exact'; head?: boolean }): SupabaseQueryBuilder;
  eq(column: string, value: any): SupabaseQueryBuilder;
  neq(column: string, value: any): SupabaseQueryBuilder;
  gt(column: string, value: any): SupabaseQueryBuilder;
  gte(column: string, value: any): SupabaseQueryBuilder;
  lt(column: string, value: any): SupabaseQueryBuilder;
  lte(column: string, value: any): SupabaseQueryBuilder;
  in(column: string, values: any[]): SupabaseQueryBuilder;
  like(column: string, pattern: string): SupabaseQueryBuilder;
  ilike(column: string, pattern: string): SupabaseQueryBuilder;
  is(column: string, value: any): SupabaseQueryBuilder;
  not(column: string, operator: string, value: any): SupabaseQueryBuilder;
  or(condition: string): SupabaseQueryBuilder;
  order(column: string, options?: { ascending?: boolean }): SupabaseQueryBuilder;
  limit(count: number): SupabaseQueryBuilder;
  range(from: number, to: number): SupabaseQueryBuilder;
  upsert(data: any, options?: { onConflict?: string }): SupabaseQueryBuilder;
  single(): SupabaseQueryBuilder;
  maybeSingle(): SupabaseQueryBuilder;
  insert(data: any): SupabaseQueryBuilder;
  update(data: any): SupabaseQueryBuilder;
  delete(): SupabaseQueryBuilder;
  execute(): Promise<{ data: any; error: any; count?: number }>;
}

class QueryBuilder implements SupabaseQueryBuilder {
  private table: string = '';
  private columns: string = '*';
  private whereConditions: Array<{ type: string; column: string; value: any; operator?: string }> = [];
  private orderBy?: { column: string; ascending: boolean };
  private limitCount?: number;
  private offsetCount?: number;
  private isSingle: boolean = false;
  private isCount: boolean = false;
  private isHead: boolean = false;
  private insertData?: any;
  private updateData?: any;
  private isDelete: boolean = false;
  private isUpsert: boolean = false;
  private upsertConflictColumn?: string;

  // Tornar o QueryBuilder "awaitable" (thenable)
  then<TResult1 = { data: any; error: any; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  from(table: string): SupabaseQueryBuilder {
    this.table = table;
    return this;
  }

  select(columns?: string, options?: { count?: 'exact'; head?: boolean }): SupabaseQueryBuilder {
    this.columns = columns || '*';
    if (options?.count === 'exact') {
      this.isCount = true;
      this.columns = 'COUNT(*) as count';
    }
    if (options?.head) {
      this.isHead = true;
    }
    return this;
  }

  eq(column: string, value: any): SupabaseQueryBuilder {
    this.whereConditions.push({ type: 'eq', column, value });
    return this;
  }

  neq(column: string, value: any): SupabaseQueryBuilder {
    this.whereConditions.push({ type: 'neq', column, value });
    return this;
  }

  gt(column: string, value: any): SupabaseQueryBuilder {
    this.whereConditions.push({ type: 'gt', column, value });
    return this;
  }

  gte(column: string, value: any): SupabaseQueryBuilder {
    this.whereConditions.push({ type: 'gte', column, value });
    return this;
  }

  lt(column: string, value: any): SupabaseQueryBuilder {
    this.whereConditions.push({ type: 'lt', column, value });
    return this;
  }

  lte(column: string, value: any): SupabaseQueryBuilder {
    this.whereConditions.push({ type: 'lte', column, value });
    return this;
  }

  in(column: string, values: any[]): SupabaseQueryBuilder {
    this.whereConditions.push({ type: 'in', column, value: values });
    return this;
  }

  like(column: string, pattern: string): SupabaseQueryBuilder {
    this.whereConditions.push({ type: 'like', column, value: pattern });
    return this;
  }

  ilike(column: string, pattern: string): SupabaseQueryBuilder {
    this.whereConditions.push({ type: 'ilike', column, value: pattern });
    return this;
  }

  is(column: string, value: any): SupabaseQueryBuilder {
    this.whereConditions.push({ type: 'is', column, value });
    return this;
  }

  not(column: string, operator: string, value: any): SupabaseQueryBuilder {
    if (operator === 'is' && value === null) {
      this.whereConditions.push({ type: 'is_not_null', column, value: null });
    } else if (operator === 'eq') {
      this.whereConditions.push({ type: 'neq', column, value });
    }
    return this;
  }

  or(condition: string): SupabaseQueryBuilder {
    // Parse conditions like "periodo.eq.2024-01,periodo.eq.01/2024"
    // Adiciona condições OR ao invés de AND
    const parts = condition.split(',');
    const orConditions: Array<{ type: string; column: string; value: any }> = [];
    
    parts.forEach(part => {
      const [col, op, ...valParts] = part.split('.');
      const val = valParts.join('.'); // Rejoin in case value contains dots
      
      if (op === 'eq') {
        orConditions.push({ type: 'eq', column: col, value: val });
      } else if (op === 'gt') {
        orConditions.push({ type: 'gt', column: col, value: val });
      } else if (op === 'gte') {
        orConditions.push({ type: 'gte', column: col, value: val });
      } else if (op === 'lt') {
        orConditions.push({ type: 'lt', column: col, value: val });
      } else if (op === 'lte') {
        orConditions.push({ type: 'lte', column: col, value: val });
      } else if (op === 'is' && val === 'null') {
        orConditions.push({ type: 'is', column: col, value: null });
      }
    });
    
    // Marcar como condições OR
    this.whereConditions.push({ type: 'or_group', column: '', value: orConditions });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): SupabaseQueryBuilder {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number): SupabaseQueryBuilder {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number): SupabaseQueryBuilder {
    // MySQL não tem OFFSET direto no LIMIT, então calculamos
    const offset = from;
    const limit = to - from + 1;
    this.limitCount = limit;
    // Adicionar offset será feito no executeSelect
    (this as any).offsetCount = offset;
    return this;
  }

  upsert(data: any, options?: { onConflict?: string }): SupabaseQueryBuilder {
    // Para MySQL, upsert é INSERT ... ON DUPLICATE KEY UPDATE
    this.insertData = data;
    (this as any).isUpsert = true;
    (this as any).upsertConflictColumn = options?.onConflict;
    return this;
  }

  single(): SupabaseQueryBuilder {
    this.isSingle = true;
    this.limitCount = 1;
    return this;
  }

  maybeSingle(): SupabaseQueryBuilder {
    this.isSingle = true;
    this.limitCount = 1;
    return this;
  }

  insert(data: any): SupabaseQueryBuilder {
    this.insertData = data;
    return this;
  }

  update(data: any): SupabaseQueryBuilder {
    this.updateData = data;
    return this;
  }

  delete(): SupabaseQueryBuilder {
    this.isDelete = true;
    return this;
  }

  async execute(): Promise<{ data: any; error: any; count?: number }> {
    try {
      if (this.isUpsert || this.insertData) {
        return await this.executeInsert();
      }
      if (this.updateData) {
        return await this.executeUpdate();
      }
      if (this.isDelete) {
        return await this.executeDelete();
      }
      return await this.executeSelect();
    } catch (error: any) {
      return {
        data: null,
        error: {
          message: error.message || 'Erro desconhecido',
          code: error.code,
        },
      };
    }
  }

  private async executeSelect(): Promise<{ data: any; error: any; count?: number }> {
    let query = `SELECT ${this.columns} FROM \`${this.table}\``;
    const params: any[] = [];

    // Build WHERE clause
    if (this.whereConditions.length > 0) {
      const conditions: string[] = [];
      const orGroups: string[] = [];
      
      this.whereConditions.forEach(cond => {
        if (cond.type === 'or_group') {
          // Processar grupo de condições OR
          const orConditions: string[] = [];
          (cond.value as any[]).forEach(orCond => {
            if (orCond.type === 'eq') {
              orConditions.push(`\`${orCond.column}\` = ?`);
              params.push(orCond.value);
            } else if (orCond.type === 'gte') {
              orConditions.push(`\`${orCond.column}\` >= ?`);
              params.push(orCond.value);
            } else if (orCond.type === 'is' && orCond.value === null) {
              orConditions.push(`\`${orCond.column}\` IS NULL`);
            }
            // Adicionar mais tipos conforme necessário
          });
          if (orConditions.length > 0) {
            orGroups.push(`(${orConditions.join(' OR ')})`);
          }
        } else if (cond.type === 'eq') {
          conditions.push(`\`${cond.column}\` = ?`);
          params.push(cond.value);
        } else if (cond.type === 'neq') {
          conditions.push(`\`${cond.column}\` != ?`);
          params.push(cond.value);
        } else if (cond.type === 'gt') {
          conditions.push(`\`${cond.column}\` > ?`);
          params.push(cond.value);
        } else if (cond.type === 'gte') {
          conditions.push(`\`${cond.column}\` >= ?`);
          params.push(cond.value);
        } else if (cond.type === 'lt') {
          conditions.push(`\`${cond.column}\` < ?`);
          params.push(cond.value);
        } else if (cond.type === 'lte') {
          conditions.push(`\`${cond.column}\` <= ?`);
          params.push(cond.value);
        } else if (cond.type === 'in') {
          const values = cond.value as any[];
          if (values.length === 0) {
            // Se a lista está vazia, adicionar condição que sempre retorna false
            conditions.push('1 = 0'); // Sempre falso, não retorna nenhum resultado
          } else {
            const placeholders = values.map(() => '?').join(',');
            conditions.push(`\`${cond.column}\` IN (${placeholders})`);
            params.push(...values);
          }
        } else if (cond.type === 'like') {
          conditions.push(`\`${cond.column}\` LIKE ?`);
          params.push(cond.value);
        } else if (cond.type === 'ilike') {
          conditions.push(`LOWER(\`${cond.column}\`) LIKE LOWER(?)`);
          params.push(cond.value);
        } else if (cond.type === 'is') {
          if (cond.value === null) {
            conditions.push(`\`${cond.column}\` IS NULL`);
          } else {
            conditions.push(`\`${cond.column}\` IS ?`);
            params.push(cond.value);
          }
        } else if (cond.type === 'is_not_null') {
          conditions.push(`\`${cond.column}\` IS NOT NULL`);
        }
      });
      
      const allConditions = [...conditions, ...orGroups];
      if (allConditions.length > 0) {
        query += ` WHERE ${allConditions.join(' AND ')}`;
      }
    }

    // ORDER BY
    if (this.orderBy) {
      query += ` ORDER BY \`${this.orderBy.column}\` ${this.orderBy.ascending ? 'ASC' : 'DESC'}`;
    }

    // OFFSET e LIMIT
    if (this.offsetCount !== undefined && this.limitCount && !this.isCount) {
      query += ` LIMIT ${this.limitCount} OFFSET ${this.offsetCount}`;
    } else if (this.limitCount && !this.isCount) {
      query += ` LIMIT ${this.limitCount}`;
    }

    const results = await executeQuery(query, params.length > 0 ? params : undefined);

    if (this.isCount) {
      return {
        data: null,
        error: null,
        count: results[0]?.count || 0,
      };
    }

    if (this.isHead) {
      return { data: null, error: null };
    }

    return {
      data: this.isSingle ? (results[0] || null) : results,
      error: null,
    };
  }

  private async executeInsert(): Promise<{ data: any; error: any }> {
    const fields = Object.keys(this.insertData).join(', ');
    const placeholders = Object.keys(this.insertData).map(() => '?').join(', ');
    const values = Object.values(this.insertData);

    let query: string;
    if (this.isUpsert) {
      // UPSERT: INSERT ... ON DUPLICATE KEY UPDATE
      const updateFields = Object.keys(this.insertData)
        .filter(key => key !== (this.upsertConflictColumn || 'id'))
        .map(key => `\`${key}\` = VALUES(\`${key}\`)`)
        .join(', ');
      
      // Para ON DUPLICATE KEY UPDATE, MySQL usa a PRIMARY KEY ou UNIQUE KEY automaticamente
      // Não precisamos especificar qual coluna, apenas os campos a atualizar
      // Se não há campos para atualizar (todos foram filtrados), atualizar pelo menos updated_at se existir
      let finalUpdateFields = updateFields;
      if (!finalUpdateFields || finalUpdateFields.trim() === '') {
        // Se não há campos para atualizar, verificar se existe updated_at
        if (this.insertData.updated_at !== undefined) {
          finalUpdateFields = '`updated_at` = VALUES(`updated_at`)';
        } else {
          // Fallback: atualizar um campo que não seja a chave primária
          const nonKeyFields = Object.keys(this.insertData).filter(key => {
            const conflictKey = this.upsertConflictColumn || 'id';
            return key !== conflictKey;
          });
          if (nonKeyFields.length > 0) {
            finalUpdateFields = `\`${nonKeyFields[0]}\` = VALUES(\`${nonKeyFields[0]}\`)`;
          } else {
            // Último recurso: atualizar a própria chave (não faz nada, mas evita erro SQL)
            const conflictKey = this.upsertConflictColumn || 'id';
            finalUpdateFields = `\`${conflictKey}\` = \`${conflictKey}\``;
          }
        }
      }
      
      query = `INSERT INTO \`${this.table}\` (${fields}) VALUES (${placeholders}) 
               ON DUPLICATE KEY UPDATE ${finalUpdateFields}`;
    } else {
      query = `INSERT INTO \`${this.table}\` (${fields}) VALUES (${placeholders})`;
    }
    
    const connection = await getConnection();

    try {
      await connection.execute(query, values);
      
      // Buscar o registro inserido/atualizado
      let inserted;
      const conflictColumn = this.upsertConflictColumn || 'id';
      
      if (this.insertData[conflictColumn]) {
        // Usar a coluna de conflito (ou 'id' por padrão) para buscar o registro
        const [result] = await connection.execute(
          `SELECT * FROM \`${this.table}\` WHERE \`${conflictColumn}\` = ?`,
          [this.insertData[conflictColumn]]
        );
        inserted = (result as any[])[0];
      } else if (this.insertData.id) {
        // Fallback para 'id' se existir
        const [result] = await connection.execute(
          `SELECT * FROM \`${this.table}\` WHERE id = ?`,
          [this.insertData.id]
        );
        inserted = (result as any[])[0];
      } else {
        // Último fallback: usar LAST_INSERT_ID() (só funciona se a tabela tiver AUTO_INCREMENT)
        try {
          const [result] = await connection.execute(
            `SELECT * FROM \`${this.table}\` WHERE id = LAST_INSERT_ID()`
          );
          inserted = (result as any[])[0];
        } catch (err) {
          // Se falhar, tentar buscar usando a coluna de conflito se disponível
          if (conflictColumn !== 'id' && this.insertData[conflictColumn]) {
            const [result] = await connection.execute(
              `SELECT * FROM \`${this.table}\` WHERE \`${conflictColumn}\` = ?`,
              [this.insertData[conflictColumn]]
            );
            inserted = (result as any[])[0];
          }
        }
      }

      return {
        data: this.isSingle ? inserted : (inserted ? [inserted] : []),
        error: null,
      };
    } finally {
      connection.release();
    }
  }

  private async executeUpdate(): Promise<{ data: any; error: any }> {
    const fields = Object.keys(this.updateData)
      .map(key => `\`${key}\` = ?`)
      .join(', ');
    const values = [...Object.values(this.updateData)];

    // Add WHERE conditions
    if (this.whereConditions.length > 0) {
      const conditions: string[] = [];
      const whereValues: any[] = [];
      this.whereConditions.forEach(cond => {
        if (cond.type === 'eq') {
          conditions.push(`\`${cond.column}\` = ?`);
          whereValues.push(cond.value);
        }
      });
      const query = `UPDATE \`${this.table}\` SET ${fields} WHERE ${conditions.join(' AND ')}`;
      const connection = await getConnection();

      try {
        await connection.execute(query, [...values, ...whereValues]);
        
        // Se tem select, buscar o registro atualizado
        if (this.columns !== '*' && !this.isCount && !this.isHead) {
          const selectQuery = `SELECT ${this.columns} FROM \`${this.table}\` WHERE ${conditions.join(' AND ')}`;
          const [result] = await connection.execute(selectQuery, whereValues);
          const updated = (result as any[])[0];
          return {
            data: this.isSingle ? updated : (updated ? [updated] : []),
            error: null,
          };
        }
        
        return { data: null, error: null };
      } finally {
        connection.release();
      }
    }

    return { data: null, error: { message: 'UPDATE requires WHERE conditions' } };
  }

  private async executeDelete(): Promise<{ data: any; error: any }> {
    const query = `DELETE FROM \`${this.table}\``;
    const params: any[] = [];

    if (this.whereConditions.length > 0) {
      const conditions: string[] = [];
      this.whereConditions.forEach(cond => {
        if (cond.type === 'eq') {
          conditions.push(`\`${cond.column}\` = ?`);
          params.push(cond.value);
        } else if (cond.type === 'neq') {
          conditions.push(`\`${cond.column}\` != ?`);
          params.push(cond.value);
        } else if (cond.type === 'gt') {
          conditions.push(`\`${cond.column}\` > ?`);
          params.push(cond.value);
        } else if (cond.type === 'gte') {
          conditions.push(`\`${cond.column}\` >= ?`);
          params.push(cond.value);
        } else if (cond.type === 'lt') {
          conditions.push(`\`${cond.column}\` < ?`);
          params.push(cond.value);
        } else if (cond.type === 'lte') {
          conditions.push(`\`${cond.column}\` <= ?`);
          params.push(cond.value);
        } else if (cond.type === 'in') {
          const values = cond.value as any[];
          if (values.length === 0) {
            // Se a lista está vazia, adicionar condição que sempre retorna false
            conditions.push('1 = 0'); // Sempre falso, não retorna nenhum resultado
          } else {
            const placeholders = values.map(() => '?').join(', ');
            conditions.push(`\`${cond.column}\` IN (${placeholders})`);
            params.push(...values);
          }
        } else if (cond.type === 'is') {
          if (cond.value === null) {
            conditions.push(`\`${cond.column}\` IS NULL`);
          } else {
            conditions.push(`\`${cond.column}\` IS ?`);
            params.push(cond.value);
          }
        }
      });
      
      if (conditions.length > 0) {
        const fullQuery = `${query} WHERE ${conditions.join(' AND ')}`;
        const connection = await getConnection();

        try {
          await connection.execute(fullQuery, params);
          return { data: null, error: null };
        } catch (err: any) {
          return { data: null, error: { message: err.message, code: err.code } };
        } finally {
          connection.release();
        }
      }
    }

    return { data: null, error: { message: 'DELETE requires WHERE conditions' } };
  }
}

/**
 * Tipo do adapter Supabase
 */
export type SupabaseAdapter = ReturnType<typeof createSupabaseAdapter>;

/**
 * Cria um adapter compatível com Supabase para uso em models
 */
export function createSupabaseAdapter() {
  const adapter = {
    from: (table: string) => {
      const qb = new QueryBuilder();
      return qb.from(table);
    },
    rpc: (functionName: string, params?: Record<string, any>) => {
      // Para MySQL, RPC pode ser implementado como stored procedures
      // Por enquanto, retornamos um objeto que simula a interface
      console.warn(`[SupabaseAdapter] RPC '${functionName}' chamado. Implemente como stored procedure MySQL ou query SQL direta.`);
      return Promise.resolve({
        data: null,
        error: { message: `RPC '${functionName}' não implementado para MySQL. Use queries SQL diretas.` },
        count: 0,
      });
    },
    storage: {
      getBucket: async (bucket: string) => {
        console.warn(`[SupabaseAdapter] Storage getBucket não implementado para MySQL. Use sistema de arquivos local.`);
        return { data: null, error: { message: 'Storage não implementado para MySQL' } };
      },
      createBucket: async (bucket: string, options?: any) => {
        console.warn(`[SupabaseAdapter] Storage createBucket não implementado para MySQL. Use sistema de arquivos local.`);
        return { data: null, error: { message: 'Storage não implementado para MySQL' } };
      },
      from: (bucket: string) => ({
        upload: async (path: string, file: any, options?: any) => {
          console.warn(`[SupabaseAdapter] Storage upload não implementado para MySQL. Use sistema de arquivos local.`);
          return { data: null, error: { message: 'Storage não implementado para MySQL' } };
        },
        createSignedUrl: async (path: string, expiresIn: number) => {
          console.warn(`[SupabaseAdapter] Storage signed URL não implementado para MySQL.`);
          return { data: null, error: { message: 'Storage não implementado para MySQL' } };
        },
      }),
    },
    auth: {
      signInWithPassword: async (credentials: any) => {
        console.warn(`[SupabaseAdapter] Auth não implementado para MySQL. Implemente autenticação própria.`);
        return { data: null, error: { message: 'Auth não implementado para MySQL' } };
      },
      signUp: async (credentials: any) => {
        return { data: null, error: { message: 'Auth não implementado para MySQL' } };
      },
      signOut: async () => {
        return { error: { message: 'Auth não implementado para MySQL' } };
      },
      getUser: async () => {
        return { data: { user: null }, error: { message: 'Auth não implementado para MySQL' } };
      },
      updateUser: async (updates: any) => {
        return { data: null, error: { message: 'Auth não implementado para MySQL' } };
      },
      resetPasswordForEmail: async (email: string, options?: any) => {
        return { error: { message: 'Auth não implementado para MySQL' } };
      },
    },
  };
  
  // Garantir que o adapter é retornado
  return adapter;
}


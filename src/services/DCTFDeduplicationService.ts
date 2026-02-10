/**
 * Serviço para detectar e remover duplicados em dctf_declaracoes
 * Mantém sempre o registro mais recente quando houver duplicados
 */

import { getConnection } from '../config/mysql';
import { ApiResponse } from '../types';

interface DuplicateGroup {
  cnpj: string;
  periodo_apuracao: string;
  data_transmissao: string;
  situacao?: string;
  tipo_ni?: string;
  categoria?: string;
  origem?: string;
  tipo?: string;
  debito_apurado?: number;
  saldo_a_pagar?: number;
  count: number;
  ids: string[];
  oldest_id: string;
  newest_id: string;
}

interface DeduplicationResult {
  totalDuplicates: number;
  groupsProcessed: number;
  recordsRemoved: number;
  errors: number;
  details: Array<{
    cnpj: string;
    periodo: string;
    duplicatesFound: number;
    kept: string;
    removed: string[];
  }>;
}

export class DCTFDeduplicationService {
  /**
   * Detecta registros duplicados na tabela dctf_declaracoes
   * Considera duplicados: registros com TODOS os dados iguais (exceto id e timestamps)
   */
  async detectDuplicates(): Promise<ApiResponse<DuplicateGroup[]>> {
    const connection = await getConnection();
    
    try {
      console.log('[Deduplication] Detectando duplicados...');
      
      // Query para encontrar grupos de duplicados
      // Consideramos duplicados: TODOS os campos de dados iguais (não apenas CNPJ/período/data)
      const query = `
        SELECT 
          cnpj,
          periodo_apuracao,
          data_transmissao,
          situacao,
          tipo_ni,
          categoria,
          origem,
          tipo,
          debito_apurado,
          saldo_a_pagar,
          COUNT(*) as count,
          GROUP_CONCAT(id ORDER BY created_at ASC) as ids,
          MIN(id) as oldest_id,
          MAX(id) as newest_id,
          MIN(created_at) as first_created,
          MAX(updated_at) as last_updated
        FROM dctf_declaracoes
        WHERE cnpj IS NOT NULL 
          AND periodo_apuracao IS NOT NULL
        GROUP BY 
          cnpj,
          periodo_apuracao,
          data_transmissao,
          situacao,
          tipo_ni,
          categoria,
          origem,
          tipo,
          debito_apurado,
          saldo_a_pagar
        HAVING COUNT(*) > 1
        ORDER BY count DESC, cnpj, periodo_apuracao
      `;
      
      const [rows] = await connection.execute(query);
      const duplicates = rows as any[];
      
      console.log(`[Deduplication] Encontrados ${duplicates.length} grupos de duplicados`);
      
      const duplicateGroups: DuplicateGroup[] = duplicates.map((row: any) => ({
        cnpj: row.cnpj,
        periodo_apuracao: row.periodo_apuracao,
        data_transmissao: row.data_transmissao,
        situacao: row.situacao,
        tipo_ni: row.tipo_ni,
        categoria: row.categoria,
        origem: row.origem,
        tipo: row.tipo,
        debito_apurado: row.debito_apurado,
        saldo_a_pagar: row.saldo_a_pagar,
        count: row.count,
        ids: row.ids.split(','),
        oldest_id: row.oldest_id,
        newest_id: row.newest_id,
      }));
      
      return {
        success: true,
        data: duplicateGroups,
        message: `Encontrados ${duplicates.length} grupos de duplicados (${duplicateGroups.reduce((sum, g) => sum + g.count, 0)} registros totais)`,
      };
    } catch (error: any) {
      console.error('[Deduplication] Erro ao detectar duplicados:', error);
      return {
        success: false,
        error: error.message || 'Erro ao detectar duplicados',
      };
    } finally {
      connection.release();
    }
  }
  
  /**
   * Remove duplicados, mantendo sempre o registro mais recente
   * @param dryRun Se true, apenas simula sem deletar
   */
  async removeDuplicates(dryRun: boolean = false): Promise<ApiResponse<DeduplicationResult>> {
    const connection = await getConnection();
    
    try {
      console.log(`[Deduplication] Iniciando ${dryRun ? 'simulação' : 'remoção'} de duplicados...`);
      
      // 1. Detectar duplicados
      const detectResult = await this.detectDuplicates();
      if (!detectResult.success || !detectResult.data) {
        return {
          success: false,
          error: detectResult.error || 'Erro ao detectar duplicados',
        };
      }
      
      const duplicateGroups = detectResult.data;
      
      if (duplicateGroups.length === 0) {
        return {
          success: true,
          data: {
            totalDuplicates: 0,
            groupsProcessed: 0,
            recordsRemoved: 0,
            errors: 0,
            details: [],
          },
          message: 'Nenhum duplicado encontrado',
        };
      }
      
      let recordsRemoved = 0;
      let errors = 0;
      const details: DeduplicationResult['details'] = [];
      
      // 2. Para cada grupo de duplicados, manter apenas o mais recente
      for (const group of duplicateGroups) {
        try {
          // Buscar todos os registros do grupo com created_at e updated_at
          // Usar TODOS os campos para identificar duplicados exatos
          const [records] = await connection.execute(
            `SELECT id, created_at, updated_at 
             FROM dctf_declaracoes 
             WHERE cnpj = ? 
               AND periodo_apuracao = ?
               AND (data_transmissao = ? OR (data_transmissao IS NULL AND ? IS NULL))
               AND (situacao = ? OR (situacao IS NULL AND ? IS NULL))
               AND (tipo_ni = ? OR (tipo_ni IS NULL AND ? IS NULL))
               AND (categoria = ? OR (categoria IS NULL AND ? IS NULL))
               AND (origem = ? OR (origem IS NULL AND ? IS NULL))
               AND (tipo = ? OR (tipo IS NULL AND ? IS NULL))
               AND (debito_apurado = ? OR (debito_apurado IS NULL AND ? IS NULL))
               AND (saldo_a_pagar = ? OR (saldo_a_pagar IS NULL AND ? IS NULL))
             ORDER BY 
               COALESCE(updated_at, created_at) DESC, 
               created_at DESC`,
            [
              group.cnpj, 
              group.periodo_apuracao,
              group.data_transmissao, group.data_transmissao,
              group.situacao, group.situacao,
              group.tipo_ni, group.tipo_ni,
              group.categoria, group.categoria,
              group.origem, group.origem,
              group.tipo, group.tipo,
              group.debito_apurado, group.debito_apurado,
              group.saldo_a_pagar, group.saldo_a_pagar,
            ]
          );
          
          const sortedRecords = records as any[];
          
          if (sortedRecords.length <= 1) {
            // Não há duplicados reais (possível inconsistência de dados)
            continue;
          }
          
          // O primeiro registro (mais recente) será mantido
          const keepId = sortedRecords[0].id;
          const removeIds = sortedRecords.slice(1).map((r: any) => r.id);
          
          console.log(`[Deduplication] CNPJ ${group.cnpj}, Período ${group.periodo_apuracao}:`);
          console.log(`  - Mantendo: ${keepId}`);
          console.log(`  - Removendo: ${removeIds.join(', ')}`);
          
          if (!dryRun) {
            // Deletar os registros mais antigos
            for (const removeId of removeIds) {
              const [result] = await connection.execute(
                'DELETE FROM dctf_declaracoes WHERE id = ?',
                [removeId]
              );
              
              const affectedRows = (result as any).affectedRows;
              if (affectedRows > 0) {
                recordsRemoved++;
              }
            }
          } else {
            // Modo simulação: apenas contar
            recordsRemoved += removeIds.length;
          }
          
          details.push({
            cnpj: group.cnpj,
            periodo: group.periodo_apuracao,
            duplicatesFound: sortedRecords.length,
            kept: keepId,
            removed: removeIds,
          });
        } catch (error: any) {
          console.error(`[Deduplication] Erro ao processar grupo ${group.cnpj}/${group.periodo_apuracao}:`, error);
          errors++;
        }
      }
      
      const result: DeduplicationResult = {
        totalDuplicates: duplicateGroups.reduce((sum, g) => sum + g.count, 0),
        groupsProcessed: duplicateGroups.length,
        recordsRemoved,
        errors,
        details,
      };
      
      const message = dryRun
        ? `Simulação: ${recordsRemoved} registros seriam removidos de ${duplicateGroups.length} grupos`
        : `Deduplicação concluída: ${recordsRemoved} registros removidos de ${duplicateGroups.length} grupos`;
      
      console.log(`[Deduplication] ${message}`);
      
      return {
        success: true,
        data: result,
        message,
      };
    } catch (error: any) {
      console.error('[Deduplication] Erro geral ao remover duplicados:', error);
      return {
        success: false,
        error: error.message || 'Erro ao remover duplicados',
      };
    } finally {
      connection.release();
    }
  }
  
  /**
   * Cria um índice único composto para prevenir futuros duplicados
   * ATENÇÃO: Só pode ser executado APÓS remover os duplicados existentes
   */
  async createUniqueConstraint(): Promise<ApiResponse<boolean>> {
    const connection = await getConnection();
    
    try {
      console.log('[Deduplication] Criando constraint UNIQUE para prevenir duplicados...');
      
      // Verificar se já existe
      const [existing] = await connection.execute(`
        SELECT COUNT(*) as count
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'dctf_declaracoes'
          AND index_name = 'idx_unique_dctf'
      `);
      
      const existingCount = (existing as any[])[0].count;
      
      if (existingCount > 0) {
        return {
          success: true,
          data: true,
          message: 'Constraint UNIQUE já existe',
        };
      }
      
      // Criar índice único composto
      // Campos que definem univocidade: TODOS os campos de dados (não apenas CNPJ/período/data)
      // Nota: MySQL tem limite de tamanho de índice, então usamos os campos mais importantes
      await connection.execute(`
        CREATE UNIQUE INDEX idx_unique_dctf 
        ON dctf_declaracoes (
          cnpj, 
          periodo_apuracao, 
          data_transmissao(50),
          situacao(50),
          tipo_ni,
          categoria(50),
          origem(50),
          tipo(50)
        )
      `);
      
      console.log('[Deduplication] Constraint UNIQUE criada com sucesso');
      
      return {
        success: true,
        data: true,
        message: 'Constraint UNIQUE criada com sucesso. Futuros duplicados serão bloqueados.',
      };
    } catch (error: any) {
      console.error('[Deduplication] Erro ao criar constraint:', error);
      
      // Se o erro for de duplicados, retornar mensagem específica
      if (error.code === 'ER_DUP_ENTRY') {
        return {
          success: false,
          error: 'Não foi possível criar a constraint UNIQUE porque ainda existem duplicados. Execute removeDuplicates() primeiro.',
        };
      }
      
      return {
        success: false,
        error: error.message || 'Erro ao criar constraint UNIQUE',
      };
    } finally {
      connection.release();
    }
  }
  
  /**
   * Remove a constraint UNIQUE (útil para manutenção)
   */
  async removeUniqueConstraint(): Promise<ApiResponse<boolean>> {
    const connection = await getConnection();
    
    try {
      console.log('[Deduplication] Removendo constraint UNIQUE...');
      
      await connection.execute(`
        DROP INDEX IF EXISTS idx_unique_dctf ON dctf_declaracoes
      `);
      
      console.log('[Deduplication] Constraint UNIQUE removida');
      
      return {
        success: true,
        data: true,
        message: 'Constraint UNIQUE removida com sucesso',
      };
    } catch (error: any) {
      console.error('[Deduplication] Erro ao remover constraint:', error);
      return {
        success: false,
        error: error.message || 'Erro ao remover constraint UNIQUE',
      };
    } finally {
      connection.release();
    }
  }
}

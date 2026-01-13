/**
 * Service para consulta de documentos legais (SPED v2.0)
 * Gerencia operações de banco de dados e integração com Python RAG
 */

import { executeQuery } from '../config/mysql';
import { ApiResponse } from '../types';

export interface LegalDocument {
  id: string;
  documento_tipo: string;
  documento_nome: string;
  versao: string | null;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  arquivo_path: string;
  hash_arquivo: string;
  metadata: any;
  status: string;
  created_at: string;
  updated_at: string;
}

export class SpedV2KnowledgeService {
  /**
   * Listar documentos por período/vigência com filtros
   */
  async listDocuments(filters: {
    periodo?: string; // MM/YYYY
    tipo?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<LegalDocument[]>> {
    try {
      let query = `
        SELECT 
          id,
          documento_tipo,
          documento_nome,
          versao,
          vigencia_inicio,
          vigencia_fim,
          arquivo_path,
          hash_arquivo,
          metadata,
          status,
          created_at,
          updated_at
        FROM sped_v2_legal_documents
        WHERE 1=1
      `;
      
      const params: any[] = [];
      
      // Filtro por período (vigência)
      if (filters.periodo) {
        // Validar formato MM/YYYY
        const periodoMatch = filters.periodo.match(/^(\d{2})\/(\d{4})$/);
        if (!periodoMatch) {
          return {
            success: false,
            error: 'Formato de período inválido. Use MM/YYYY (ex: 01/2025)',
            data: null
          };
        }
        
        const [, month, year] = periodoMatch;
        const periodoDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        const periodoDateStr = periodoDate.toISOString().split('T')[0];
        
        query += ` AND vigencia_inicio <= ? AND (vigencia_fim IS NULL OR vigencia_fim >= ?)`;
        params.push(periodoDateStr, periodoDateStr);
      }
      
      // Filtro por tipo
      if (filters.tipo) {
        query += ` AND documento_tipo = ?`;
        params.push(filters.tipo);
      }
      
      // Filtro por status
      if (filters.status) {
        query += ` AND status = ?`;
        params.push(filters.status);
      } else {
        // Por padrão, apenas documentos ativos
        query += ` AND status = 'ativo'`;
      }
      
      query += ` ORDER BY vigencia_inicio DESC, documento_nome ASC`;
      
      // Paginação
      if (filters.limit) {
        query += ` LIMIT ?`;
        params.push(filters.limit);
        
        if (filters.offset) {
          query += ` OFFSET ?`;
          params.push(filters.offset);
        }
      }
      
      const documents = await executeQuery<LegalDocument>(query, params);
      
      return {
        success: true,
        data: documents || []
      };
    } catch (error: any) {
      console.error('[SpedV2KnowledgeService] Erro ao listar documentos:', error);
      return {
        success: false,
        error: error.message || 'Erro ao listar documentos',
        data: null
      };
    }
  }
}


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

export interface QueryResult {
  chunk_id: string;
  chunk_text: string;
  score: number;
  metadata: any;
  document_id?: string;
  section_title?: string;
  article_number?: string;
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

  /**
   * Busca semântica (RAG) com filtros
   */
  async queryDocuments(filters: {
    query: string;
    n_results?: number;
    document_id?: string;
    min_score?: number;
  }): Promise<ApiResponse<QueryResult[]>> {
    try {
      // Validar query
      if (!filters.query || filters.query.trim().length === 0) {
        return {
          success: false,
          error: 'Query é obrigatória e não pode estar vazia',
          data: null
        };
      }

      const { exec } = require('child_process');
      const { promisify } = require('util');
      const path = require('path');
      const execAsync = promisify(exec) as any;

      // Caminho do script Python
      const pythonScript = path.join(__dirname, '../../../python/sped/v2/knowledge/query_rag.py');
      
      // Construir comando
      const args = [
        filters.query,
        String(filters.n_results || 5),
        filters.document_id || '',
        String(filters.min_score || 0.3)
      ];
      
      const command = `python "${pythonScript}" "${args[0]}" "${args[1]}" "${args[2]}" "${args[3]}"`;

      // Executar script Python
      const { stdout } = await execAsync(command, {
        cwd: path.join(__dirname, '../../../python/sped/v2/knowledge'),
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });

      // Parsear resultado JSON
      const result = JSON.parse(stdout.trim());
      
      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Erro na busca semântica',
          data: null
        };
      }

      return {
        success: true,
        data: result.data || []
      };
    } catch (error: any) {
      console.error('[SpedV2KnowledgeService] Erro na busca semântica:', error);
      return {
        success: false,
        error: error.message || 'Erro ao executar busca semântica',
        data: null
      };
    }
  }

  /**
   * Buscar regras estruturadas por categoria/tipo/período
   */
  async getRules(filters: {
    categoria?: string;
    tipo?: string;
    periodo?: string; // MM/YYYY
    document_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<any[]>> {
    try {
      let query = `
        SELECT 
          id,
          rule_type,
          rule_category,
          rule_description,
          rule_condition,
          legal_reference,
          article_reference,
          section_reference,
          vigencia_inicio,
          vigencia_fim,
          document_id,
          metadata,
          created_at,
          updated_at
        FROM sped_v2_legal_rules
        WHERE 1=1
      `;
      
      const params: any[] = [];
      
      // Filtro por categoria SPED
      if (filters.categoria) {
        query += ` AND rule_category = ?`;
        params.push(filters.categoria);
      }
      
      // Filtro por tipo de regra
      if (filters.tipo) {
        query += ` AND rule_type = ?`;
        params.push(filters.tipo);
      }
      
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
      
      // Filtro por documento
      if (filters.document_id) {
        query += ` AND document_id = ?`;
        params.push(filters.document_id);
      }
      
      query += ` ORDER BY rule_category ASC, rule_type ASC, vigencia_inicio DESC`;
      
      // Paginação
      if (filters.limit) {
        query += ` LIMIT ?`;
        params.push(filters.limit);
        
        if (filters.offset) {
          query += ` OFFSET ?`;
          params.push(filters.offset);
        }
      }
      
      const rules = await executeQuery<any>(query, params);
      
      return {
        success: true,
        data: rules || []
      };
    } catch (error: any) {
      console.error('[SpedV2KnowledgeService] Erro ao buscar regras:', error);
      return {
        success: false,
        error: error.message || 'Erro ao buscar regras',
        data: null
      };
    }
  }
}


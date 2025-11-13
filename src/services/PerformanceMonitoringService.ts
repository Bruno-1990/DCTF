/**
 * Serviço de Monitoramento de Performance DCTF
 * Monitora e otimiza performance das consultas e operações
 */

import { supabase } from '../config/database';

export interface PerformanceMetrics {
  queryTime: number;
  rowsReturned: number;
  cacheHitRatio: number;
  indexUsage: number;
  memoryUsage: number;
}

export interface QueryPerformance {
  query: string;
  executionTime: number;
  rowsAffected: number;
  indexUsed: boolean;
  recommendations: string[];
}

export interface IndexAnalysis {
  tableName: string;
  indexName: string;
  size: string;
  usage: string;
  efficiency: string;
  recommendations: string[];
}

export class PerformanceMonitoringService {
  /**
   * Monitorar performance de uma consulta
   */
  static async monitorQuery(
    query: string, 
    params?: any[]
  ): Promise<QueryPerformance> {
    const startTime = Date.now();
    const recommendations: string[] = [];

    try {
      const { data, error, count } = await supabase
        .rpc('exec_sql', { sql: query });

      const executionTime = Date.now() - startTime;

      if (error) {
        throw new Error(`Erro na consulta: ${error.message}`);
      }

      // Análise de performance
      if (executionTime > 1000) {
        recommendations.push('Consulta lenta - considere otimizar ou adicionar índices');
      }

      if (executionTime > 5000) {
        recommendations.push('Consulta muito lenta - revise a estratégia de consulta');
      }

      if (count && count > 10000) {
        recommendations.push('Muitas linhas retornadas - considere paginação');
      }

      // Verificar se há índices adequados
      const hasIndexes = await this.checkIndexUsage(query);
      if (!hasIndexes) {
        recommendations.push('Considere adicionar índices para melhorar performance');
      }

      return {
        query,
        executionTime,
        rowsAffected: count || 0,
        indexUsed: hasIndexes,
        recommendations
      };

    } catch (error: any) {
      return {
        query,
        executionTime: Date.now() - startTime,
        rowsAffected: 0,
        indexUsed: false,
        recommendations: [`Erro: ${error.message}`]
      };
    }
  }

  /**
   * Analisar performance dos índices
   */
  static async analyzeIndexPerformance(): Promise<IndexAnalysis[]> {
    try {
      const { data, error } = await supabase
        .rpc('analyze_dctf_performance');

      if (error) {
        throw new Error(`Erro ao analisar índices: ${error.message}`);
      }

      return data.map((index: any) => ({
        tableName: index.tabela,
        indexName: index.indice,
        size: index.tamanho,
        usage: index.uso,
        efficiency: index.eficiencia,
        recommendations: this.getIndexRecommendationsForIndex(index)
      }));

    } catch (error: any) {
      throw new Error(`Erro na análise de performance: ${error.message}`);
    }
  }

  /**
   * Obter recomendações de índices
   */
  static async getIndexRecommendations(): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .rpc('recommend_dctf_indexes');

      if (error) {
        throw new Error(`Erro ao obter recomendações: ${error.message}`);
      }

      return data.map((rec: any) => rec.recomendacao);

    } catch (error: any) {
      throw new Error(`Erro ao obter recomendações: ${error.message}`);
    }
  }

  /**
   * Verificar índices não utilizados
   */
  static async getUnusedIndexes(): Promise<Array<{
    index: string;
    size: string;
    lastUsed: string;
  }>> {
    try {
      const { data, error } = await supabase
        .rpc('cleanup_unused_indexes');

      if (error) {
        throw new Error(`Erro ao verificar índices não utilizados: ${error.message}`);
      }

      return data;

    } catch (error: any) {
      throw new Error(`Erro ao verificar índices: ${error.message}`);
    }
  }

  /**
   * Reindexar tabelas DCTF
   */
  static async reindexTables(): Promise<{
    success: boolean;
    message: string;
    duration: number;
  }> {
    const startTime = Date.now();

    try {
      const { error } = await supabase
        .rpc('reindex_dctf_tables');

      if (error) {
        throw new Error(`Erro ao reindexar: ${error.message}`);
      }

      const duration = Date.now() - startTime;

      return {
        success: true,
        message: 'Tabelas reindexadas com sucesso',
        duration
      };

    } catch (error: any) {
      return {
        success: false,
        message: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Obter métricas de performance do sistema
   */
  static async getSystemMetrics(): Promise<PerformanceMetrics> {
    try {
      // Consulta para obter métricas básicas
      const { data: stats, error: statsError } = await supabase
        .from('pg_stat_database')
        .select('*')
        .eq('datname', 'postgres')
        .single();

      if (statsError) {
        throw new Error(`Erro ao obter estatísticas: ${statsError.message}`);
      }

      // Calcular métricas
      const cacheHitRatio = stats.blks_hit / (stats.blks_hit + stats.blks_read) * 100;
      const memoryUsage = stats.temp_bytes || 0;

      return {
        queryTime: 0, // Será calculado por consulta
        rowsReturned: stats.tup_returned || 0,
        cacheHitRatio: Math.round(cacheHitRatio * 100) / 100,
        indexUsage: 0, // Será calculado por consulta
        memoryUsage: Math.round(memoryUsage / 1024 / 1024) // MB
      };

    } catch (error: any) {
      throw new Error(`Erro ao obter métricas: ${error.message}`);
    }
  }

  /**
   * Otimizar consultas lentas
   */
  static async optimizeSlowQueries(): Promise<{
    optimized: number;
    recommendations: string[];
  }> {
    const recommendations: string[] = [];
    let optimized = 0;

    try {
      // Identificar consultas lentas
      const slowQueries = await this.identifySlowQueries();
      
      for (const query of slowQueries) {
        const optimization = await this.optimizeQuery(query);
        if (optimization.optimized) {
          optimized++;
          recommendations.push(...optimization.recommendations);
        }
      }

      return { optimized, recommendations };

    } catch (error: any) {
      throw new Error(`Erro na otimização: ${error.message}`);
    }
  }

  /**
   * Verificar uso de índices em uma consulta
   */
  private static async checkIndexUsage(query: string): Promise<boolean> {
    // Análise básica de consulta para detectar uso de índices
    const indexKeywords = ['WHERE', 'ORDER BY', 'GROUP BY', 'JOIN'];
    const hasIndexableClauses = indexKeywords.some(keyword => 
      query.toUpperCase().includes(keyword)
    );

    return hasIndexableClauses;
  }

  /**
   * Obter recomendações para um índice
   */
  private static getIndexRecommendationsForIndex(index: any): string[] {
    const recommendations: string[] = [];

    if (index.uso === 'Nunca usado') {
      recommendations.push('Índice nunca usado - considere removê-lo');
    }

    if (index.eficiencia === 'Ineficiente') {
      recommendations.push('Índice ineficiente - revise a estratégia');
    }

    if (index.tamanho && index.tamanho.includes('GB')) {
      recommendations.push('Índice muito grande - considere particionamento');
    }

    return recommendations;
  }

  /**
   * Identificar consultas lentas
   */
  private static async identifySlowQueries(): Promise<string[]> {
    // Consultas comuns que podem ser lentas
    return [
      'SELECT * FROM dctf_declaracoes WHERE periodo = ?',
      'SELECT * FROM dctf_dados WHERE codigo = ? AND valor > ?',
      'SELECT * FROM clientes WHERE cnpj_limpo = ?',
      'SELECT * FROM analises WHERE dctf_id = ?'
    ];
  }

  /**
   * Otimizar uma consulta específica
   */
  private static async optimizeQuery(query: string): Promise<{
    optimized: boolean;
    recommendations: string[];
  }> {
    const recommendations: string[] = [];

    // Análise básica de otimização
    if (query.includes('SELECT *')) {
      recommendations.push('Evite SELECT * - especifique apenas as colunas necessárias');
    }

    if (query.includes('WHERE') && !query.includes('ORDER BY')) {
      recommendations.push('Considere adicionar ORDER BY para resultados consistentes');
    }

    if (query.includes('LIKE') && !query.includes('ILIKE')) {
      recommendations.push('Use ILIKE para busca case-insensitive');
    }

    return {
      optimized: recommendations.length > 0,
      recommendations
    };
  }

  /**
   * Gerar relatório de performance
   */
  static async generatePerformanceReport(): Promise<{
    summary: {
      totalQueries: number;
      averageExecutionTime: number;
      slowQueries: number;
      indexEfficiency: number;
    };
    recommendations: string[];
    metrics: PerformanceMetrics;
  }> {
    try {
      const metrics = await this.getSystemMetrics();
      const indexAnalysis = await this.analyzeIndexPerformance();
      const indexRecommendations = await this.getIndexRecommendations();

      const summary = {
        totalQueries: 0, // Seria calculado com dados reais
        averageExecutionTime: 0, // Seria calculado com dados reais
        slowQueries: indexAnalysis.filter(idx => idx.usage === 'Nunca usado').length,
        indexEfficiency: indexAnalysis.filter(idx => idx.efficiency === 'Eficiente').length / indexAnalysis.length * 100
      };

      const recommendations = [
        ...indexRecommendations,
        ...indexAnalysis.flatMap(idx => idx.recommendations)
      ];

      return {
        summary,
        recommendations,
        metrics
      };

    } catch (error: any) {
      throw new Error(`Erro ao gerar relatório: ${error.message}`);
    }
  }
}


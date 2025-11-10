/**
 * Controlador para Monitoramento de Performance DCTF
 * Gerencia endpoints para monitoramento e otimização
 */

import { Request, Response } from 'express';
import { PerformanceMonitoringService } from '../services/PerformanceMonitoringService';

export class PerformanceController {
  /**
   * POST /api/performance/monitor-query
   * Monitorar performance de uma consulta
   */
  static async monitorQuery(req: Request, res: Response): Promise<void> {
    try {
      const { query, params } = req.body;

      if (!query) {
        res.status(400).json({
          success: false,
          error: 'Query é obrigatória'
        });
        return;
      }

      const result = await PerformanceMonitoringService.monitorQuery(query, params);

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/performance/index-analysis
   * Analisar performance dos índices
   */
  static async getIndexAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const analysis = await PerformanceMonitoringService.analyzeIndexPerformance();

      res.json({
        success: true,
        data: analysis
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/performance/recommendations
   * Obter recomendações de performance
   */
  static async getRecommendations(req: Request, res: Response): Promise<void> {
    try {
      const recommendations = await PerformanceMonitoringService.getIndexRecommendations();

      res.json({
        success: true,
        data: recommendations
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/performance/unused-indexes
   * Obter índices não utilizados
   */
  static async getUnusedIndexes(req: Request, res: Response): Promise<void> {
    try {
      const unusedIndexes = await PerformanceMonitoringService.getUnusedIndexes();

      res.json({
        success: true,
        data: unusedIndexes
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/performance/reindex
   * Reindexar tabelas DCTF
   */
  static async reindexTables(req: Request, res: Response): Promise<void> {
    try {
      const result = await PerformanceMonitoringService.reindexTables();

      res.json({
        success: result.success,
        data: result,
        message: result.message
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/performance/metrics
   * Obter métricas de performance do sistema
   */
  static async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = await PerformanceMonitoringService.getSystemMetrics();

      res.json({
        success: true,
        data: metrics
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/performance/optimize
   * Otimizar consultas lentas
   */
  static async optimizeQueries(req: Request, res: Response): Promise<void> {
    try {
      const result = await PerformanceMonitoringService.optimizeSlowQueries();

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/performance/report
   * Gerar relatório completo de performance
   */
  static async generateReport(req: Request, res: Response): Promise<void> {
    try {
      const report = await PerformanceMonitoringService.generatePerformanceReport();

      res.json({
        success: true,
        data: report
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/performance/health
   * Verificar saúde do sistema
   */
  static async getHealth(req: Request, res: Response): Promise<void> {
    try {
      const metrics = await PerformanceMonitoringService.getSystemMetrics();
      const analysis = await PerformanceMonitoringService.analyzeIndexPerformance();

      // Calcular score de saúde
      const cacheScore = metrics.cacheHitRatio > 90 ? 100 : (metrics.cacheHitRatio / 90) * 100;
      const indexScore = analysis.filter(idx => idx.efficiency === 'Eficiente').length / analysis.length * 100;
      const overallScore = (cacheScore + indexScore) / 2;

      const health = {
        overall: overallScore,
        cache: cacheScore,
        indexes: indexScore,
        status: overallScore > 80 ? 'healthy' : overallScore > 60 ? 'warning' : 'critical',
        recommendations: overallScore < 80 ? [
          'Considere otimizar consultas lentas',
          'Verifique uso de índices',
          'Monitore cache hit ratio'
        ] : []
      };

      res.json({
        success: true,
        data: health
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}


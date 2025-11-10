/**
 * Rotas para Monitoramento de Performance DCTF
 * Endpoints para monitoramento, análise e otimização
 */

import { Router } from 'express';
import { PerformanceController } from '../controllers/PerformanceController';

const router = Router();

// ==============================================
// ROTAS DE MONITORAMENTO
// ==============================================

/**
 * POST /api/performance/monitor-query
 * Monitorar performance de uma consulta
 * Body: { query: string, params?: any[] }
 */
router.post('/monitor-query', PerformanceController.monitorQuery);

/**
 * GET /api/performance/metrics
 * Obter métricas de performance do sistema
 */
router.get('/metrics', PerformanceController.getMetrics);

/**
 * GET /api/performance/health
 * Verificar saúde do sistema
 */
router.get('/health', PerformanceController.getHealth);

// ==============================================
// ROTAS DE ANÁLISE
// ==============================================

/**
 * GET /api/performance/index-analysis
 * Analisar performance dos índices
 */
router.get('/index-analysis', PerformanceController.getIndexAnalysis);

/**
 * GET /api/performance/recommendations
 * Obter recomendações de performance
 */
router.get('/recommendations', PerformanceController.getRecommendations);

/**
 * GET /api/performance/unused-indexes
 * Obter índices não utilizados
 */
router.get('/unused-indexes', PerformanceController.getUnusedIndexes);

// ==============================================
// ROTAS DE OTIMIZAÇÃO
// ==============================================

/**
 * POST /api/performance/reindex
 * Reindexar tabelas DCTF
 */
router.post('/reindex', PerformanceController.reindexTables);

/**
 * POST /api/performance/optimize
 * Otimizar consultas lentas
 */
router.post('/optimize', PerformanceController.optimizeQueries);

// ==============================================
// ROTAS DE RELATÓRIOS
// ==============================================

/**
 * GET /api/performance/report
 * Gerar relatório completo de performance
 */
router.get('/report', PerformanceController.generateReport);

export default router;


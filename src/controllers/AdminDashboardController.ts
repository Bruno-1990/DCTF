import { Request, Response } from 'express';
import { getAdminDashboardSnapshot } from '../services/AdminDashboardService';
import { EnhancedDashboardService } from '../services/EnhancedDashboardService';
import { IrpfFaturamentoCache } from '../models/IrpfFaturamentoCache';

const faturamentoCache = new IrpfFaturamentoCache();

class AdminDashboardController {
  async getSnapshot(req: Request, res: Response): Promise<void> {
    try {
      const monthsParam = req.query.months;
      const parsedMonths = typeof monthsParam === 'string' ? Number.parseInt(monthsParam, 10) : undefined;
      const months = Number.isFinite(parsedMonths) && parsedMonths! > 0 ? parsedMonths : 5;

      const snapshot = await getAdminDashboardSnapshot(months);
      res.json(snapshot);
    } catch (error) {
      console.error('Erro ao carregar painel administrativo:', error);
      res.status(500).json({ success: false, error: 'Não foi possível carregar o painel administrativo.' });
    }
  }

  async getEnhanced(req: Request, res: Response): Promise<void> {
    try {
      const monthsParam = req.query.months;
      const parsedMonths = typeof monthsParam === 'string' ? Number.parseInt(monthsParam, 10) : undefined;
      const months = Number.isFinite(parsedMonths) && parsedMonths! > 0 ? parsedMonths : 6;

      const data = await EnhancedDashboardService.getEnhancedDashboardData(months);
      res.json(data);
    } catch (error) {
      console.error('[AdminDashboard] Erro ao carregar dashboard aprimorado:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Não foi possível carregar o dashboard aprimorado.' 
      });
    }
  }

  async getTopFaturamento(req: Request, res: Response): Promise<void> {
    try {
      const anoParam = req.query.ano;
      const limitParam = req.query.limit;
      const ano = typeof anoParam === 'string' ? Number.parseInt(anoParam, 10) : new Date().getFullYear();
      const limit = typeof limitParam === 'string' ? Number.parseInt(limitParam, 10) : 10;

      if (!Number.isFinite(ano) || ano < 2000 || ano > 2100) {
        res.status(400).json({ success: false, error: 'Parâmetro ano inválido (use 2024 ou 2025).' });
        return;
      }

      const result = await faturamentoCache.buscarTopPorAno(ano, Number.isFinite(limit) && limit > 0 ? limit : 10);
      if (!result.success) {
        res.status(500).json({ success: false, error: result.error || 'Erro ao buscar top faturamento.' });
        return;
      }
      res.json({ success: true, data: result.data });
    } catch (error) {
      console.error('[AdminDashboard] Erro ao carregar top faturamento:', error);
      res.status(500).json({ success: false, error: 'Não foi possível carregar o top faturamento.' });
    }
  }
}

export default new AdminDashboardController();

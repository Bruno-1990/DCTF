import { Request, Response } from 'express';
import { getAdminDashboardSnapshot } from '../services/AdminDashboardService';

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
}

export default new AdminDashboardController();

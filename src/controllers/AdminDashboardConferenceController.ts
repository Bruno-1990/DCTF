import { Request, Response } from 'express';
import { getConferenceSummary } from '../services/AdminDashboardConferenceService';

class AdminDashboardConferenceController {
  async getSummary(req: Request, res: Response): Promise<void> {
    try {
      const monthsParam = req.query.months;
      const parsedMonths = typeof monthsParam === 'string' ? Number.parseInt(monthsParam, 10) : undefined;
      const months = Number.isFinite(parsedMonths) && parsedMonths! > 0 ? parsedMonths : 12;

      const summary = await getConferenceSummary(months);
      res.json(summary);
    } catch (error) {
      console.error('Erro ao gerar conferência do dashboard:', error);
      res.status(500).json({ success: false, error: 'Não foi possível gerar a conferência.' });
    }
  }
}

export default new AdminDashboardConferenceController();

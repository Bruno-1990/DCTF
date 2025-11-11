import { Request, Response } from 'express';
import { AdminReportPdfService } from '../services/AdminReportPdfService';
import AdminReportHistoryService from '../services/AdminReportHistoryService';

class AdminDashboardReportController {
  async downloadGerencial(req: Request, res: Response): Promise<void> {
    try {
      const monthsParam = req.query.months;
      const monthsParsed = typeof monthsParam === 'string' ? Number.parseInt(monthsParam, 10) : undefined;
      const months = Number.isFinite(monthsParsed) && monthsParsed! > 0 ? monthsParsed : undefined;
      const period = typeof req.query.period === 'string' ? req.query.period : undefined;
      const identification = typeof req.query.identification === 'string' ? req.query.identification : undefined;
      const logoUrl = typeof req.query.logoUrl === 'string' ? req.query.logoUrl : undefined;
      const responsible = typeof req.query.responsible === 'string' ? req.query.responsible : undefined;
      const notes = typeof req.query.notes === 'string' ? req.query.notes : undefined;

      const buffer = await AdminReportPdfService.generateGerencialReport({ months, period, identification, logoUrl, responsible, notes });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="relatorio-gerencial.pdf"');
      res.setHeader('Content-Length', buffer.length.toString());
      res.send(buffer);
    } catch (error) {
      console.error('Erro ao gerar relatório gerencial em PDF:', error);
      res.status(500).json({ success: false, error: 'Não foi possível gerar o relatório em PDF.' });
    }
  }

  async listHistory(req: Request, res: Response): Promise<void> {
    const { page, limit, tipoRelatorio, identification, period } = req.query;

    const result = AdminReportHistoryService.list({
      page: typeof page === 'string' ? Number.parseInt(page, 10) : undefined,
      limit: typeof limit === 'string' ? Number.parseInt(limit, 10) : undefined,
      reportType: typeof tipoRelatorio === 'string' ? tipoRelatorio : undefined,
      identification: typeof identification === 'string' ? identification : undefined,
      period: typeof period === 'string' ? period : undefined,
    });

    const items = result.items.map(record => ({
      id: record.id,
      titulo: record.title,
      tipoRelatorio: record.reportType,
      declaracaoId: record.identification ?? '-',
      createdAt: record.createdAt,
      arquivoPdf: `/api/dashboard/admin/reports/history/${record.id}/download`,
      period: record.period,
      responsible: record.responsible,
      notes: record.notes,
      filters: record.filters,
    }));

    res.json({
      success: true,
      data: items,
      pagination: result.pagination,
    });
  }

  async downloadHistory(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const record = id ? AdminReportHistoryService.getRecord(id) : undefined;
    if (!record) {
      res.status(404).json({ success: false, error: 'Relatório não encontrado' });
      return;
    }

    const stream = AdminReportHistoryService.getFileStream(id);
    if (!stream) {
      res.status(404).json({ success: false, error: 'Arquivo não encontrado' });
      return;
    }

    const safeTitle = record.title.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/_{2,}/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle || 'relatorio'}_${record.id}.pdf"`);
    stream.pipe(res);
  }
}

export default new AdminDashboardReportController();

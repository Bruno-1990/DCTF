import { Request, Response } from 'express';
import AdminReportHistoryService from '../services/AdminReportHistoryService';
import ReportPdfService from '../services/reports/ReportPdfService';
import ReportXlsxService from '../services/reports/ReportXlsxService';
import type { ReportFilterOptions, ReportType } from '../types';

const ALLOWED_REPORT_TYPES: ReportType[] = ['gerencial', 'clientes', 'dctf', 'conferencia', 'pendentes'];
const FORMAT_CONFIG = {
  pdf: {
    mimeType: 'application/pdf',
    extension: 'pdf',
  },
  xlsx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  },
} as const;

class AdminDashboardReportController {
  async downloadReport(req: Request, res: Response): Promise<void> {
    try {
      const { reportType, format } = req.params;
      if (!reportType || !this.isValidReportType(reportType)) {
        res.status(400).json({ success: false, error: 'Tipo de relatório inválido.' });
        return;
      }

      const normalizedFormat = format?.toLowerCase();
      if (!normalizedFormat || !(normalizedFormat in FORMAT_CONFIG)) {
        res.status(400).json({ success: false, error: 'Formato de relatório inválido.' });
        return;
      }

      const filters = this.parseFilters(req);
      const meta = this.parseMeta(req);
      const config = FORMAT_CONFIG[normalizedFormat as 'pdf' | 'xlsx'];
      const title = meta.title ?? this.getDefaultTitle(reportType);

      let buffer: Buffer;
      if (normalizedFormat === 'pdf') {
        buffer = await ReportPdfService.generate(reportType, {
          ...filters,
          title,
          logoUrl: meta.logoUrl,
          responsible: meta.responsible,
          notes: meta.notes,
        });
      } else {
        buffer = await ReportXlsxService.generate(reportType, filters);
      }

      const record = AdminReportHistoryService.register({
        title,
        reportType,
        buffer,
        format: normalizedFormat as 'pdf' | 'xlsx',
        extension: config.extension,
        mimeType: config.mimeType,
        period: filters.period,
        identification: filters.identification,
        responsible: meta.responsible,
        notes: meta.notes,
        filters: this.buildFiltersMetadata(filters),
      });

      const downloadName = AdminReportHistoryService.getDownloadFileName(record);
      res.setHeader('Content-Type', record.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
      res.setHeader('Content-Length', buffer.length.toString());
      res.send(buffer);
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      res.status(500).json({ success: false, error: 'Não foi possível gerar o relatório solicitado.' });
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

    const items = result.items.map(record => {
      const downloadUrl = `/api/dashboard/admin/reports/history/${record.id}/download`;
      const base = {
        id: record.id,
        titulo: record.title,
        tipoRelatorio: record.reportType,
        formato: record.format,
        declaracaoId: record.identification ?? '-',
        createdAt: record.createdAt,
        downloadUrl,
        period: record.period,
        responsible: record.responsible,
        notes: record.notes,
        filters: record.filters,
        mimeType: record.mimeType,
        extension: record.extension,
      };

      if (record.format === 'pdf') {
        return { ...base, arquivoPdf: downloadUrl };
      }

      if (record.format === 'xlsx') {
        return { ...base, arquivoXlsx: downloadUrl };
      }

      return base;
    });

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

    const downloadName = AdminReportHistoryService.getDownloadFileName(record);
    res.setHeader('Content-Type', record.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    stream.pipe(res);
  }

  async deleteHistory(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ success: false, error: 'ID do relatório é obrigatório' });
      return;
    }

    const deleted = AdminReportHistoryService.delete(id);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Relatório não encontrado' });
      return;
    }

    res.status(200).json({ success: true, message: 'Relatório excluído com sucesso' });
  }

  private parseFilters(req: Request): ReportFilterOptions {
    const monthsParam = req.query.months;
    const monthsParsed = typeof monthsParam === 'string' ? Number.parseInt(monthsParam, 10) : undefined;

    return {
      months: Number.isFinite(monthsParsed) && monthsParsed! > 0 ? monthsParsed : undefined,
      period: typeof req.query.period === 'string' ? req.query.period : undefined,
      identification: typeof req.query.identification === 'string' ? req.query.identification : undefined,
    };
  }

  private parseMeta(req: Request) {
    return {
      title: typeof req.query.title === 'string' ? req.query.title : undefined,
      logoUrl: typeof req.query.logoUrl === 'string' ? req.query.logoUrl : undefined,
      responsible: typeof req.query.responsible === 'string' ? req.query.responsible : undefined,
      notes: typeof req.query.notes === 'string' ? req.query.notes : undefined,
    };
  }

  private buildFiltersMetadata(filters: ReportFilterOptions) {
    const metadata: Record<string, unknown> = {};
    if (filters.months) metadata.months = filters.months;
    if (filters.period) metadata.period = filters.period;
    if (filters.identification) metadata.identification = filters.identification;
    return metadata;
  }

  private isValidReportType(candidate: string): candidate is ReportType {
    return (ALLOWED_REPORT_TYPES as string[]).includes(candidate);
  }

  private getDefaultTitle(reportType: ReportType): string {
    switch (reportType) {
      case 'gerencial':
        return 'Relatório Gerencial DCTF';
      case 'clientes':
        return 'Relatório de Clientes';
      case 'dctf':
        return 'Relatório de Declarações DCTF';
      case 'conferencia':
        return 'Relatório de Conferências Legais';
      case 'pendentes':
        return 'Relatório de Declarações Pendentes';
      default:
        return 'Relatório DCTF';
    }
  }
}

export default new AdminDashboardReportController();

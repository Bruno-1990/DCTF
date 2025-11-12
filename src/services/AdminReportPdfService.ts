import ReportPdfService, { PdfReportOptions } from './reports/ReportPdfService';

export interface GenerateAdminReportOptions extends PdfReportOptions {}

export class AdminReportPdfService {
  static async generateGerencialReport(options: GenerateAdminReportOptions = {}): Promise<Buffer> {
    return ReportPdfService.generate('gerencial', options);
  }
}

export default AdminReportPdfService;

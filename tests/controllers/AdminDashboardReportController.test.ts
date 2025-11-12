import AdminDashboardReportController from '../../src/controllers/AdminDashboardReportController';
import AdminReportHistoryService from '../../src/services/AdminReportHistoryService';
import ReportPdfService from '../../src/services/reports/ReportPdfService';
import ReportXlsxService from '../../src/services/reports/ReportXlsxService';

jest.mock('../../src/services/AdminReportHistoryService', () => ({
  __esModule: true,
  default: {
    register: jest.fn(),
    list: jest.fn(),
    getRecord: jest.fn(),
    getFileStream: jest.fn(),
    getDownloadFileName: jest.fn(),
  },
}));

jest.mock('../../src/services/reports/ReportPdfService', () => ({
  __esModule: true,
  default: {
    generate: jest.fn(),
  },
}));

jest.mock('../../src/services/reports/ReportXlsxService', () => ({
  __esModule: true,
  default: {
    generate: jest.fn(),
  },
}));

describe('AdminDashboardReportController', () => {
  const responseFactory = () => {
    const headers: Record<string, string> = {};
    return {
      setHeader: jest.fn((key: string, value: string) => {
        headers[key] = value;
      }),
      send: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      _headers: headers,
    } as any;
  };

  const historyMock = AdminReportHistoryService as unknown as {
    register: jest.Mock;
    list: jest.Mock;
    getRecord: jest.Mock;
    getFileStream: jest.Mock;
    getDownloadFileName: jest.Mock;
  };
  const pdfGenerateMock = ReportPdfService.generate as jest.Mock;
  const xlsxGenerateMock = ReportXlsxService.generate as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('gera relatório PDF com filtros e registra no histórico', async () => {
    const buffer = Buffer.from('%PDF-1.7 sample');
    pdfGenerateMock.mockResolvedValue(buffer);
    const record = {
      id: 'history-1',
      title: 'Relatório Gerencial DCTF',
      reportType: 'gerencial',
      format: 'pdf' as const,
      extension: 'pdf',
      mimeType: 'application/pdf',
      filePath: '/tmp/history-1.pdf',
      createdAt: new Date().toISOString(),
    };
    historyMock.register.mockReturnValue(record);
    historyMock.getDownloadFileName.mockReturnValue('Relatorio_gerencial_history-1.pdf');

    const res = responseFactory();

    await AdminDashboardReportController.downloadReport(
      {
        params: { reportType: 'gerencial', format: 'pdf' },
        query: {
          months: '4',
          period: '2025-09',
          identification: '11.222.333/0001-44',
          logoUrl: 'https://example.com/logo.png',
          responsible: 'João',
          notes: 'Relatório especial',
        },
      } as any,
      res,
    );

    expect(pdfGenerateMock).toHaveBeenCalledWith('gerencial', {
      months: 4,
      period: '2025-09',
      identification: '11.222.333/0001-44',
      title: 'Relatório Gerencial DCTF',
      logoUrl: 'https://example.com/logo.png',
      responsible: 'João',
      notes: 'Relatório especial',
    });
    expect(historyMock.register).toHaveBeenCalledWith(
      expect.objectContaining({
        reportType: 'gerencial',
        format: 'pdf',
        mimeType: 'application/pdf',
        filters: {
          months: 4,
          period: '2025-09',
          identification: '11.222.333/0001-44',
        },
      }),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('Relatorio_gerencial_history-1.pdf'));
    expect(res.send).toHaveBeenCalledWith(buffer);
  });

  it('gera relatório XLSX e retorna com cabeçalhos corretos', async () => {
    const buffer = Buffer.from('xlsx-binary');
    xlsxGenerateMock.mockResolvedValue(buffer);
    const record = {
      id: 'history-2',
      title: 'Relatório de Clientes',
      reportType: 'clientes',
      format: 'xlsx' as const,
      extension: 'xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filePath: '/tmp/history-2.xlsx',
      createdAt: new Date().toISOString(),
    };
    historyMock.register.mockReturnValue(record);
    historyMock.getDownloadFileName.mockReturnValue('Relatorio_clientes_history-2.xlsx');

    const res = responseFactory();

    await AdminDashboardReportController.downloadReport(
      {
        params: { reportType: 'clientes', format: 'xlsx' },
        query: { identification: '00.111.222/0001-33' },
      } as any,
      res,
    );

    expect(xlsxGenerateMock).toHaveBeenCalledWith('clientes', {
      months: undefined,
      period: undefined,
      identification: '00.111.222/0001-33',
    });
    expect(historyMock.register).toHaveBeenCalledWith(
      expect.objectContaining({
        reportType: 'clientes',
        format: 'xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', record.mimeType);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('Relatorio_clientes_history-2.xlsx'));
    expect(res.send).toHaveBeenCalledWith(buffer);
  });

  it('retorna 500 quando ocorre erro na geração', async () => {
    pdfGenerateMock.mockRejectedValue(new Error('fail'));
    const res = responseFactory();

    await AdminDashboardReportController.downloadReport(
      {
        params: { reportType: 'gerencial', format: 'pdf' },
        query: {},
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Não foi possível gerar o relatório solicitado.' });
  });

  it('lista histórico de relatórios com formatos diferentes', async () => {
    historyMock.list.mockReturnValue({
      items: [
        {
          id: 'history-1',
          title: 'Relatório Gerencial Teste',
          reportType: 'gerencial',
          format: 'pdf',
          extension: 'pdf',
          mimeType: 'application/pdf',
          identification: '00.111.222/0001-33',
          filePath: '/tmp/history-1.pdf',
          createdAt: '2025-11-11T19:32:55.739Z',
          period: '10/2025',
          responsible: 'Maria',
          notes: 'Auditoria',
          filters: { period: '10/2025' },
        },
        {
          id: 'history-2',
          title: 'Relatório Clientes',
          reportType: 'clientes',
          format: 'xlsx',
          extension: 'xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          filePath: '/tmp/history-2.xlsx',
          createdAt: '2025-11-12T10:00:00.000Z',
        },
      ],
      pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
    });

    const res = responseFactory();

    await AdminDashboardReportController.listHistory({ query: {} } as any, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          id: 'history-1',
          formato: 'pdf',
          downloadUrl: '/api/dashboard/admin/reports/history/history-1/download',
          arquivoPdf: '/api/dashboard/admin/reports/history/history-1/download',
        }),
        expect.objectContaining({
          id: 'history-2',
          formato: 'xlsx',
          downloadUrl: '/api/dashboard/admin/reports/history/history-2/download',
          arquivoXlsx: '/api/dashboard/admin/reports/history/history-2/download',
        }),
      ],
      pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
    });
  });

  it('permite download de relatório do histórico respeitando o formato', async () => {
    const stream = { pipe: jest.fn() } as any;
    historyMock.getRecord.mockReturnValue({
      id: 'history-1',
      title: 'Relatório Gerencial Teste',
      format: 'pdf',
      extension: 'pdf',
      mimeType: 'application/pdf',
    });
    historyMock.getFileStream.mockReturnValue(stream);
    historyMock.getDownloadFileName.mockReturnValue('relatorio-history-1.pdf');

    const res = responseFactory();

    await AdminDashboardReportController.downloadHistory({ params: { id: 'history-1' } } as any, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('relatorio-history-1.pdf'));
    expect(stream.pipe).toHaveBeenCalledWith(res);
  });
});

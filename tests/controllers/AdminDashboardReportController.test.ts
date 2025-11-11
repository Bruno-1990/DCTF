import AdminDashboardReportController from '../../src/controllers/AdminDashboardReportController';
import { AdminReportPdfService } from '../../src/services/AdminReportPdfService';
import AdminReportHistoryService from '../../src/services/AdminReportHistoryService';

jest.mock('../../src/services/AdminReportHistoryService', () => ({
  __esModule: true,
  default: {
    register: jest.fn(),
    list: jest.fn(),
    getRecord: jest.fn(),
    getFileStream: jest.fn(),
  },
}));

describe('AdminDashboardReportController', () => {
  const res = () => {
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

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deve enviar o PDF com os headers adequados', async () => {
     const buffer = Buffer.from('%PDF-1.7 sample');
     jest.spyOn(AdminReportPdfService, 'generateGerencialReport').mockResolvedValue(buffer);
     const response = res();
 
     await AdminDashboardReportController.downloadGerencial({ query: {} } as any, response);
 
    expect(AdminReportPdfService.generateGerencialReport).toHaveBeenLastCalledWith({
      months: undefined,
      period: undefined,
      identification: undefined,
      logoUrl: undefined,
      responsible: undefined,
      notes: undefined,
    });
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Length', buffer.length.toString());
    expect(response.send).toHaveBeenCalledWith(buffer);
  });
 
  it('deve retornar 500 em caso de erro', async () => {
    jest.spyOn(AdminReportPdfService, 'generateGerencialReport').mockRejectedValue(new Error('fail'));
    const response = res();
 
    await AdminDashboardReportController.downloadGerencial({ query: {} } as any, response);
 
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ success: false, error: 'Não foi possível gerar o relatório em PDF.' });
  });

  it('replica parâmetros de filtro para o serviço', async () => {
    const buffer = Buffer.from('%PDF');
    jest.spyOn(AdminReportPdfService, 'generateGerencialReport').mockResolvedValue(buffer);
    const response = res();

    await AdminDashboardReportController.downloadGerencial({ query: { months: '4', period: '2025-09', identification: '11.222.333/0001-44', logoUrl: 'https://example.com/logo.png', responsible: 'João', notes: 'Relatório especial' } } as any, response);

    expect(AdminReportPdfService.generateGerencialReport).toHaveBeenLastCalledWith({
      months: 4,
      period: '2025-09',
      identification: '11.222.333/0001-44',
      logoUrl: 'https://example.com/logo.png',
      responsible: 'João',
      notes: 'Relatório especial',
    });
  });

  it('lista histórico de relatórios gerenciais', async () => {
    (AdminReportHistoryService.list as jest.Mock).mockReturnValue({
      items: [
        {
          id: 'history-1',
          title: 'Relatório Gerencial Teste',
          reportType: 'gerencial',
          identification: '00.111.222/0001-33',
          filePath: '/tmp/history-1.pdf',
          createdAt: '2025-11-11T19:32:55.739Z',
          period: '10/2025',
          responsible: 'Maria',
          notes: 'Auditoria',
          filters: { period: '10/2025' },
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    const response = res();

    await AdminDashboardReportController.listHistory({ query: { page: '1', limit: '10' } } as any, response);

    expect(AdminReportHistoryService.list).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      reportType: undefined,
      identification: undefined,
      period: undefined,
    });
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          id: 'history-1',
          titulo: 'Relatório Gerencial Teste',
          tipoRelatorio: 'gerencial',
          arquivoPdf: '/api/dashboard/admin/reports/history/history-1/download',
        }),
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
  });

  it('permite download de relatório do histórico', async () => {
    const stream = { pipe: jest.fn() } as any;
    (AdminReportHistoryService.getRecord as jest.Mock).mockReturnValue({
      id: 'history-1',
      title: 'Relatório Gerencial Teste',
      filePath: '/tmp/history-1.pdf',
    });
    (AdminReportHistoryService.getFileStream as jest.Mock).mockReturnValue(stream);

    const response = res();

    await AdminDashboardReportController.downloadHistory({ params: { id: 'history-1' } } as any, response);

    expect(AdminReportHistoryService.getRecord).toHaveBeenCalledWith('history-1');
    expect(AdminReportHistoryService.getFileStream).toHaveBeenCalledWith('history-1');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(stream.pipe).toHaveBeenCalledWith(response);
  });
});

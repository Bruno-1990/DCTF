import { AdminReportPdfService } from '../../src/services/AdminReportPdfService';
import type { AdminDashboardSnapshot } from '../../src/services/AdminDashboardService';
import type { DashboardConferenceSummary, DashboardDCTFRecord } from '../../src/types';
import * as AdminDashboardService from '../../src/services/AdminDashboardService';
import * as AdminDashboardConferenceService from '../../src/services/AdminDashboardConferenceService';
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

describe('AdminReportPdfService', () => {
  const snapshotMock: AdminDashboardSnapshot = {
    meta: {
      requiresPassword: false,
      authenticationModes: ['api-key'],
      generatedAt: '2025-11-11T19:32:55.739Z',
      version: '1.2.0',
      notes: 'Uso interno.',
    },
    navigation: {
      routes: [
        { path: '/dashboard#executive-overview', moduleId: 'dashboard-overview', sectionId: 'executive-overview' },
      ],
    },
    architecture: {
      navigation: {
        routes: [
          { path: '/dashboard#executive-overview', moduleId: 'dashboard-overview', sectionId: 'executive-overview' },
        ],
      },
      personaAssignments: { executive: ['dashboard-overview'] },
      access: {
        requiresPassword: false,
        authenticationModes: ['api-key'],
        notes: 'Sem senha.'
      },
      blueprintMeta: {
        version: '1.2.0',
        generatedAt: '2025-11-10T10:00:00.000Z',
      },
    },
    requirements: {
      personas: [
        {
          id: 'executive',
          name: 'Executivo',
          goals: ['Visão geral'],
          keyMetrics: ['pending-balance'],
          authentication: 'api-key',
        },
      ],
      modules: [
        { id: 'dashboard-overview', title: 'Visão geral', description: '', widgets: [] },
      ],
      accessControl: {
        requiresPassword: false,
        authenticationModes: ['api-key'],
        notes: 'Sem senha.',
      },
    },
    metrics: {
      totals: {
        declarations: 12,
        byPeriod: { '09/2025': 4, '10/2025': 8 },
        byType: { original: 10, retificadora: 2 },
        byOrigin: { mit: 6, reinf: 6 },
      },
      financial: {
        debitTotal: 50000,
        balanceTotal: 12500,
        balanceRatio: 0.25,
        averageBalance: 1041.67,
        balanceByIdentification: [
          { identification: '00.111.222/0001-33', businessName: 'Empresa Alfa', balance: 6000 },
          { identification: '11.222.333/0001-44', businessName: 'Empresa Beta', balance: 3500 },
        ],
      },
      operations: {
        transmissionsByDate: { '2025-10-15': 4 },
        zeroMovementCount: 1,
        retificationRate: 0.16,
      },
      statusSummary: {
        delivered: 7,
        received: 3,
        inProgress: 1,
        errors: 1,
        total: 12,
      },
      alerts: [
        {
          type: 'pending_balance',
          severity: 'high',
          identification: '00.111.222/0001-33',
          businessName: 'Empresa Alfa',
          period: '10/2025',
          message: 'Saldo a pagar pendente para Empresa Alfa.',
          context: { balance: 4500 },
        },
        {
          type: 'processing',
          severity: 'medium',
          identification: '11.222.333/0001-44',
          businessName: 'Empresa Beta',
          period: '10/2025',
          message: 'Declaração ainda em processamento.',
          context: {},
        },
      ],
    },
  };

  const conferencesMock: DashboardConferenceSummary = {
    generatedAt: '2025-11-11T19:32:55.739Z',
    rules: {
      dueDate: [
        {
          id: 'issue-1',
          rule: 'due_date',
          identification: '00.111.222/0001-33',
          businessName: 'Empresa Alfa',
          period: '09/2025',
          dueDate: '2025-11-15T00:00:00.000Z',
          transmissionDate: '2025-11-20T00:00:00.000Z',
          status: 'concluido',
          severity: 'high',
          daysLate: 5,
          message: 'Entrega fora do prazo legal (atraso de 5 dias).',
          details: { deliveredAt: '2025-11-20T00:00:00.000Z' },
        },
        {
          id: 'issue-2',
          rule: 'due_date',
          identification: '11.222.333/0001-44',
          businessName: 'Empresa Beta',
          period: '10/2025',
          dueDate: '2025-12-15T00:00:00.000Z',
          transmissionDate: undefined,
          status: 'pendente',
          severity: 'medium',
          message: 'Prazo final em 30 dias (necessário transmitir).',
          details: {},
        },
      ],
    },
  };

  const rawRecords: DashboardDCTFRecord[] = [
    {
      identificationType: 'CNPJ',
      identification: '00.111.222/0001-33',
      businessName: 'Empresa Alfa',
      period: '10/2025',
      transmissionDate: '2025-11-19T00:00:00.000Z',
      category: 'Geral',
      origin: 'MIT',
      declarationType: 'Original',
      situation: 'Ativa',
      status: 'concluido',
      debitAmount: 1000,
      balanceDue: 500,
    },
    {
      identificationType: 'CNPJ',
      identification: '11.222.333/0001-44',
      businessName: 'Empresa Beta',
      period: '09/2025',
      transmissionDate: '2025-10-05T00:00:00.000Z',
      category: 'Geral',
      origin: 'REINF',
      declarationType: 'Retificadora',
      situation: 'Em andamento',
      status: 'pendente',
      debitAmount: 2000,
      balanceDue: 800,
    },
  ];

  beforeEach(() => {
    jest.spyOn(AdminDashboardService, 'fetchAdminDashboardRecords').mockResolvedValue(rawRecords);
    jest.spyOn(AdminDashboardService, 'buildAdminDashboardSnapshot').mockReturnValue(snapshotMock);
    jest.spyOn(AdminDashboardConferenceService, 'getConferenceSummary').mockResolvedValue(conferencesMock);
    jest.spyOn(AdminReportPdfService as any, 'loadLogoBuffer').mockResolvedValue(null);
    (AdminReportHistoryService.register as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('gera um buffer PDF iniciando com o header correto', async () => {
    const buffer = await AdminReportPdfService.generateGerencialReport({ months: 6, title: 'Relatório Teste' });
    expect(buffer.byteLength).toBeGreaterThan(5000);
    expect(buffer.slice(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('respeita filtros de meses, período e CNPJ ao buscar os dados', async () => {
    jest.spyOn(AdminDashboardService, 'buildAdminDashboardSnapshot');

    await AdminReportPdfService.generateGerencialReport({ months: 3, period: '10/2025', identification: '00.111.222/0001-33', logoUrl: 'https://example.com/logo.png', responsible: 'Maria Fiscal', notes: 'Gerado para auditoria interna' });

    expect(AdminDashboardService.fetchAdminDashboardRecords).toHaveBeenCalledWith(3);
    expect(AdminDashboardConferenceService.getConferenceSummary).toHaveBeenCalledWith(3);
    expect(AdminDashboardService.buildAdminDashboardSnapshot).toHaveBeenCalledWith({
      records: [
        expect.objectContaining({ identification: '00.111.222/0001-33', period: '10/2025' }),
      ],
    });
    expect((AdminReportPdfService as any).loadLogoBuffer).toHaveBeenCalledWith('https://example.com/logo.png');
    expect(AdminReportHistoryService.register).toHaveBeenCalledWith(expect.objectContaining({
      reportType: 'gerencial',
      identification: '00.111.222/0001-33',
      period: '10/2025',
    }));
  });
});

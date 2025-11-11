import { getConferenceSummary } from '../../src/services/AdminDashboardConferenceService';
import * as AdminDashboardService from '../../src/services/AdminDashboardService';
import { DashboardDCTFRecord } from '../../src/types';

jest.mock('../../src/services/AdminDashboardService');

describe('AdminDashboardConferenceService', () => {
  const mockRecords: DashboardDCTFRecord[] = [
    {
      identificationType: 'CNPJ',
      identification: '11.111.111/0001-11',
      businessName: 'Empresa Exemplo',
      period: '08/2025',
      transmissionDate: undefined,
      category: 'Geral',
      origin: 'eSocial',
      declarationType: 'Original',
      situation: 'Ativa',
      status: 'pendente',
      debitAmount: '0,00',
      balanceDue: '0,00',
    },
    {
      identificationType: 'CNPJ',
      identification: '22.222.222/0001-22',
      businessName: 'Empresa Pontual',
      period: '08/2025',
      transmissionDate: '2025-10-10T12:00:00.000Z',
      category: 'Geral',
      origin: 'MIT',
      declarationType: 'Original',
      situation: 'Ativa',
      status: 'concluido',
      debitAmount: '100,00',
      balanceDue: '0,00',
    },
    {
      identificationType: 'CNPJ',
      identification: '33.333.333/0001-33',
      businessName: 'Empresa Atrasada',
      period: '07/2025',
      transmissionDate: '2025-09-25T12:00:00.000Z',
      category: 'Geral',
      origin: 'MIT',
      declarationType: 'Original',
      situation: 'Ativa',
      status: 'concluido',
      debitAmount: '200,00',
      balanceDue: '0,00',
    },
  ];

  beforeEach(() => {
    jest.spyOn(AdminDashboardService, 'fetchAdminDashboardRecords').mockResolvedValue(mockRecords);
    jest.useFakeTimers().setSystemTime(new Date('2025-10-10T12:00:00Z'));
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  it('deve identificar declarações próximas ao vencimento e atrasadas', async () => {
    const summary = await getConferenceSummary(6);

    expect(summary.rules.dueDate).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identification: '11.111.111/0001-11',
          businessName: 'Empresa Exemplo',
          severity: 'medium',
          rule: 'due_date',
        }),
        expect.objectContaining({
          identification: '33.333.333/0001-33',
          severity: 'high',
          rule: 'due_date',
        }),
      ])
    );
  });

  it('não gera alertas quando entregue no prazo', async () => {
    const summary = await getConferenceSummary(6);
    const punctualIssues = summary.rules.dueDate.filter(issue => issue.identification === '22.222.222/0001-22');
    expect(punctualIssues.length).toBe(0);
  });
});

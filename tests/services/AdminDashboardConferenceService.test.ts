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

  it('marca como grave a competência vencida sem entrega', async () => {
    // Empresa Exemplo: competência 08/2025 (vence 30/09), sem transmissão, e
    // "hoje" é 10/10 — 10 dias de atraso. A regra é `daysUntilDue < 0 → high`.
    //
    // O teste exigia 'medium' aqui, o que nunca poderia acontecer: 'medium' é
    // reservado para quem ainda está DENTRO do prazo, faltando até 5 dias
    // (DAYS_BEFORE_DEADLINE_MEDIUM). Uma declaração vencida em 'medium' seria
    // um alerta mais fraco do que a situação merece.
    const summary = await getConferenceSummary(6);

    expect(summary.rules.dueDate).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identification: '11.111.111/0001-11',
          businessName: 'Empresa Exemplo',
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

  it('não gera alerta de prazo para declaração já entregue, mesmo em atraso', async () => {
    // Empresa Atrasada: competência 07/2025 entregue em 25/09, depois do
    // vencimento (31/08). O serviço NÃO aponta — a regra de entrega fora do
    // prazo foi removida de propósito (ver o comentário "removida lógica de
    // entrega fora do prazo" em getConferenceSummary): a régua de prazo trata
    // do que ainda falta entregar, não do histórico de atrasos.
    //
    // ⚠️ Este teste antes exigia o oposto — era o último vestígio da regra
    // removida. Se a detecção de entrega em atraso voltar a ser desejada, ela
    // precisa de regra própria, e não de um remendo na régua de prazo.
    const summary = await getConferenceSummary(6);
    const atrasadas = summary.rules.dueDate.filter(
      issue => issue.identification === '33.333.333/0001-33',
    );

    expect(atrasadas).toHaveLength(0);
  });
});

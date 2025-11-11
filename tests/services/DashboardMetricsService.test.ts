import { DashboardMetricsService } from '../../src/services/DashboardMetricsService';
import { DashboardDCTFRecord } from '../../src/types';

describe('DashboardMetricsService', () => {
  const sampleData: DashboardDCTFRecord[] = [
    {
      identificationType: 'CNPJ',
      identification: '49.000.000/0001-00',
      period: '05/2025',
      transmissionDate: '23/06/2025 10:00:00',
      category: 'Geral',
      origin: 'eSocial',
      declarationType: 'Original',
      situation: 'Ativa',
      debitAmount: '10.000,00',
      balanceDue: '5.000,00',
    },
    {
      identificationType: 'CNPJ',
      identification: '49.000.000/0001-00',
      period: '07/2025',
      transmissionDate: '22/08/2025 09:15:00',
      category: 'Geral',
      origin: 'eSocial, REINF RET',
      declarationType: 'Retificadora',
      situation: 'Ativa',
      debitAmount: '8.000,00',
      balanceDue: '2.000,00',
    },
    {
      identificationType: 'CNPJ',
      identification: '49.000.000/0001-00',
      period: '08/2025',
      transmissionDate: '21/09/2025 17:00:00',
      category: 'Geral',
      origin: 'eSocial',
      declarationType: 'Original',
      situation: 'Ativa',
      debitAmount: '0,00',
      balanceDue: '0,00',
    },
    {
      identificationType: 'CNPJ',
      identification: '49.000.000/0001-00',
      period: '09/2025',
      transmissionDate: '25/09/2025 15:30:00',
      category: 'Geral',
      origin: 'eSocial',
      declarationType: 'Retificadora',
      situation: 'Em andamento',
      debitAmount: '9.500,00',
      balanceDue: '1.000,00',
    },
    {
      identificationType: 'CNPJ',
      identification: '11.111.111/0001-11',
      period: '05/2025',
      transmissionDate: '15/06/2025 08:00:00',
      category: 'Geral',
      origin: 'eSocial',
      declarationType: 'Original',
      situation: 'Ativa',
      debitAmount: '2.000,00',
      balanceDue: '0,00',
    },
    {
      identificationType: 'CNPJ',
      identification: '11.111.111/0001-11',
      period: '06/2025',
      transmissionDate: '16/07/2025 09:10:00',
      category: 'Geral',
      origin: 'eSocial',
      declarationType: 'Original',
      situation: 'Ativa',
      debitAmount: '2.500,00',
      balanceDue: '0,00',
    },
    {
      identificationType: 'CNPJ',
      identification: '11.111.111/0001-11',
      period: '07/2025',
      transmissionDate: '17/08/2025 13:45:00',
      category: 'Geral',
      origin: 'eSocial',
      declarationType: 'Original sem movimento',
      situation: 'Ativa',
      debitAmount: '0,00',
      balanceDue: '0,00',
    },
    {
      identificationType: 'CNPJ',
      identification: '11.111.111/0001-11',
      period: '08/2025',
      transmissionDate: '22/09/2025 07:22:00',
      category: 'Geral',
      origin: 'eSocial, REINF RET',
      declarationType: 'Retificadora',
      situation: 'Ativa',
      debitAmount: '3.000,00',
      balanceDue: '1.500,00',
    },
    {
      identificationType: 'CNPJ',
      identification: '11.111.111/0001-11',
      period: '09/2025',
      transmissionDate: '26/09/2025 11:20:00',
      category: 'Geral',
      origin: 'eSocial',
      declarationType: 'Retificadora',
      situation: 'Ativa',
      debitAmount: '3.100,00',
      balanceDue: '0,00',
    },
  ];

  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2025-10-01T12:00:00Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('deve calcular métricas agregadas básicas', () => {
    const metrics = DashboardMetricsService.buildMetrics(sampleData);

    expect(metrics.totals.declarations).toBe(sampleData.length);
    expect(metrics.totals.byPeriod['05/2025']).toBe(2);
    expect(metrics.totals.byType['retificadora']).toBe(4);
    expect(metrics.totals.byOrigin['esocial']).toBeGreaterThan(0);

    expect(metrics.financial.debitTotal).toBeCloseTo(38_100, 2);
    expect(metrics.financial.balanceTotal).toBeCloseTo(9_500, 2);
    expect(metrics.financial.balanceRatio).toBeCloseTo(9_500 / 38_100, 5);
    expect(metrics.financial.balanceByIdentification[0].identification).toBe('49.000.000/0001-00');

    expect(metrics.operations.zeroMovementCount).toBe(1);
    expect(metrics.operations.retificationRate).toBeCloseTo(4 / sampleData.length, 5);
    expect(Object.values(metrics.operations.transmissionsByDate).length).toBeGreaterThan(0);
  });

  it('deve gerar alertas de risco e severidade', () => {
    const metrics = DashboardMetricsService.buildMetrics(sampleData);
    const { alerts } = metrics;

    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'missing_period',
          severity: 'high',
          identification: '49.000.000/0001-00',
          period: '06/2025',
        }),
        expect.objectContaining({
          type: 'pending_balance',
          severity: 'high',
          identification: '49.000.000/0001-00',
          period: '05/2025',
        }),
        expect.objectContaining({
          type: 'zero_debit',
          severity: 'medium',
          identification: '49.000.000/0001-00',
          period: '08/2025',
        }),
        expect.objectContaining({
          type: 'retification_series',
          identification: '11.111.111/0001-11',
          severity: 'medium',
        }),
        expect.objectContaining({
          type: 'processing',
          identification: '49.000.000/0001-00',
          period: '09/2025',
        }),
      ])
    );
  });
});


import { buildAdminDashboardSnapshot } from '../../src/services/AdminDashboardService';

jest.mock('../../src/services/AdminDashboardRequirements', () => ({
  buildAdminDashboardRequirements: () => ({
    personas: [
      { id: 'executive', authentication: 'api-key' },
    ],
    modules: [
      { id: 'dashboard-overview', title: 'Visão Geral', description: '', widgets: [] },
    ],
    accessControl: {
      requiresPassword: false,
      authenticationModes: ['api-key'],
      notes: 'sem senha',
    },
  }),
}));

jest.mock('../../src/services/DashboardLayoutBlueprint', () => ({
  buildDashboardBlueprint: () => ({
    meta: { version: '1.0.0', generatedAt: '2025-11-11T00:00:00Z', source: 'test' },
    sections: [
      { id: 'executive-overview', title: 'Executive', description: '', widgets: [] },
    ],
  }),
}));

jest.mock('../../src/services/DashboardMetricsService', () => ({
  DashboardMetricsService: {
    buildMetrics: jest.fn().mockReturnValue({
      totals: { declarations: 10, byPeriod: {}, byType: {}, byOrigin: {} },
      financial: {
        debitTotal: 1000,
        balanceTotal: 500,
        balanceRatio: 0.5,
        averageBalance: 50,
        balanceByIdentification: [],
      },
      operations: { transmissionsByDate: {}, zeroMovementCount: 0, retificationRate: 0 },
      statusSummary: { delivered: 6, received: 3, inProgress: 1, errors: 1, total: 10 },
      alerts: [],
    }),
  },
}));

jest.mock('../../src/services/AdminDashboardArchitecture', () => ({
  buildAdminDashboardArchitecture: () => ({
    navigation: { routes: [{ path: '/dashboard', moduleId: 'dashboard-overview', sectionId: 'executive-overview' }] },
    personaAssignments: { executive: ['dashboard-overview'] },
    access: { requiresPassword: false, authenticationModes: ['api-key'], notes: 'sem senha' },
    blueprintMeta: { version: '1.0.0', generatedAt: '2025-11-11T00:00:00Z' },
  }),
}));

describe('AdminDashboardService', () => {
  it('deve montar o snapshot do painel administrativo com métricas e arquitetura', () => {
    const snapshot = buildAdminDashboardSnapshot({
      records: [],
    });

    expect(snapshot.meta.requiresPassword).toBe(false);
    expect(snapshot.navigation.routes[0].path).toBe('/dashboard');
    expect(snapshot.metrics.financial.balanceTotal).toBe(500);
  });
});

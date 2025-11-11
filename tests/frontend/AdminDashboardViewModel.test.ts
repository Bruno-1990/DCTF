jest.mock('../../src/services/AdminDashboardService', () => ({
  buildAdminDashboardSnapshot: () => ({
    meta: {
      requiresPassword: false,
      authenticationModes: ['api-key'],
      generatedAt: '2025-11-11T00:00:00Z',
      version: '1.0.0',
    },
    navigation: {
      routes: [{ path: '/dashboard', moduleId: 'dashboard-overview', sectionId: 'executive-overview' }],
    },
    metrics: {
      totals: { declarations: 5, byPeriod: {}, byType: {}, byOrigin: {} },
      financial: {
        debitTotal: 100,
        balanceTotal: 50,
        balanceRatio: 0.5,
        averageBalance: 25,
        balanceByIdentification: [],
      },
      operations: { transmissionsByDate: {}, zeroMovementCount: 0, retificationRate: 0 },
      statusSummary: { delivered: 3, received: 1, inProgress: 1, errors: 1, total: 5 },
      alerts: [],
    },
    architecture: {
      navigation: { routes: [{ path: '/dashboard', moduleId: 'dashboard-overview', sectionId: 'executive-overview' }] },
      personaAssignments: { executive: ['dashboard-overview'] },
      access: { requiresPassword: false, authenticationModes: ['api-key'], notes: 'sem senha' },
      blueprintMeta: { version: '1.0.0', generatedAt: '2025-11-11T00:00:00Z' },
    },
    requirements: {
      personas: [{ id: 'executive', name: 'Gestor', authentication: 'api-key' }],
      modules: [{ id: 'dashboard-overview', title: 'Visão Geral', description: '', widgets: [] }],
      accessControl: { requiresPassword: false, authenticationModes: ['api-key'], notes: 'sem senha' },
    },
  }),
}));

import { createAdminDashboardViewModel } from '../../src/frontend/buildAdminDashboardViewModel';

describe('AdminDashboardViewModel', () => {
  it('deve construir o view model com navegação e métricas para o frontend', () => {
    const viewModel = createAdminDashboardViewModel();

    expect(viewModel.meta.requiresPassword).toBe(false);
    expect(viewModel.navigation[0]).toEqual({
      href: '/dashboard',
      moduleId: 'dashboard-overview',
      sectionId: 'executive-overview',
    });
    expect(viewModel.cards.length).toBeGreaterThan(0);
  });
});


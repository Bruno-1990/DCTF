import { buildAdminDashboardArchitecture } from '../../src/services/AdminDashboardArchitecture';

jest.mock('../../src/services/AdminDashboardRequirements', () => ({
  buildAdminDashboardRequirements: () => ({
    personas: [
      { id: 'executive', authentication: 'api-key' },
      { id: 'fiscal-analyst', authentication: 'api-key' },
    ],
    modules: [
      { id: 'dashboard-overview', title: 'Visão Geral', description: '', widgets: [] },
      { id: 'alerts-management', title: 'Alertas', description: '', widgets: [] },
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
      { id: 'executive-overview', title: 'Seção Executive', description: '', widgets: [] },
      { id: 'alerts-and-risk', title: 'Seção Alertas', description: '', widgets: [] },
    ],
  }),
}));

describe('AdminDashboardArchitecture', () => {
  it('deve relacionar módulos aos componentes do blueprint sem exigir senha', () => {
    const architecture = buildAdminDashboardArchitecture();

    expect(architecture.navigation.routes).toEqual([
      { path: '/dashboard', moduleId: 'dashboard-overview', sectionId: 'executive-overview' },
      { path: '/alerts', moduleId: 'alerts-management', sectionId: 'alerts-and-risk' },
    ]);

    expect(architecture.access.requiresPassword).toBe(false);
    expect(architecture.personaAssignments['executive']).toContain('dashboard-overview');
  });
});

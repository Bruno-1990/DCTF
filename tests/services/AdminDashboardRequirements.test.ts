import { buildAdminDashboardRequirements } from '../../src/services/AdminDashboardRequirements';

describe('AdminDashboardRequirements', () => {
  it('deve mapear personas e módulos principais sem fluxo de senha', () => {
    const requirements = buildAdminDashboardRequirements();

    expect(requirements.personas.map(persona => persona.id)).toEqual([
      'executive',
      'fiscal-analyst',
      'controller',
      'compliance',
    ]);

    requirements.personas.forEach(persona => {
      expect(persona.authentication).toBe('api-key');
    });

    const moduleIds = requirements.modules.map(module => module.id);
    expect(moduleIds).toEqual([
      'dashboard-overview',
      'obligation-tracking',
      'financial-monitoring',
      'alerts-management',
      'configuration',
    ]);

    const authOptions = requirements.accessControl;
    expect(authOptions.requiresPassword).toBe(false);
    expect(authOptions.authenticationModes).toContain('api-key');
  });
});

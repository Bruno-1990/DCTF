import { buildDashboardBlueprint } from '../../src/services/DashboardLayoutBlueprint';

describe('DashboardLayoutBlueprint', () => {
  it('deve definir seções principais para o protótipo', () => {
    const blueprint = buildDashboardBlueprint();

    expect(blueprint.sections.map(section => section.id)).toEqual([
      'executive-overview',
      'obligation-tracking',
      'financial-view',
      'alerts-and-risk',
      'realtime-events',
    ]);

    const alertsSection = blueprint.sections.find(section => section.id === 'alerts-and-risk');
    expect(alertsSection?.widgets.some(widget => widget.type === 'alert-table')).toBe(true);

    const realtimeSection = blueprint.sections.find(section => section.id === 'realtime-events');
    expect(realtimeSection?.integration?.websocket?.events).toEqual([
      'analysis.completed',
      'flags.created',
      'flags.updated',
    ]);
  });
});

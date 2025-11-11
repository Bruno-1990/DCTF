import { buildAdminDashboardRequirements } from './AdminDashboardRequirements';
import { buildDashboardBlueprint } from './DashboardLayoutBlueprint';

export interface ArchitectureNavigationRoute {
  path: string;
  moduleId: string;
  sectionId: string;
  title?: string;
}

export interface AdminDashboardArchitecture {
  navigation: {
    routes: ArchitectureNavigationRoute[];
  };
  personaAssignments: Record<string, string[]>;
  access: {
    requiresPassword: boolean;
    authenticationModes: string[];
    notes: string;
  };
  blueprintMeta: {
    version: string;
    generatedAt: string;
  };
}

const SECTION_MAPPINGS: Record<string, string> = {
  'dashboard-overview': 'executive-overview',
  'obligation-tracking': 'obligation-tracking',
  'financial-monitoring': 'financial-view',
  'alerts-management': 'alerts-and-risk',
  configuration: 'realtime-events',
};

function mapModuleToSection(moduleId: string, availableSectionIds: string[]): string {
  const mapped = SECTION_MAPPINGS[moduleId];
  if (mapped && availableSectionIds.includes(mapped)) {
    return mapped;
  }
  return availableSectionIds[0];
}

function buildRoutePath(moduleId: string): string {
  if (moduleId === 'dashboard-overview') {
    return '/dashboard#executive-overview';
  }
  if (moduleId === 'alerts-management') {
    return '/dashboard#alerts-and-risk';
  }
  if (moduleId === 'obligation-tracking') {
    return '/dashboard#obligation-tracking';
  }
  if (moduleId === 'financial-monitoring') {
    return '/dashboard#financial-monitoring';
  }
  if (moduleId === 'configuration') {
    return '/dashboard#configuration';
  }
  return '/dashboard';
}

export function buildAdminDashboardArchitecture(): AdminDashboardArchitecture {
  const requirements = buildAdminDashboardRequirements();
  const blueprint = buildDashboardBlueprint();
  const availableSectionIds = blueprint.sections.map(section => section.id);

  const routes: ArchitectureNavigationRoute[] = requirements.modules.map(module => ({
    path: buildRoutePath(module.id),
    moduleId: module.id,
    sectionId: mapModuleToSection(module.id, availableSectionIds),
  }));

  const personaAssignments = requirements.personas.reduce<Record<string, string[]>>((acc, persona) => {
    acc[persona.id] = requirements.modules.map(module => module.id);
    return acc;
  }, {});

  return {
    navigation: {
      routes,
    },
    personaAssignments,
    access: {
      requiresPassword: requirements.accessControl.requiresPassword,
      authenticationModes: requirements.accessControl.authenticationModes,
      notes: requirements.accessControl.notes,
    },
    blueprintMeta: {
      version: blueprint.meta.version,
      generatedAt: blueprint.meta.generatedAt,
    },
  };
}






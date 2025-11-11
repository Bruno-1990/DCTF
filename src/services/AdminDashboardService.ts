import { DashboardDCTFRecord, DashboardMetrics } from '../types';
import { DashboardMetricsService } from './DashboardMetricsService';
import { buildAdminDashboardRequirements } from './AdminDashboardRequirements';
import { buildAdminDashboardArchitecture } from './AdminDashboardArchitecture';

export interface AdminDashboardSnapshot {
  meta: {
    requiresPassword: boolean;
    authenticationModes: string[];
    generatedAt: string;
    version: string;
    notes?: string;
  };
  navigation: ReturnType<typeof buildAdminDashboardArchitecture>['navigation'];
  metrics: DashboardMetrics;
  architecture: ReturnType<typeof buildAdminDashboardArchitecture>;
  requirements: ReturnType<typeof buildAdminDashboardRequirements>;
}

export interface BuildAdminDashboardSnapshotOptions {
  records: DashboardDCTFRecord[];
}

export function buildAdminDashboardSnapshot(
  options: BuildAdminDashboardSnapshotOptions
): AdminDashboardSnapshot {
  const requirements = buildAdminDashboardRequirements();
  const architecture = buildAdminDashboardArchitecture();
  const metrics = DashboardMetricsService.buildMetrics(options.records);

  return {
    meta: {
      requiresPassword: architecture.access.requiresPassword,
      authenticationModes: architecture.access.authenticationModes,
      generatedAt: new Date().toISOString(),
      version: architecture.blueprintMeta.version,
      notes: architecture.access.notes,
    },
    navigation: architecture.navigation,
    metrics,
    architecture,
    requirements,
  };
}

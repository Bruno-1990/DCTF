import { buildAdminDashboardSnapshot } from '../../src/services/AdminDashboardService';

export interface DashboardCard {
  id: string;
  label: string;
  value: number;
  format?: 'currency' | 'integer' | 'percentage';
}

export interface AdminDashboardViewModel {
  meta: {
    requiresPassword: boolean;
    authenticationModes: string[];
  };
  navigation: Array<{ href: string; moduleId: string; sectionId: string }>;
  cards: DashboardCard[];
  snapshotGeneratedAt: string;
}

export function createAdminDashboardViewModel(): AdminDashboardViewModel {
  const snapshot = buildAdminDashboardSnapshot({ records: [] });

  const navigation = snapshot.navigation.routes.map(route => ({
    href: route.path,
    moduleId: route.moduleId,
    sectionId: route.sectionId,
  }));

  const cards: DashboardCard[] = [
    {
      id: 'total-declarations',
      label: 'Declarações monitoradas',
      value: snapshot.metrics.totals.declarations,
      format: 'integer',
    },
    {
      id: 'balance-total',
      label: 'Saldo pendente',
      value: snapshot.metrics.financial.balanceTotal,
      format: 'currency',
    },
  ];

  return {
    meta: {
      requiresPassword: snapshot.meta.requiresPassword,
      authenticationModes: snapshot.meta.authenticationModes,
    },
    navigation,
    cards,
    snapshotGeneratedAt: snapshot.meta.generatedAt,
  };
}

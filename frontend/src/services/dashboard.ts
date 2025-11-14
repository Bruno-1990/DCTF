import api from "./api";

export interface AdminDashboardRoute {
  path: string;
  moduleId: string;
  sectionId: string;
}

export interface AdminDashboardSnapshotResponse {
  meta: {
    requiresPassword: boolean;
    authenticationModes: string[];
    generatedAt: string;
    version: string;
    notes?: string;
  };
  navigation: {
    routes: AdminDashboardRoute[];
  };
  metrics: {
    totals: {
      declarations: number;
      byPeriod: Record<string, number>;
      byPeriodApuracao?: Record<string, number>;
      byType: Record<string, number>;
      byOrigin: Record<string, number>;
    };
    financial: {
      debitTotal: number;
      balanceTotal: number;
      balanceRatio: number;
      averageBalance: number;
      balanceByIdentification: Array<{ identification: string; businessName?: string; balance: number }>;
    };
    operations: {
      transmissionsByDate: Record<string, number>;
      zeroMovementCount: number;
      retificationRate: number;
    };
    statusSummary: {
      delivered: number;
      received: number;
      inProgress: number;
      errors: number;
      total: number;
    };
    alerts: Array<{
      type: string;
      severity: "low" | "medium" | "high";
      identification: string;
      businessName?: string;
      period?: string;
      message: string;
    }>;
  };
}

export async function fetchAdminDashboardSnapshot(months = 5): Promise<AdminDashboardSnapshotResponse> {
  const response = await api.get<AdminDashboardSnapshotResponse>("/dashboard/admin/snapshot", {
    params: { months },
  });
  return response.data;
}

export type AdminDashboardSnapshot = AdminDashboardSnapshotResponse;
export { fetchAdminDashboardSnapshot as fetchAdminDashboardSnapshotResponse };

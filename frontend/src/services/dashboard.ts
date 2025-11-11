import api from "./api";

export interface AdminDashboardRoute {
  href: string;
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
      byType: Record<string, number>;
      byOrigin: Record<string, number>;
    };
    financial: {
      debitTotal: number;
      balanceTotal: number;
      balanceRatio: number;
      averageBalance: number;
      balanceByIdentification: Array<{ identification: string; balance: number }>;
    };
    operations: {
      transmissionsByDate: Record<string, number>;
      zeroMovementCount: number;
      retificationRate: number;
    };
    alerts: Array<{
      type: string;
      severity: "low" | "medium" | "high";
      identification: string;
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
\nexport type AdminDashboardSnapshot = AdminDashboardSnapshotResponse;\nexport { fetchAdminDashboardSnapshot as fetchAdminDashboardSnapshotResponse };\n

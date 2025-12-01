import api from "./api";

export type TrendType = 'up' | 'down' | 'stable';

export interface TrendMetric {
  value: number;
  change: number;
  trend: TrendType;
}

export interface EnhancedDashboardData {
  meta: {
    generatedAt: string;
    period: string;
    filters?: {
      period?: string;
      status?: string;
      clientId?: string;
    };
  };
  
  hero: {
    totalDeclarations: TrendMetric;
    totalBalance: TrendMetric;
    criticalAlerts: TrendMetric;
    validCertificates: TrendMetric;
    completionRate: TrendMetric;
    activeClients: TrendMetric;
  };
  
  financial: {
    evolution: Array<{
      period: string;
      debitAmount: number;
      balanceDue: number;
    }>;
    topClients: Array<{
      clientId: string;
      businessName: string;
      cnpj: string;
      balanceDue: number;
      pendingDeclarations: number;
    }>;
  };
  
  sitf: {
    totalConsultations: number;
    validCertificates: number;
    expiredCertificates: number;
    activeProtocols: number;
    certificateTypes: {
      positiva: number;
      negativa: number;
      positivaComEfeitos: number;
    };
    topExpired: Array<{
      cnpj: string;
      businessName: string;
      expirationDate: string;
      daysUntilExpiration: number;
    }>;
  };
  
  comparisons: {
    currentPeriod: {
      declarations: number;
      balance: number;
      completionRate: number;
      alerts: number;
    };
    previousPeriod: {
      declarations: number;
      balance: number;
      completionRate: number;
      alerts: number;
    };
    variations: {
      declarations: number;
      balance: number;
      completionRate: number;
      alerts: number;
    };
  };
  
  alerts: {
    critical: Array<{
      type: string;
      severity: 'low' | 'medium' | 'high';
      identification: string;
      businessName?: string;
      period?: string;
      message: string;
    }>;
    byType: Record<string, Array<{
      type: string;
      severity: 'low' | 'medium' | 'high';
      identification: string;
      businessName?: string;
      period?: string;
      message: string;
    }>>;
    newSinceLastVisit: number;
  };
}

export async function fetchEnhancedDashboard(months = 6): Promise<EnhancedDashboardData> {
  const response = await api.get<EnhancedDashboardData>("/dashboard/admin/enhanced", {
    params: { months },
  });
  return response.data;
}


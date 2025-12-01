import { DashboardDCTFRecord } from '../types';
import { DashboardMetricsService } from './DashboardMetricsService';
import { fetchAdminDashboardRecords } from './AdminDashboardService';

export type TrendType = 'up' | 'down' | 'stable';

export interface TrendMetric {
  value: number;
  change: number; // Variação percentual
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
      declarations: number; // %
      balance: number; // %
      completionRate: number; // %
      alerts: number; // %
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

/**
 * Calcula a tendência baseada na variação percentual
 */
function calculateTrend(change: number): TrendType {
  const threshold = 0.5; // 0.5% de variação para considerar mudança significativa
  if (change > threshold) return 'up';
  if (change < -threshold) return 'down';
  return 'stable';
}

/**
 * Calcula métrica com tendência comparando período atual vs anterior
 */
function calculateTrendMetric(
  currentValue: number,
  previousValue: number
): TrendMetric {
  const change = previousValue === 0 
    ? (currentValue > 0 ? 100 : 0)
    : ((currentValue - previousValue) / previousValue) * 100;
  
  return {
    value: currentValue,
    change: Math.round(change * 10) / 10, // Arredondar para 1 casa decimal
    trend: calculateTrend(change),
  };
}

/**
 * Obtém dados do período atual (último mês completo)
 */
function getCurrentPeriod(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { start, end };
}

/**
 * Obtém dados do período anterior (mês anterior completo)
 */
function getPreviousPeriod(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  return { start, end };
}

/**
 * Formata período para string (MM/YYYY)
 */
function formatPeriod(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${year}`;
}

/**
 * Busca métricas SITF do banco de dados
 */
async function fetchSitfMetrics() {
  try {
    // Buscar dados de sitf_extracted_data (MySQL)
    const { executeQuery } = await import('../config/mysql');
    
    const sitfDataResult = await executeQuery<{
      total_consultations: number;
      valid_certificates: number;
      expired_certificates: number;
      positiva_com_efeitos: number;
      positiva: number;
      negativa: number;
    }>(`
      SELECT 
        COUNT(*) as total_consultations,
        SUM(CASE WHEN certidao_data_validade >= CURDATE() THEN 1 ELSE 0 END) as valid_certificates,
        SUM(CASE WHEN certidao_data_validade < CURDATE() THEN 1 ELSE 0 END) as expired_certificates,
        SUM(CASE WHEN certidao_tipo LIKE '%Positiva%' AND certidao_tipo LIKE '%Efeitos%' THEN 1 ELSE 0 END) as positiva_com_efeitos,
        SUM(CASE WHEN certidao_tipo LIKE '%Positiva%' AND (certidao_tipo NOT LIKE '%Efeitos%' OR certidao_tipo IS NULL) THEN 1 ELSE 0 END) as positiva,
        SUM(CASE WHEN certidao_tipo LIKE '%Negativa%' THEN 1 ELSE 0 END) as negativa
      FROM sitf_extracted_data
      WHERE certidao_data_validade IS NOT NULL
    `);
    
    const sitfData = sitfDataResult[0] || {
      total_consultations: 0,
      valid_certificates: 0,
      expired_certificates: 0,
      positiva_com_efeitos: 0,
      positiva: 0,
      negativa: 0,
    };

    // Buscar protocolos ativos (Supabase)
    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    let activeProtocols = 0;
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data } = await supabase
        .from('sitf_protocols')
        .select('id')
        .not('protocolo', 'is', null)
        .gte('expires_at', new Date().toISOString());
      
      activeProtocols = data?.length || 0;
    }

    // Buscar top 5 certidões vencidas ou próximas do vencimento
    const topExpiredResult = await executeQuery<{
      cnpj: string;
      business_name: string | null;
      expiration_date: string;
      days_until_expiration: number;
    }>(`
      SELECT 
        sed.cnpj,
        c.razao_social as business_name,
        sed.certidao_data_validade as expiration_date,
        DATEDIFF(sed.certidao_data_validade, CURDATE()) as days_until_expiration
      FROM sitf_extracted_data sed
      LEFT JOIN clientes c ON c.cnpj_limpo = sed.cnpj
      WHERE sed.certidao_data_validade IS NOT NULL
        AND sed.certidao_data_validade <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
      ORDER BY sed.certidao_data_validade ASC
      LIMIT 5
    `);
    
    const topExpired = topExpiredResult || [];

    return {
      totalConsultations: sitfData.total_consultations || 0,
      validCertificates: sitfData.valid_certificates || 0,
      expiredCertificates: sitfData.expired_certificates || 0,
      activeProtocols,
      certificateTypes: {
        positiva: sitfData.positiva || 0,
        negativa: sitfData.negativa || 0,
        positivaComEfeitos: sitfData.positiva_com_efeitos || 0,
      },
      topExpired: topExpired.map((row) => ({
        cnpj: row.cnpj,
        businessName: row.business_name || 'N/A',
        expirationDate: row.expiration_date,
        daysUntilExpiration: row.days_until_expiration || 0,
      })),
    };
  } catch (error) {
    console.error('[EnhancedDashboard] Erro ao buscar métricas SITF:', error);
    return {
      totalConsultations: 0,
      validCertificates: 0,
      expiredCertificates: 0,
      activeProtocols: 0,
      certificateTypes: {
        positiva: 0,
        negativa: 0,
        positivaComEfeitos: 0,
      },
      topExpired: [],
    };
  }
}

/**
 * Serviço principal para dashboard aprimorado
 */
export class EnhancedDashboardService {
  /**
   * Gera dados completos do dashboard aprimorado
   */
  static async getEnhancedDashboardData(
    months: number = 6
  ): Promise<EnhancedDashboardData> {
    // Buscar registros DCTF
    const records = await fetchAdminDashboardRecords(months);
    const metrics = DashboardMetricsService.buildMetrics(records);

    // Calcular período atual e anterior
    const currentPeriod = getCurrentPeriod();
    const previousPeriod = getPreviousPeriod();

    // Filtrar registros por período
    const currentPeriodRecords = records.filter(record => {
      const periodInfo = parsePeriod(record.period);
      if (!periodInfo) return false;
      const recordDate = new Date(periodInfo.year, periodInfo.month - 1, 1);
      return recordDate >= currentPeriod.start && recordDate <= currentPeriod.end;
    });

    const previousPeriodRecords = records.filter(record => {
      const periodInfo = parsePeriod(record.period);
      if (!periodInfo) return false;
      const recordDate = new Date(periodInfo.year, periodInfo.month - 1, 1);
      return recordDate >= previousPeriod.start && recordDate <= previousPeriod.end;
    });

    // Calcular métricas do período atual
    const currentMetrics = DashboardMetricsService.buildMetrics(currentPeriodRecords);
    const previousMetrics = DashboardMetricsService.buildMetrics(previousPeriodRecords);

    // Calcular taxa de conclusão
    const currentCompletionRate = currentMetrics.statusSummary.total > 0
      ? (currentMetrics.statusSummary.delivered / currentMetrics.statusSummary.total) * 100
      : 0;
    
    const previousCompletionRate = previousMetrics.statusSummary.total > 0
      ? (previousMetrics.statusSummary.delivered / previousMetrics.statusSummary.total) * 100
      : 0;

    // Contar clientes ativos (únicos)
    const activeClientsCurrent = new Set(currentPeriodRecords.map(r => r.identification)).size;
    const activeClientsPrevious = new Set(previousPeriodRecords.map(r => r.identification)).size;

    // Buscar métricas SITF
    const sitfMetrics = await fetchSitfMetrics();

    // Calcular evolução financeira (últimos 6 meses)
    const evolution = calculateFinancialEvolution(records, 6);

    // Top 10 clientes com maior saldo pendente
    const topClientsResolved = metrics.financial.balanceByIdentification
      .slice(0, 10)
      .map((item) => {
        // Buscar número de declarações pendentes
        const pendingCount = records.filter(
          r => r.identification === item.identification && 
          (r.status === 'pendente' || r.status === 'processando')
        ).length;

        return {
          clientId: item.identification,
          businessName: item.businessName || 'N/A',
          cnpj: item.identification,
          balanceDue: item.balance,
          pendingDeclarations: pendingCount,
        };
      });

    // Agrupar alertas por tipo
    const alertsByType: Record<string, typeof metrics.alerts> = {};
    metrics.alerts.forEach(alert => {
      if (!alertsByType[alert.type]) {
        alertsByType[alert.type] = [];
      }
      alertsByType[alert.type].push(alert);
    });

    // Alertas críticos (high e medium)
    const criticalAlerts = metrics.alerts.filter(
      a => a.severity === 'high' || a.severity === 'medium'
    );

    return {
      meta: {
        generatedAt: new Date().toISOString(),
        period: `${months} meses`,
      },
      
      hero: {
        totalDeclarations: calculateTrendMetric(
          metrics.totals.declarations,
          previousMetrics.totals.declarations
        ),
        totalBalance: calculateTrendMetric(
          metrics.financial.balanceTotal,
          previousMetrics.financial.balanceTotal
        ),
        criticalAlerts: calculateTrendMetric(
          criticalAlerts.length,
          previousMetrics.alerts.filter(a => a.severity === 'high' || a.severity === 'medium').length
        ),
        validCertificates: calculateTrendMetric(
          sitfMetrics.validCertificates,
          sitfMetrics.validCertificates // TODO: calcular período anterior para SITF
        ),
        completionRate: calculateTrendMetric(
          currentCompletionRate,
          previousCompletionRate
        ),
        activeClients: calculateTrendMetric(
          activeClientsCurrent,
          activeClientsPrevious
        ),
      },
      
      financial: {
        evolution,
        topClients: topClientsResolved,
      },
      
      sitf: sitfMetrics,
      
      comparisons: {
        currentPeriod: {
          declarations: currentMetrics.totals.declarations,
          balance: currentMetrics.financial.balanceTotal,
          completionRate: currentCompletionRate,
          alerts: criticalAlerts.length,
        },
        previousPeriod: {
          declarations: previousMetrics.totals.declarations,
          balance: previousMetrics.financial.balanceTotal,
          completionRate: previousCompletionRate,
          alerts: previousMetrics.alerts.filter(a => a.severity === 'high' || a.severity === 'medium').length,
        },
        variations: {
          declarations: calculateVariation(
            currentMetrics.totals.declarations,
            previousMetrics.totals.declarations
          ),
          balance: calculateVariation(
            currentMetrics.financial.balanceTotal,
            previousMetrics.financial.balanceTotal
          ),
          completionRate: calculateVariation(
            currentCompletionRate,
            previousCompletionRate
          ),
          alerts: calculateVariation(
            criticalAlerts.length,
            previousMetrics.alerts.filter(a => a.severity === 'high' || a.severity === 'medium').length
          ),
        },
      },
      
      alerts: {
        critical: criticalAlerts,
        byType: alertsByType,
        newSinceLastVisit: 0, // TODO: implementar tracking de última visita
      },
    };
  }
}

/**
 * Calcula evolução financeira dos últimos N meses
 */
function calculateFinancialEvolution(
  records: DashboardDCTFRecord[],
  months: number
): Array<{ period: string; debitAmount: number; balanceDue: number }> {
  const evolution: Array<{ period: string; debitAmount: number; balanceDue: number }> = [];
  const now = new Date();
  
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const periodStr = formatPeriod(date);
    
    // Filtrar registros deste período
    const periodRecords = records.filter(record => {
      const periodInfo = parsePeriod(record.period);
      if (!periodInfo) return false;
      return periodInfo.month === date.getMonth() + 1 && periodInfo.year === date.getFullYear();
    });
    
    const debitAmount = periodRecords.reduce((sum, r) => sum + (Number(r.debitAmount) || 0), 0);
    const balanceDue = periodRecords.reduce((sum, r) => sum + (Number(r.balanceDue) || 0), 0);
    
    evolution.push({
      period: periodStr,
      debitAmount,
      balanceDue,
    });
  }
  
  return evolution;
}

/**
 * Calcula variação percentual
 */
function calculateVariation(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100 * 10) / 10;
}

/**
 * Parse período MM/YYYY ou YYYY-MM
 */
function parsePeriod(period: string): { year: number; month: number } | null {
  if (!period) return null;
  const trimmed = period.trim();
  
  // Formato MM/YYYY
  const monthYear = /^([0-9]{2})\/([0-9]{4})$/.exec(trimmed);
  if (monthYear) {
    return {
      month: Number.parseInt(monthYear[1], 10),
      year: Number.parseInt(monthYear[2], 10),
    };
  }
  
  // Formato YYYY-MM
  const yearMonth = /^([0-9]{4})-([0-9]{2})$/.exec(trimmed);
  if (yearMonth) {
    return {
      year: Number.parseInt(yearMonth[1], 10),
      month: Number.parseInt(yearMonth[2], 10),
    };
  }
  
  return null;
}


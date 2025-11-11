import {
  DashboardAlert,
  DashboardAlertSeverity,
  DashboardAlertType,
  DashboardDCTFRecord,
  DashboardMetrics,
} from '../types';

type NormalizedRecord = {
  identification: string;
  rawIdentification: string;
  identificationType: string;
  period: string;
  periodLabel: string;
  periodDate: Date;
  dueDate: Date;
  transmissionDate?: Date;
  category?: string;
  origins: string[];
  declarationType: string;
  situation?: string;
  debitAmount: number;
  balanceDue: number;
};

const PERIOD_REGEX = /^(\d{2})\/(\d{4})$/;

export class DashboardMetricsService {
  static buildMetrics(records: DashboardDCTFRecord[]): DashboardMetrics {
    const normalized = records
      .map(record => this.normalizeRecord(record))
      .sort((a, b) => a.periodDate.getTime() - b.periodDate.getTime());

    const periods = Array.from(new Set(normalized.map(r => r.period))).sort((a, b) =>
      a.localeCompare(b)
    );

    const totals = this.buildTotals(normalized);
    const financial = this.buildFinancial(normalized);
    const operations = this.buildOperations(normalized);
    const alerts = this.buildAlerts(normalized, periods);

    return {
      totals,
      financial,
      operations,
      alerts,
    };
  }

  private static buildTotals(records: NormalizedRecord[]) {
    const byPeriod = new Map<string, number>();
    const byType = new Map<string, number>();
    const byOrigin = new Map<string, number>();

    records.forEach(record => {
      byPeriod.set(record.periodLabel, (byPeriod.get(record.periodLabel) ?? 0) + 1);

      const typeKey = record.declarationType.toLowerCase();
      byType.set(typeKey, (byType.get(typeKey) ?? 0) + 1);

      record.origins.forEach(origin => {
        const originKey = origin.toLowerCase();
        byOrigin.set(originKey, (byOrigin.get(originKey) ?? 0) + 1);
      });
    });

    return {
      declarations: records.length,
      byPeriod: Object.fromEntries(byPeriod),
      byType: Object.fromEntries(byType),
      byOrigin: Object.fromEntries(byOrigin),
    };
  }

  private static buildFinancial(records: NormalizedRecord[]) {
    const debitTotal = records.reduce((acc, record) => acc + record.debitAmount, 0);
    const balanceTotal = records.reduce((acc, record) => acc + record.balanceDue, 0);
    const averageBalance = records.length === 0 ? 0 : balanceTotal / records.length;
    const balanceRatio = debitTotal === 0 ? 0 : balanceTotal / debitTotal;

    const balanceByIdentificationMap = new Map<string, number>();
    records.forEach(record => {
      balanceByIdentificationMap.set(
        record.rawIdentification,
        (balanceByIdentificationMap.get(record.rawIdentification) ?? 0) + record.balanceDue
      );
    });

    const balanceByIdentification = Array.from(balanceByIdentificationMap.entries())
      .map(([identification, balance]) => ({ identification, balance }))
      .sort((a, b) => b.balance - a.balance);

    return {
      debitTotal,
      balanceTotal,
      balanceRatio,
      averageBalance,
      balanceByIdentification,
    };
  }

  private static buildOperations(records: NormalizedRecord[]) {
    const transmissions = new Map<string, number>();
    let zeroMovementCount = 0;
    let retificationCount = 0;

    records.forEach(record => {
      if (record.transmissionDate) {
        const key = record.transmissionDate.toISOString().split('T')[0];
        transmissions.set(key, (transmissions.get(key) ?? 0) + 1);
      }

      if (record.declarationType.toLowerCase().includes('sem movimento')) {
        zeroMovementCount += 1;
      }

      if (record.declarationType.toLowerCase().includes('retificadora')) {
        retificationCount += 1;
      }
    });

    const retificationRate = records.length === 0 ? 0 : retificationCount / records.length;

    return {
      transmissionsByDate: Object.fromEntries(transmissions),
      zeroMovementCount,
      retificationRate,
    };
  }

  private static buildAlerts(records: NormalizedRecord[], orderedPeriods: string[]): DashboardAlert[] {
    const alerts: DashboardAlert[] = [];
    const recordsByIdentification = this.groupBy(records, record => record.rawIdentification);
    const now = new Date();

    recordsByIdentification.forEach((cnpjRecords, identification) => {
      const ordered = [...cnpjRecords].sort((a, b) => a.periodDate.getTime() - b.periodDate.getTime());
      const periodMap = new Map(ordered.map(record => [record.period, record]));

      ordered.forEach(record => {
        if (record.balanceDue > 0) {
          const severity = now > record.dueDate ? 'high' : 'medium';
          alerts.push(
            this.createAlert('pending_balance', severity, identification, record.periodLabel, {
              balance: record.balanceDue,
            })
          );
        }

        if (
          record.debitAmount === 0 &&
          !record.declarationType.toLowerCase().includes('sem movimento')
        ) {
          const prevRecord = this.findPreviousRecord(ordered, record.periodDate);
          if (prevRecord && prevRecord.debitAmount > 0) {
            alerts.push(
              this.createAlert('zero_debit', 'medium', identification, record.periodLabel, {
                previousDebit: prevRecord.debitAmount,
              })
            );
          }
        }

        if (record.situation && record.situation.toLowerCase().includes('andamento')) {
          alerts.push(
            this.createAlert('processing', 'medium', identification, record.periodLabel, {
              situation: record.situation,
            })
          );
        }
      });

      orderedPeriods.forEach(period => {
        if (periodMap.has(period)) {
          return;
        }

        const prevPeriod = this.findPreviousPeriod(period, orderedPeriods);
        const prevRecord = prevPeriod ? periodMap.get(prevPeriod) : undefined;
        if (!prevRecord) {
          return;
        }

        if (prevRecord.debitAmount > 0 || prevRecord.balanceDue > 0) {
          const { year, month } = this.parsePeriod(period);
          const dueDate = this.computeDueDate(year, month);
          const severity: DashboardAlertSeverity = now > dueDate ? 'high' : 'medium';

          alerts.push(
            this.createAlert('missing_period', severity, identification, this.formatPeriod(year, month, true), {
              previousPeriod: prevRecord.periodLabel,
              previousDebit: prevRecord.debitAmount,
              previousBalance: prevRecord.balanceDue,
            })
          );
        }
      });

      this.createRetificationAlerts(ordered, identification, alerts);
    });

    return alerts;
  }

  private static createRetificationAlerts(
    ordered: NormalizedRecord[],
    identification: string,
    alerts: DashboardAlert[]
  ) {
    let series: NormalizedRecord[] = [];

    const pushSeriesAlert = (recordsSeries: NormalizedRecord[]) => {
      if (recordsSeries.length >= 2) {
        const severity: DashboardAlertSeverity = recordsSeries.length >= 3 ? 'high' : 'medium';
        alerts.push(
          this.createAlert('retification_series', severity, identification, recordsSeries[recordsSeries.length - 1].periodLabel, {
            length: recordsSeries.length,
            periods: recordsSeries.map(r => r.periodLabel),
          })
        );
      }
    };

    ordered.forEach(record => {
      const isRetification = record.declarationType.toLowerCase().includes('retificadora');
      if (isRetification) {
        series.push(record);
      } else {
        pushSeriesAlert(series);
        series = [];
      }
    });

    pushSeriesAlert(series);
  }

  private static createAlert(
    type: DashboardAlertType,
    severity: DashboardAlertSeverity,
    identification: string,
    period?: string,
    context?: Record<string, any>
  ): DashboardAlert {
    const message = this.buildAlertMessage(type, identification, period, context);
    return {
      type,
      severity,
      identification,
      period,
      message,
      context,
    };
  }

  private static buildAlertMessage(
    type: DashboardAlertType,
    identification: string,
    period?: string,
    context?: Record<string, any>
  ) {
    const periodInfo = period ? ` (competência ${period})` : '';
    switch (type) {
      case 'missing_period':
        return `Possível omissão para ${identification}${periodInfo}.`;
      case 'pending_balance':
        return `Saldo a pagar pendente para ${identification}${periodInfo}.`;
      case 'zero_debit':
        return `Débito zerado ou ausente para ${identification}${periodInfo}, requer conferência.`;
      case 'retification_series':
        return `Retificações consecutivas para ${identification}${periodInfo}.`;
      case 'processing':
        return `Declaração ainda em processamento para ${identification}${periodInfo}.`;
      default:
        return `Ocorrência detectada para ${identification}${periodInfo}.`;
    }
  }

  private static normalizeRecord(record: DashboardDCTFRecord): NormalizedRecord {
    const periodInfo = this.parsePeriod(record.period);
    const periodDate = new Date(periodInfo.year, periodInfo.month - 1, 1);
    const dueDate = this.computeDueDate(periodInfo.year, periodInfo.month);
    const transmissionDate = record.transmissionDate ? this.parseDateTime(record.transmissionDate) : undefined;

    return {
      identification: this.cleanIdentification(record.identification),
      rawIdentification: record.identification,
      identificationType: record.identificationType,
      period: this.formatPeriod(periodInfo.year, periodInfo.month),
      periodLabel: this.formatPeriod(periodInfo.year, periodInfo.month, true),
      periodDate,
      dueDate,
      transmissionDate,
      category: record.category,
      origins: this.normalizeOrigins(record.origin),
      declarationType: record.declarationType || 'Desconhecido',
      situation: record.situation,
      debitAmount: this.parseCurrency(record.debitAmount),
      balanceDue: this.parseCurrency(record.balanceDue),
    };
  }

  private static normalizeOrigins(origin?: string) {
    if (!origin) return [];
    return origin
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }

  private static parseCurrency(value: number | string | null | undefined): number {
    if (value == null) return 0;
    if (typeof value === 'number') return value;
    const sanitized = value.replace(/\./g, '').replace(',', '.').trim();
    const parsed = Number.parseFloat(sanitized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private static parsePeriod(period: string) {
    const trimmed = period.trim();
    const normalized = PERIOD_REGEX.test(trimmed) ? trimmed : this.toMonthYear(trimmed);
    const match = PERIOD_REGEX.exec(normalized);
    if (!match) {
      throw new Error(`Período inválido: ${period}`);
    }

    const [, monthStr, yearStr] = match;
    return {
      month: Number.parseInt(monthStr, 10),
      year: Number.parseInt(yearStr, 10),
    };
  }

  private static toMonthYear(value: string) {
    if (/^\d{4}-\d{2}$/.test(value)) {
      const [year, month] = value.split('-');
      return `${month}/${year}`;
    }
    if (/^\d{1,2}-\d{4}$/.test(value)) {
      const [month, year] = value.split('-');
      return `${month.padStart(2, '0')}/${year}`;
    }
    return value;
  }

  private static formatPeriod(year: number, month: number, keepMonthYear = false) {
    const monthStr = month.toString().padStart(2, '0');
    return keepMonthYear ? `${monthStr}/${year}` : `${year}-${monthStr}`;
  }

  private static computeDueDate(year: number, month: number) {
    const dueMonthIndex = month - 1 + 2; // segundo mês subsequente
    return new Date(year, dueMonthIndex, 15);
  }

  private static parseDateTime(value: string) {
    const normalized = value.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1');
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private static cleanIdentification(value: string) {
    return value.replace(/[^\d]/g, '');
  }

  private static groupBy<T, K>(items: T[], mapper: (item: T) => K): Map<K, T[]> {
    return items.reduce((map, item) => {
      const key = mapper(item);
      const group = map.get(key);
      if (group) {
        group.push(item);
      } else {
        map.set(key, [item]);
      }
      return map;
    }, new Map<K, T[]>());
  }

  private static findPreviousRecord(records: NormalizedRecord[], targetDate: Date) {
    const filtered = records.filter(r => r.periodDate.getTime() < targetDate.getTime());
    if (filtered.length === 0) return undefined;
    return filtered[filtered.length - 1];
  }

  private static findPreviousPeriod(current: string, orderedPeriods: string[]) {
    const index = orderedPeriods.indexOf(current);
    if (index <= 0) return undefined;
    return orderedPeriods[index - 1];
  }
}


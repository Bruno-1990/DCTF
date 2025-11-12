import { DashboardDCTFRecord, DashboardMetrics, DCTF as IDCTF } from "../types";
import { DashboardMetricsService } from "./DashboardMetricsService";
import { buildAdminDashboardRequirements } from "./AdminDashboardRequirements";
import { buildAdminDashboardArchitecture } from "./AdminDashboardArchitecture";
import { DCTF } from "../models/DCTF";

const dctfModel = new DCTF();

export interface AdminDashboardSnapshot {
  meta: {
    requiresPassword: boolean;
    authenticationModes: string[];
    generatedAt: string;
    version: string;
    notes?: string;
  };
  navigation: ReturnType<typeof buildAdminDashboardArchitecture>["navigation"];
  metrics: DashboardMetrics;
  architecture: ReturnType<typeof buildAdminDashboardArchitecture>;
  requirements: ReturnType<typeof buildAdminDashboardRequirements>;
}

export interface BuildAdminDashboardSnapshotOptions {
  records: DashboardDCTFRecord[];
}

export async function fetchAllAdminDashboardRecords(): Promise<DashboardDCTFRecord[]> {
  const allDeclarations = await dctfModel.findAll();
  if (!allDeclarations.success || !allDeclarations.data) {
    return [];
  }

  const mappedRecords = allDeclarations.data
    .map(mapToDashboardRecord)
    .map(record => ({ record, periodInfo: parseRecordPeriod(record.period) }))
    .filter((entry): entry is { record: DashboardDCTFRecord; periodInfo: { year: number; month: number } } =>
      Boolean(entry.record.identification) && entry.periodInfo !== null
    )
    .map(entry => entry.record);

  return mappedRecords;
}

export async function fetchAdminDashboardRecords(months = 5): Promise<DashboardDCTFRecord[]> {
  const allRecords = await fetchAllAdminDashboardRecords();
  if (months <= 0) {
    return allRecords;
  }

  const mappedRecords = allRecords
    .map(record => ({ record, periodInfo: parseRecordPeriod(record.period) }))
    .filter((entry): entry is { record: DashboardDCTFRecord; periodInfo: { year: number; month: number } } =>
      Boolean(entry.record.identification) && entry.periodInfo !== null
    );

  if (mappedRecords.length === 0) {
    return [];
  }

  mappedRecords.sort((a, b) => {
    const valueA = a.periodInfo.year * 12 + a.periodInfo.month;
    const valueB = b.periodInfo.year * 12 + b.periodInfo.month;
    return valueB - valueA;
  });

  const allowedPeriods = new Set<string>();
  const recentRecords: DashboardDCTFRecord[] = [];

  for (const entry of mappedRecords) {
    const { record, periodInfo } = entry;
    const periodKey = `${periodInfo.year}-${String(periodInfo.month).padStart(2, "0")}`;

    if (allowedPeriods.size < months || allowedPeriods.has(periodKey)) {
      allowedPeriods.add(periodKey);
      recentRecords.push(record);
    }

    if (allowedPeriods.size >= months && !allowedPeriods.has(periodKey)) {
      break;
    }
  }

  return recentRecords;
}

export async function getAdminDashboardSnapshot(months = 5): Promise<AdminDashboardSnapshot> {
  const records = await fetchAdminDashboardRecords(months);
  return buildAdminDashboardSnapshot({ records });
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

export function mapToDashboardRecord(record: IDCTF): DashboardDCTFRecord {
  return {
    identificationType: "CNPJ",
    identification: record.cliente?.cnpj ?? record.cliente?.cnpj_limpo ?? record.clienteId,
    businessName: record.cliente?.razao_social ?? undefined,
    period: formatPeriod(record.periodo),
    transmissionDate: formatDate(record.dataDeclaracao),
    category: "Geral",
    origin: "Plataforma",
    declarationType: record.situacao ?? record.status ?? "Desconhecido",
    situation: record.situacao ?? record.status,
    status: record.status,
    debitAmount: Number(record.debitoApurado ?? 0),
    balanceDue: Number(record.saldoAPagar ?? 0),
  };
}

export function formatPeriod(periodo: string): string {
  if (!periodo) return "";
  if (/^\d{4}-\d{2}$/.test(periodo)) {
    const [year, month] = periodo.split("-");
    return `${month}/${year}`;
  }
  if (/^\d{2}\/\d{4}$/.test(periodo)) {
    return periodo;
  }
  return periodo;
}

function parseRecordPeriod(period: string | undefined): { year: number; month: number } | null {
  if (!period) return null;
  const trimmed = period.trim();
  const monthYear = /^([0-9]{2})\/([0-9]{4})$/.exec(trimmed);
  if (monthYear) {
    return {
      month: Number.parseInt(monthYear[1], 10),
      year: Number.parseInt(monthYear[2], 10),
    };
  }
  const yearMonth = /^([0-9]{4})-([0-9]{2})$/.exec(trimmed);
  if (yearMonth) {
    return {
      year: Number.parseInt(yearMonth[1], 10),
      month: Number.parseInt(yearMonth[2], 10),
    };
  }
  return null;
}

function formatDate(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString();
}

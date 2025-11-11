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

export async function fetchAdminDashboardRecords(months = 5): Promise<DashboardDCTFRecord[]> {
  const periods = computePeriods(months);
  const dashboardRecords: DashboardDCTFRecord[] = [];

  const allDeclarations = await dctfModel.findAll();
  if (!allDeclarations.success || !allDeclarations.data) {
    return dashboardRecords;
  }

  const periodSet = new Set(periods);
  allDeclarations.data
    .filter(record => record.periodo && periodSet.has(record.periodo))
    .forEach(record => {
      dashboardRecords.push(mapToDashboardRecord(record));
    });

  return dashboardRecords;
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

function computePeriods(months: number): string[] {
  const now = new Date();
  const periods: string[] = [];

  for (let i = 0; i < months; i += 1) {
    const reference = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = reference.getFullYear();
    const month = (reference.getMonth() + 1).toString().padStart(2, "0");
    periods.push(`${year}-${month}`);
  }

  return periods;
}

function mapToDashboardRecord(record: IDCTF): DashboardDCTFRecord {
  return {
    identificationType: "CNPJ",
    identification: record.cliente?.cnpj ?? record.cliente?.cnpj_limpo ?? record.clienteId,
    period: formatPeriod(record.periodo),
    transmissionDate: formatDate(record.dataDeclaracao),
    category: "Geral",
    origin: "Plataforma",
    declarationType: record.situacao ?? record.status ?? "Desconhecido",
    situation: record.status,
    debitAmount: Number(record.debitoApurado ?? 0),
    balanceDue: Number(record.saldoAPagar ?? 0),
  };
}

function formatPeriod(periodo: string): string {
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

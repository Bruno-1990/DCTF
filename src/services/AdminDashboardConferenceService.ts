import { randomUUID } from 'crypto';
import { DashboardConferenceIssue, DashboardConferenceSummary, DashboardDCTFRecord } from '../types';
import { fetchAdminDashboardRecords } from './AdminDashboardService';

const DAYS_BEFORE_DEADLINE_MEDIUM = 5;

function parsePeriod(period: string): { year: number; month: number } | null {
  const trimmed = period.trim();
  const match = /^([0-9]{2})\/([0-9]{4})$/.exec(trimmed);
  if (!match) {
    return null;
  }
  return {
    month: Number.parseInt(match[1], 10),
    year: Number.parseInt(match[2], 10),
  };
}

function computeDueDate(year: number, month: number): Date {
  // DCTF mensal: dia 15 do segundo mês subsequente ao da competência
  return new Date(Date.UTC(year, month - 1 + 2, 15, 12, 0, 0, 0));
}

function parseDate(date?: string): Date | undefined {
  if (!date) return undefined;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function buildDueDateIssue(record: DashboardDCTFRecord, today: Date): DashboardConferenceIssue | null {
  const periodInfo = parsePeriod(record.period);
  if (!periodInfo) {
    return null;
  }

  const dueDate = computeDueDate(periodInfo.year, periodInfo.month);
  const transmittedAt = parseDate(record.transmissionDate);
  const status = (record.status ?? '').toLowerCase();
  const situation = (record.situation ?? '').toLowerCase();
  const isDelivered = status === 'concluido';
  const dueDayStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysUntilDue = Math.floor((dueDayStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
  const severity: DashboardConferenceIssue['severity'] = daysUntilDue < 0 ? 'high' : daysUntilDue <= DAYS_BEFORE_DEADLINE_MEDIUM ? 'medium' : 'low';

  if (isDelivered) {
    if (transmittedAt && transmittedAt.getTime() > dueDate.getTime()) {
      const daysLate = Math.ceil((transmittedAt.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: randomUUID(),
        rule: 'due_date',
        identification: record.identification,
        businessName: record.businessName,
        period: record.period,
        dueDate: dueDate.toISOString(),
        transmissionDate: transmittedAt.toISOString(),
        status: record.status,
        severity: 'high',
        daysLate,
        message: `Entrega fora do prazo legal (atraso de ${daysLate} dia${daysLate > 1 ? 's' : ''}).`,
        details: {
          deliveredAt: transmittedAt.toISOString(),
        },
        actionPlan:
          'Emitir DARF da multa por atraso (código 2170) e registrar eventual retificação para corrigir divergências.',
      };
    }
    return null;
  }

  const stillProcessing = situation.includes('andamento');
  
  // Criar issue para declarações "em andamento" mesmo com severity 'low',
  // pois elas precisam ser monitoradas na seção "Declarações em aberto com prazo vigente"
  // Mas só se ainda estiverem dentro do prazo (daysUntilDue >= 0)
  if (severity === 'low' && !stillProcessing) {
    // Se não está em andamento e tem muito tempo (severity 'low'), não precisa criar issue
    return null;
  }

  // Se está vencida (severity 'high'), sempre criar issue
  // Se está próxima do vencimento (severity 'medium'), sempre criar issue
  // Se está em andamento mesmo com severity 'low', criar issue para monitoramento
  const message = severity === 'high'
    ? 'Competência vencida sem entrega registrada.'
    : severity === 'medium'
    ? `Prazo final em ${daysUntilDue} dia${Math.abs(daysUntilDue) === 1 ? '' : 's'} (necessário transmitir).`
    : stillProcessing
    ? `Declaração em andamento - Prazo final em ${daysUntilDue} dia${Math.abs(daysUntilDue) === 1 ? '' : 's'}.`
    : `Prazo final em ${daysUntilDue} dia${Math.abs(daysUntilDue) === 1 ? '' : 's'} (necessário transmitir).`;

  return {
    id: randomUUID(),
    rule: 'due_date',
    identification: record.identification,
    businessName: record.businessName,
    period: record.period,
    dueDate: dueDate.toISOString(),
    transmissionDate: transmittedAt?.toISOString(),
    status: record.status,
    severity,
    message,
    details: {
      situation: record.situation,
      stillProcessing,
      daysUntilDue,
    },
    actionPlan:
      severity === 'high'
        ? 'Transmitir a DCTF correspondente imediatamente e preparar o pagamento da multa por atraso (DARF 2170) se aplicável.'
        : severity === 'medium'
        ? stillProcessing
          ? 'Acompanhar o processamento da transmissão já enviada e confirmar o protocolo assim que o status for atualizado.'
          : 'Priorizar o fechamento da competência e protocolar a DCTF antes do vencimento legal, alinhando o time fiscal.'
        : stillProcessing
        ? 'Acompanhar o processamento da transmissão já enviada. Monitorar o status e confirmar quando concluída.'
        : 'Monitorar e preparar a transmissão da DCTF antes do vencimento legal.',
  };
}

export async function getConferenceSummary(months = 12): Promise<DashboardConferenceSummary> {
  const records = await fetchAdminDashboardRecords(months);
  const today = new Date();
  const dueDateIssues = records
    .map(record => buildDueDateIssue(record, today))
    .filter((issue): issue is DashboardConferenceIssue => issue !== null)
    .sort((a, b) => {
      if (a.severity === b.severity) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      const severityRank = { high: 0, medium: 1, low: 2 };
      return severityRank[a.severity] - severityRank[b.severity];
    });

  return {
    generatedAt: new Date().toISOString(),
    rules: {
      dueDate: dueDateIssues,
    },
  };
}

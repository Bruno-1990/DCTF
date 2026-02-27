/**
 * Task 24: Copy e status em português (PRD 11.6) para uso no frontend.
 * Legendas, placeholders, mensagens de erro, empty states.
 */

export const STATUS_LABELS: Record<string, string> = {
  NEW: 'Novo',
  INTAKE_IN_PROGRESS: 'Em preenchimento',
  INTAKE_COMPLETE: 'Preenchimento concluído',
  PROCESSING: 'Em processamento',
  PENDING_INTERNAL: 'Aguardando análise interna',
  PENDING_DOCS: 'Aguardando documentos',
  READY_FOR_REVIEW: 'Pronto para revisão',
  APPROVED: 'Aprovado',
  SUBMITTED: 'Enviado',
  POST_DELIVERY: 'Pós-entrega',
  CLOSED: 'Encerrado',
};

export const ERROR_MESSAGES: Record<string, string> = {
  RF072_STATUS_NOT_APPROVED: 'O case precisa estar aprovado para gerar o .DEC. Conclua a revisão antes.',
  RF070_BLOCKER_PRESENT: 'Existem pendências bloqueadoras. Resolva-as antes de gerar o .DEC.',
  RF075_PERFIL_BLOCOS: 'Perfil deve ser Simplificada (blocos 17/18) ou Completa (blocos 19/20).',
  RF075_T9_TOTAIS: 'Totais da declaração não conferem. Recalcule os totais antes de gerar o .DEC.',
  INVENTORY_REQUIRED: 'Inclua ao menos um documento no case antes de encerrar.',
  PROTOCOLO_REQUIRED: 'É necessário ao menos um comprovante de protocolo para marcar como enviado.',
  CASE_NOT_FOUND: 'Case não encontrado.',
};

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? 'Ocorreu um erro. Tente novamente.';
}

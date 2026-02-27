/**
 * Configuração das filas do módulo IRPF Produção (Task 9.1 - PRD 11.3)
 * Filas: extract_text, classify, validate, score_risk, generate_case_summary
 */

export const IRPF_QUEUE_NAMES = [
  'extract_text',
  'classify',
  'validate',
  'score_risk',
  'generate_case_summary',
  'process_case',
] as const;

export type IrpfQueueName = (typeof IRPF_QUEUE_NAMES)[number];

/** Opções de conexão Redis para BullMQ (REDIS_URL ou host/port) */
export function getRedisConnectionOptions(): { host: string; port: number } | { url: string } {
  const url = process.env['REDIS_URL'];
  if (url) {
    return { url };
  }
  const host = process.env['REDIS_HOST'] || 'localhost';
  const port = parseInt(process.env['REDIS_PORT'] || '6379', 10);
  return { host, port };
}

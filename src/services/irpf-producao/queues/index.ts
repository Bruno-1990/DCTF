/**
 * Filas BullMQ do módulo IRPF Produção (Task 9 - Jobs/Workers)
 * Conexão Redis; filas: extract_text, classify, validate, score_risk, generate_case_summary.
 */

import { Queue } from 'bullmq';
import { getRedisConnectionOptions, IRPF_QUEUE_NAMES, IrpfQueueName } from './config';

/** Opções de conexão para BullMQ (usa as opções do BullMQ para evitar conflito de versões ioredis) */
function getConnectionOptions(): { host: string; port: number } | { url: string } {
  return getRedisConnectionOptions();
}

const queues = new Map<IrpfQueueName, Queue>();

/** Limpa cache de filas (apenas para testes) */
export function _resetQueuesForTest(): void {
  queues.clear();
}

/**
 * Retorna a fila BullMQ pelo nome (Task 9.1).
 * Filas: extract_text, classify, validate, score_risk, generate_case_summary.
 */
export function getQueue(name: IrpfQueueName): Queue {
  if (!IRPF_QUEUE_NAMES.includes(name)) {
    throw new Error(`Invalid IRPF queue name: ${name}. Allowed: ${IRPF_QUEUE_NAMES.join(', ')}`);
  }
  let queue = queues.get(name);
  if (!queue) {
    const connection = getConnectionOptions();
    queue = new Queue(name, {
      connection,
      prefix: 'irpf_producao',
    });
    queues.set(name, queue);
  }
  return queue;
}

export { IRPF_QUEUE_NAMES, getRedisConnectionOptions };
export type { IrpfQueueName };

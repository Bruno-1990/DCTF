/**
 * Task 9.1 - BullMQ + Redis e filas do módulo IRPF
 * Conexão Redis; filas: extract_text, classify, validate, score_risk, generate_case_summary.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

const mockAdd = jest.fn().mockResolvedValue({ id: '1' });
const MockQueue = jest.fn().mockImplementation(() => ({
  add: mockAdd,
  getJob: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/irpf-producao/queues/config', () => ({
  IRPF_QUEUE_NAMES: ['extract_text', 'classify', 'validate', 'score_risk', 'generate_case_summary', 'process_case'],
  getRedisConnectionOptions: jest.fn().mockReturnValue({ host: 'localhost', port: 6379 }),
}));

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({}));
});

jest.mock('bullmq', () => ({
  Queue: MockQueue,
}));

describe('IRPF Produção - Filas BullMQ (Task 9.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve exportar as 6 filas incluindo process_case', async () => {
    const { IRPF_QUEUE_NAMES } = await import('../../src/services/irpf-producao/queues/index');
    expect(IRPF_QUEUE_NAMES).toEqual([
      'extract_text',
      'classify',
      'validate',
      'score_risk',
      'generate_case_summary',
      'process_case',
    ]);
  });

  it('getQueue(extract_text) retorna fila com método add', async () => {
    const { getQueue } = await import('../../src/services/irpf-producao/queues/index');
    const queue = getQueue('extract_text');
    expect(queue).toBeDefined();
    expect(typeof queue.add).toBe('function');
    await queue.add('test', { document_id: 1 });
    expect(mockAdd).toHaveBeenCalledWith('test', { document_id: 1 });
  });

  it('getQueue para cada nome de fila cria Queue com prefix irpf_producao', async () => {
    const { getQueue, IRPF_QUEUE_NAMES, _resetQueuesForTest } = await import('../../src/services/irpf-producao/queues/index');
    _resetQueuesForTest();
    for (const name of IRPF_QUEUE_NAMES) {
      const q = getQueue(name);
      expect(q).toBeDefined();
      expect(MockQueue).toHaveBeenCalledWith(
        name,
        expect.objectContaining({ prefix: 'irpf_producao' })
      );
    }
  });

  it('getQueue com nome inválido lança erro', async () => {
    const { getQueue } = await import('../../src/services/irpf-producao/queues/index');
    expect(() => getQueue('invalid' as any)).toThrow(/Invalid IRPF queue name/);
  });
});

describe('IRPF Produção - Jobs versionados e idempotentes (Task 9.3)', () => {
  it('JOB_VERSION e enqueueExtractText com options.jobId existem para idempotência', async () => {
    const mod = await import('../../src/services/irpf-producao/enqueue-extract-text');
    expect(mod.JOB_VERSION).toBe(1);
    expect(typeof mod.enqueueExtractText).toBe('function');
    expect(mod.enqueueExtractText.length).toBeGreaterThanOrEqual(1);
  });
});

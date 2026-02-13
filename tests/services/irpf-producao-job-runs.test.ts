/**
 * Task 9.2 - Persistência job_runs no MySQL (startRun, completeRun, failRun)
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

const mockExecute = jest.fn();
const mockGetConnection = jest.fn();

jest.mock('../../src/config/mysql', () => ({
  executeQuery: (...args: unknown[]) => mockExecute(...args),
  getConnection: () => mockGetConnection(),
}));

describe('IRPF Produção - Job runs (Task 9.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('startRun insere em job_runs e retorna insertId', async () => {
    mockGetConnection.mockResolvedValue({
      execute: jest.fn().mockResolvedValue([{ insertId: 42 }]),
      release: jest.fn(),
    });
    const { startRun } = await import('../../src/services/irpf-producao/job-runs');
    const runId = await startRun(10);
    expect(runId).toBe(42);
    expect(mockGetConnection).toHaveBeenCalled();
  });

  it('completeRun atualiza status SUCCESS e finished_at', async () => {
    mockExecute.mockResolvedValue([]);
    const { completeRun } = await import('../../src/services/irpf-producao/job-runs');
    await completeRun(1);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'SUCCESS'"),
      [1]
    );
  });

  it('failRun atualiza status FAILED e error_message', async () => {
    mockExecute.mockResolvedValue([]);
    const { failRun } = await import('../../src/services/irpf-producao/job-runs');
    await failRun(2, 'Arquivo não encontrado');
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'FAILED'"),
      expect.arrayContaining([expect.any(String), 2])
    );
  });
});

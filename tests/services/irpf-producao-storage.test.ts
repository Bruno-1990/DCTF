/**
 * Testes do módulo Storage IRPF Produção (Task 3)
 * Subtask 3.1: resolver path por ANO/CASEID e criar subpastas 00-11, 99
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdirSync, rmSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Módulo a ser implementado em src/services/irpf-producao/storage.ts
const SUBFOLDERS = [
  '00_cadastro',
  '01_rendimentos',
  '02_bancos',
  '03_investimentos',
  '04_saude',
  '05_educacao',
  '06_pensao_dependentes',
  '07_bens_direitos',
  '08_dividas_onus',
  '09_especiais',
  '10_protocolos',
  '11_dec',
  '99_auditoria',
];

describe('IRPF Produção - Storage (Task 3.1)', () => {
  let basePath: string;

  beforeEach(() => {
    basePath = join(tmpdir(), `irpf-storage-test-${Date.now()}`);
  });

  afterEach(() => {
    if (existsSync(basePath)) {
      try {
        rmSync(basePath, { recursive: true });
      } catch {
        // ignore
      }
    }
  });

  it('resolveCasePath(ano, caseId) retorna path terminando em {ANO}{sep}{CASEID}', async () => {
    const { resolveCasePath } = await import('../../src/services/irpf-producao/storage');
    const path = resolveCasePath(2025, 'C0001842');
    expect(path).toBeDefined();
    expect(typeof path).toBe('string');
    expect(path.length).toBeGreaterThan(0);
    expect(path).toMatch(/2025[\\/]C0001842$/);
  });

  it('ensureSubfolders(path) cria subpastas 00_cadastro a 11_dec e 99_auditoria', async () => {
    mkdirSync(basePath, { recursive: true });
    const { ensureSubfolders } = await import('../../src/services/irpf-producao/storage');
    await ensureSubfolders(basePath);
    const entries = readdirSync(basePath);
    for (const sub of SUBFOLDERS) {
      expect(entries).toContain(sub);
      expect(existsSync(join(basePath, sub))).toBe(true);
    }
  });
});

describe('IRPF Produção - Storage (Task 3.2)', () => {
  let basePath: string;

  beforeEach(() => {
    basePath = join(tmpdir(), `irpf-atomic-${Date.now()}`);
    mkdirSync(basePath, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(basePath)) {
      try {
        rmSync(basePath, { recursive: true });
      } catch {
        // ignore
      }
    }
  });

  it('saveFileAtomically grava em .uploading e renomeia para nome final (sem CPF no nome)', async () => {
    const { saveFileAtomically } = await import('../../src/services/irpf-producao/storage');
    const finalName = '2025_C0001842_INF_BANC_ITAU_2025-02-10_v1.pdf';
    const content = Buffer.from('test pdf content');
    const outPath = await saveFileAtomically(basePath, finalName, content);
    expect(outPath).toBe(join(basePath, finalName));
    expect(existsSync(outPath)).toBe(true);
    expect(existsSync(join(basePath, `${finalName}.uploading`))).toBe(false);
    expect(outPath).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  });
});

describe('IRPF Produção - Storage (Task 3.3)', () => {
  it('computeSha256 retorna hash hexadecimal de 64 caracteres', async () => {
    const { computeSha256 } = await import('../../src/services/irpf-producao/storage');
    const hash = computeSha256(Buffer.from('test content'));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash.length).toBe(64);
  });

  it('resolveCasePath usa IRPF_STORAGE_PATH quando definida', async () => {
    const prev = process.env.IRPF_STORAGE_PATH;
    try {
      process.env.IRPF_STORAGE_PATH = 'C:\\Share\\IRPF';
      const { resolveCasePath } = await import('../../src/services/irpf-producao/storage');
      const path = resolveCasePath(2025, 'C0001');
      expect(path).toMatch(/C:\\Share\\IRPF[\\/]2025[\\/]C0001$/);
    } finally {
      if (prev !== undefined) process.env.IRPF_STORAGE_PATH = prev;
      else delete process.env.IRPF_STORAGE_PATH;
    }
  });
});

/**
 * Testes do modelo de dados IRPF Produção (Task 2)
 * Subtask 2.1: tabelas cases, case_people, documents (com extraction_*)
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, '../../docs/migrations/mysql');

describe('IRPF Produção - Schema (Task 2.1)', () => {
  it('deve ter migração com tabela irpf_producao_cases', () => {
    const file020 = join(MIGRATIONS_DIR, '020_create_irpf_producao_cases.sql');
    expect(existsSync(file020)).toBe(true);
    const sql = readFileSync(file020, 'utf-8');
    expect(sql).toMatch(/CREATE TABLE.*irpf_producao_cases/i);
  });

  it('deve ter migração com tabela irpf_producao_case_people', () => {
    const file020 = join(MIGRATIONS_DIR, '020_create_irpf_producao_cases.sql');
    const sql = readFileSync(file020, 'utf-8');
    expect(sql).toMatch(/CREATE TABLE.*irpf_producao_case_people/i);
  });

  it('deve ter tabela irpf_producao_documents com campos extraction_*', () => {
    const file020 = join(MIGRATIONS_DIR, '020_create_irpf_producao_cases.sql');
    const file021 = join(MIGRATIONS_DIR, '021_create_irpf_producao_documents.sql');
    const content = existsSync(file021)
      ? readFileSync(file021, 'utf-8')
      : readFileSync(file020, 'utf-8');
    expect(content).toMatch(/irpf_producao_documents/i);
    expect(content).toMatch(/extraction_status/i);
    expect(content).toMatch(/extraction_flow/i);
    expect(content).toMatch(/extraction_error_message/i);
    expect(content).toMatch(/extraction_attempts/i);
  });
});

/**
 * Testes do modelo de dados IRPF Produção (Task 2)
 * 2.1: tabelas cases, case_people, documents (com extraction_*)
 * 2.2: tabelas issues, audit_events, jobs, job_runs
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, '../../docs/migrations/mysql');

function readMigration(name: string): string {
  const path = join(MIGRATIONS_DIR, name);
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

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
    const file021 = join(MIGRATIONS_DIR, '021_create_irpf_producao_documents.sql');
    const content = existsSync(file021)
      ? readFileSync(file021, 'utf-8')
      : readFileSync(join(MIGRATIONS_DIR, '020_create_irpf_producao_cases.sql'), 'utf-8');
    expect(content).toMatch(/irpf_producao_documents/i);
    expect(content).toMatch(/extraction_status/i);
    expect(content).toMatch(/extraction_flow/i);
    expect(content).toMatch(/extraction_error_message/i);
    expect(content).toMatch(/extraction_attempts/i);
  });
});

describe('IRPF Produção - Schema (Task 2.2)', () => {
  const file022 = '022_create_irpf_producao_issues_audit_jobs.sql';

  it('deve ter migração com tabela irpf_producao_issues e índice (case_id, severity, status)', () => {
    const content = readMigration(file022);
    expect(content).toMatch(/CREATE TABLE.*irpf_producao_issues/i);
    expect(content).toMatch(/case_id|severity|status/);
    expect(content).toMatch(/idx.*case.*severity.*status|INDEX.*case_id.*severity.*status/i);
  });

  it('deve ter tabela irpf_producao_audit_events e índice (case_id, created_at)', () => {
    const content = readMigration(file022);
    expect(content).toMatch(/CREATE TABLE.*irpf_producao_audit_events/i);
    expect(content).toMatch(/case_id|created_at/);
    expect(content).toMatch(/idx.*case.*created|INDEX.*case_id.*created_at/i);
  });

  it('deve ter tabelas irpf_producao_jobs e irpf_producao_job_runs', () => {
    const content = readMigration(file022);
    expect(content).toMatch(/CREATE TABLE.*irpf_producao_jobs/i);
    expect(content).toMatch(/CREATE TABLE.*irpf_producao_job_runs/i);
    expect(content).toMatch(/job_id|status|attempts|error/i);
  });
});

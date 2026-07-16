/**
 * Executa a migration 034 (tabela mestra `beneficios`) e faz o seed inicial.
 *
 * Passo A: cria a tabela `beneficios` a partir do arquivo .sql da migration.
 * Passo B: popula a tabela com os tipos distintos de beneficio ja presentes
 *          na coluna string clientes.beneficios_fiscais (split por virgula,
 *          trim, MAIUSCULO, dedup). Nao altera clientes.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
// Carrega o .env ANTES de importar o pool MySQL (que lê process.env no load).
// ts-node compila para CommonJS, então este require roda em ordem.
dotenv.config({ path: path.join(process.cwd(), '.env') });
import { mysqlPool } from '../config/mysql';

const MIGRATION_FILE = path.join(
  process.cwd(),
  'docs',
  'migrations',
  'mysql',
  '034_create_beneficios.sql'
);

async function run(): Promise<void> {
  if (!fs.existsSync(MIGRATION_FILE)) {
    console.error('Arquivo de migration não encontrado:', MIGRATION_FILE);
    process.exit(1);
  }

  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  const connection = await mysqlPool.getConnection();
  try {
    // ─── Passo A: criar tabela ───
    for (const stmt of statements) {
      if (stmt.toUpperCase().startsWith('USE ')) continue;
      await connection.query(stmt + ';');
      console.log('OK:', stmt.slice(0, 70).replace(/\s+/g, ' ') + '...');
    }
    console.log('Tabela `beneficios` criada/verificada com sucesso.');

    // ─── Passo B: seed a partir de clientes.beneficios_fiscais ───
    const [rows] = await connection.query<any[]>(
      `SELECT beneficios_fiscais FROM clientes WHERE beneficios_fiscais IS NOT NULL AND TRIM(beneficios_fiscais) <> ''`
    );

    const nomes = new Set<string>();
    for (const row of rows) {
      const raw = String(row.beneficios_fiscais ?? '');
      raw
        .split(',')
        .map((n) => n.trim().toUpperCase())
        .filter((n) => n.length > 0)
        .forEach((n) => nomes.add(n));
    }

    let inseridos = 0;
    for (const nome of nomes) {
      const [result] = await connection.query<any>(
        `INSERT IGNORE INTO beneficios (nome) VALUES (?)`,
        [nome]
      );
      inseridos += result?.affectedRows ?? 0;
    }

    console.log(
      `Seed concluído: ${nomes.size} tipo(s) distinto(s) encontrado(s), ${inseridos} novo(s) inserido(s).`
    );
    console.log('Migration 034 (tabela mestra de benefícios) executada com sucesso.');
  } catch (err: any) {
    console.error('Erro ao executar migration:', err.message);
    process.exit(1);
  } finally {
    connection.release();
    await mysqlPool.end();
  }
}

run();

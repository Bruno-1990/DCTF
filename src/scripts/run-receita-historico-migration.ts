/**
 * Executa a migration 037: tabela `clientes_receita_historico`.
 *
 * Uso: npx ts-node --transpile-only src/scripts/run-receita-historico-migration.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
// Carrega o .env ANTES de importar o pool MySQL (que lê process.env no load).
dotenv.config({ path: path.join(process.cwd(), '.env') });
import { mysqlPool } from '../config/mysql';

const MIGRATION_FILE = path.join(
  process.cwd(),
  'docs',
  'migrations',
  'mysql',
  '037_create_clientes_receita_historico.sql'
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
    for (const stmt of statements) {
      if (stmt.toUpperCase().startsWith('USE ')) continue;
      await connection.query(stmt + ';');
      console.log('OK:', stmt.slice(0, 60).replace(/\s+/g, ' ') + '...');
    }

    const [cols] = await connection.query<any[]>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes_receita_historico'
       ORDER BY ORDINAL_POSITION`
    );
    console.log('Colunas:', cols.map((c: any) => c.COLUMN_NAME).join(', '));
    console.log('Migration 037 executada com sucesso.');
  } catch (err: any) {
    console.error('Erro ao executar migration:', err.message);
    process.exit(1);
  } finally {
    connection.release();
    await mysqlPool.end();
  }
}

run();

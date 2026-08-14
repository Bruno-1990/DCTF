/**
 * Executa a migration 036: colunas `ausente_no_cartao` e `ausente_no_cartao_em`
 * em `clientes_socios`.
 *
 * Uso: npx ts-node --transpile-only src/scripts/run-socios-ausente-migration.ts
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
  '036_add_socios_ausente_no_cartao.sql'
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
      console.log('OK:', stmt.slice(0, 70).replace(/\s+/g, ' ') + '...');
    }

    const [cols] = await connection.query<any[]>(
      `SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes_socios'
         AND COLUMN_NAME IN ('ausente_no_cartao','ausente_no_cartao_em')`
    );
    console.log('Colunas presentes agora:', cols);
    console.log('Migration 036 executada com sucesso.');
  } catch (err: any) {
    console.error('Erro ao executar migration:', err.message);
    process.exit(1);
  } finally {
    connection.release();
    await mysqlPool.end();
  }
}

run();

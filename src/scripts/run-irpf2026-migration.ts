/**
 * Executa a migration 030 (área do cliente IRPF 2026).
 * Cria tabelas: irpf2026_usuarios, irpf2026_admin, irpf2026_documentos, irpf2026_mensagens.
 */

import * as fs from 'fs';
import * as path from 'path';
import { mysqlPool } from '../config/mysql';

const MIGRATION_FILE = path.join(
  process.cwd(),
  'docs',
  'migrations',
  'mysql',
  '030_irpf2026_area_cliente.sql'
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
    console.log('Migration 030 (IRPF 2026 área do cliente) executada com sucesso.');
  } catch (err: any) {
    console.error('Erro ao executar migration:', err.message);
    process.exit(1);
  } finally {
    connection.release();
    await mysqlPool.end();
  }
}

run();

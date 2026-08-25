/**
 * Aplica a migration 047 (colunas de última coleta em det_procuracoes).
 * Idempotente por conferência no information_schema.
 *
 *   npx ts-node src/scripts/run-det-migration-047.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '.env') });
import { mysqlPool } from '../config/mysql';

const ARQUIVO = path.join(
  process.cwd(), 'docs', 'migrations', 'mysql', '047_det_procuracoes_ultima_coleta.sql'
);

async function run(): Promise<void> {
  if (!fs.existsSync(ARQUIVO)) { console.error('Migration não encontrada:', ARQUIVO); process.exit(1); }
  const sql = fs.readFileSync(ARQUIVO, 'utf8');
  const statements = sql
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    .split(/;\s*\n/).map((s) => s.trim()).filter((s) => s.length > 0);

  const conn = await mysqlPool.getConnection();
  try {
    const [existentes] = await conn.query<any[]>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'det_procuracoes'`
    );
    const jaTem = new Set(existentes.map((r: any) => String(r.COLUMN_NAME)));
    let aplicadas = 0, puladas = 0;
    for (const stmt of statements) {
      const m = stmt.match(/ADD COLUMN\s+(\w+)/i);
      const col = m?.[1];
      if (!col) continue;
      if (jaTem.has(col)) { console.log(`  já existe: ${col}`); puladas++; continue; }
      await conn.query(stmt + ';');
      console.log(`  coluna criada: ${col}`);
      aplicadas++;
    }
    console.log(`\nMigration 047: ${aplicadas} criada(s), ${puladas} já existia(m).`);
  } finally {
    conn.release();
    await mysqlPool.end();
  }
}
run().catch((e) => { console.error('Falhou:', e?.message ?? e); process.exit(1); });

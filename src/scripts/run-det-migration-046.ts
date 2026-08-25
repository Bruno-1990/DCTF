/**
 * Aplica a migration 046 (colunas de procuração em `det_coletas`).
 *
 * Idempotente por conferência no information_schema, e não por
 * "ADD COLUMN IF NOT EXISTS": essa forma não existe em toda versão de MySQL
 * suportada aqui, e a alternativa (procedure com DELIMITER) não passa pelo
 * driver mysql2, porque DELIMITER é construção do cliente de linha de comando,
 * não do servidor.
 *
 *   npx ts-node src/scripts/run-det-migration-046.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
// Carrega o .env ANTES de importar o pool MySQL (que lê process.env no load).
dotenv.config({ path: path.join(process.cwd(), '.env') });
import { mysqlPool } from '../config/mysql';

const ARQUIVO = path.join(
  process.cwd(),
  'docs',
  'migrations',
  'mysql',
  '046_det_coletas_procuracoes.sql'
);

async function run(): Promise<void> {
  if (!fs.existsSync(ARQUIVO)) {
    console.error('Migration não encontrada:', ARQUIVO);
    process.exit(1);
  }

  const sql = fs.readFileSync(ARQUIVO, 'utf8');
  const statements = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const conn = await mysqlPool.getConnection();
  try {
    const [existentes] = await conn.query<any[]>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'det_coletas'`
    );
    const jaTem = new Set(existentes.map((r: any) => String(r.COLUMN_NAME)));

    let aplicadas = 0;
    let puladas = 0;
    for (const stmt of statements) {
      const m = stmt.match(/ADD COLUMN\s+(\w+)/i);
      const coluna = m?.[1];
      if (!coluna) continue;
      if (jaTem.has(coluna)) {
        console.log(`  já existe: ${coluna}`);
        puladas++;
        continue;
      }
      await conn.query(stmt + ';');
      console.log(`  coluna criada: ${coluna}`);
      aplicadas++;
    }

    console.log(`\nMigration 046: ${aplicadas} coluna(s) criada(s), ${puladas} já existia(m).`);

    const [cols] = await conn.query<any[]>(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'det_coletas'
          AND COLUMN_NAME IN ('procuracoes_lidas','procuracoes_alteradas',
                              'procuracoes_ganharam','procuracoes_perderam','spe_erro')
        ORDER BY ORDINAL_POSITION`
    );
    console.table(cols);
  } finally {
    conn.release();
    await mysqlPool.end();
  }
}

run().catch((e) => {
  console.error('Falhou:', e?.message ?? e);
  process.exit(1);
});

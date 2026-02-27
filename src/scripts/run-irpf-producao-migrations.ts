/**
 * Aplica todas as migrações MySQL do módulo IRPF Produção (020 a 026).
 * Execute quando a tabela irpf_producao_issues ou outras não existirem.
 *
 * Uso: npx ts-node src/scripts/run-irpf-producao-migrations.ts
 * ou: npm run build && node dist/scripts/run-irpf-producao-migrations.js
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });
import { readFileSync } from 'fs';
import { join } from 'path';
import { mysqlPool } from '../config/mysql';

const IRPF_MIGRATIONS = [
  '020_create_irpf_producao_cases.sql',
  '021_create_irpf_producao_documents.sql',
  '022_create_irpf_producao_issues_audit_jobs.sql',
  '023_add_irpf_issues_due_date.sql',
  '024_create_irpf_producao_extraction_tables.sql',
  '025_create_irpf_producao_post_delivery_occurrences.sql',
  '026_create_irpf_producao_declaration_tables.sql',
];

function parseStatements(sql: string): string[] {
  const lines = sql.split(/\r?\n/);
  const block = lines
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('--'))
    .join('\n');
  // Dividir por ";\n" para não quebrar ponto-e-vírgula dentro de COMMENT='...;...'
  const statements = block
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
  if (statements.length === 0 && block.length > 10) {
    return [block];
  }
  return statements;
}

async function run() {
  const basePath = join(__dirname, '../../docs/migrations/mysql');
  const connection = await mysqlPool.getConnection();

  try {
    for (const file of IRPF_MIGRATIONS) {
      const path = join(basePath, file);
      console.log(`\n📄 ${file}`);
      const sql = readFileSync(path, 'utf-8');
      const statements = parseStatements(sql);

      for (let i = 0; i < statements.length; i++) {
        let cmd = statements[i] + ';';
        try {
          await connection.query(cmd);
          console.log(`   ✅ [${i + 1}/${statements.length}] OK`);
        } catch (err: any) {
          const isParseOrSyntax = err.code === 'ER_PARSE_ERROR' || err.message?.includes('syntax');
          const isAddColumnIfNotExists = cmd.includes('ADD COLUMN IF NOT EXISTS');
          if (isParseOrSyntax && isAddColumnIfNotExists) {
            try {
              const fallback = cmd.replace(/ADD COLUMN IF NOT EXISTS/g, 'ADD COLUMN');
              await connection.query(fallback);
              console.log(`   ✅ [${i + 1}/${statements.length}] OK (fallback ADD COLUMN)`);
            } catch (err2: any) {
              if (err2.code === 'ER_DUP_FIELDNAME' || err2.message?.includes('Duplicate column name')) {
                console.log(`   ⚠️  [${i + 1}] Coluna já existe (pulando)`);
              } else {
                console.error(`   ❌ Erro:`, err2.message);
                throw err2;
              }
            }
          } else if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.message?.includes('already exists')) {
            console.log(`   ⚠️  [${i + 1}] Já existe (pulando)`);
          } else if (err.code === 'ER_DUP_FIELDNAME' || err.message?.includes('Duplicate column name')) {
            console.log(`   ⚠️  [${i + 1}] Coluna já existe (pulando)`);
          } else {
            console.error(`   ❌ Erro:`, err.message);
            throw err;
          }
        }
      }
    }
    console.log('\n✅ Migrações IRPF Produção (020-026) aplicadas.');
  } finally {
    connection.release();
    process.exit(0);
  }
}

run().catch(e => {
  console.error('Falha:', e);
  process.exit(1);
});

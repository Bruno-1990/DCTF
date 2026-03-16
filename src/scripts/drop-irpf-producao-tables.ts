/**
 * Remove todas as tabelas do módulo IRPF Produção do MySQL.
 * Usa as variáveis de ambiente do .env (MYSQL_*).
 *
 * Uso: npm run drop:irpf-producao
 * Ou:  npx ts-node src/scripts/drop-irpf-producao-tables.ts
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { getConnection } from '../config/mysql';

const IRPF_TABLES = [
  'irpf_producao_declaration_totals',
  'irpf_producao_declaration_debts',
  'irpf_producao_declaration_assets',
  'irpf_producao_declaration_payments',
  'irpf_producao_declaration_dependents',
  'irpf_producao_declaration_income_exclusive',
  'irpf_producao_declaration_income_exempt',
  'irpf_producao_declaration_income_pf',
  'irpf_producao_declaration_income_pj',
  'irpf_producao_dec_layout_version',
  'irpf_producao_post_delivery_occurrences',
  'irpf_producao_document_extracted_data',
  'irpf_producao_document_extraction_config',
  'irpf_producao_job_runs',
  'irpf_producao_jobs',
  'irpf_producao_audit_events',
  'irpf_producao_issues',
  'irpf_producao_documents',
  'irpf_producao_case_people',
  'irpf_producao_cases',
];

async function main() {
  console.log('\n=== Remoção das tabelas IRPF Produção (MySQL) ===\n');
  let conn;
  try {
    conn = await getConnection();
    await conn.execute('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of IRPF_TABLES) {
      await conn.execute(`DROP TABLE IF EXISTS \`${table}\``);
      console.log(`  Dropped: ${table}`);
    }
    await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
    console.log('\n✅ Tabelas IRPF Produção removidas.\n');
  } catch (err: any) {
    console.error('Erro:', err?.message || err);
    process.exit(1);
  } finally {
    conn?.release();
  }
}

main();

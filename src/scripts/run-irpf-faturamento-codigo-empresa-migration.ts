/**
 * Migration 029: Adiciona coluna codigo_empresa às tabelas de cache IRPF faturamento.
 * Usa as variáveis de ambiente do .env (MYSQL_*).
 *
 * Uso: npx ts-node src/scripts/run-irpf-faturamento-codigo-empresa-migration.ts
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { executeQuery } from '../config/mysql';

const ALTERS = [
  `ALTER TABLE \`irpf_faturamento_consolidado\`
    ADD COLUMN \`codigo_empresa\` INT NOT NULL DEFAULT 1 AFTER \`codigo_sci\``,
  `ALTER TABLE \`irpf_faturamento_mini\`
    ADD COLUMN \`codigo_empresa\` INT NOT NULL DEFAULT 1 AFTER \`codigo_sci\``,
];

async function main() {
  console.log('\n=== Migration 029: codigo_empresa em irpf_faturamento_* ===\n');
  for (let i = 0; i < ALTERS.length; i++) {
    const table = i === 0 ? 'irpf_faturamento_consolidado' : 'irpf_faturamento_mini';
    try {
      await executeQuery(ALTERS[i]);
      console.log(`  OK: ${table} – coluna codigo_empresa adicionada.`);
    } catch (err: any) {
      if (err?.code === 'ER_DUP_FIELDNAME' || err?.message?.includes('Duplicate column name')) {
        console.log(`  (já existe) ${table} – codigo_empresa.`);
      } else {
        console.error(`  Erro em ${table}:`, err?.message || err);
        process.exit(1);
      }
    }
  }
  console.log('\n✅ Migration 029 concluída.\n');
  process.exit(0);
}

main();

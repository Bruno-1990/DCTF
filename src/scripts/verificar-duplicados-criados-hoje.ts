/**
 * Entre os pares (cnpj, periodo) duplicados, verifica quantos registros foram criados hoje.
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { executeQuery } from '../config/mysql';

async function main() {
  const hoje = new Date().toISOString().slice(0, 10);
  console.log('\nData de hoje:', hoje);
  console.log('Duplicados (cnpj + periodo) com algum registro created_at = hoje:\n');

  // IDs que fazem parte de pares duplicados e têm created_at = hoje
  const rows = await executeQuery<{ id: string; cnpj: string; periodo_apuracao: string; created_at: string }>(
    `SELECT d.id, d.cnpj, d.periodo_apuracao, d.created_at
     FROM dctf_declaracoes d
     INNER JOIN (
       SELECT cnpj, periodo_apuracao
       FROM dctf_declaracoes
       GROUP BY cnpj, periodo_apuracao
       HAVING COUNT(*) > 1
     ) dup ON d.cnpj = dup.cnpj AND d.periodo_apuracao = dup.periodo_apuracao
     WHERE DATE(d.created_at) = ?`,
    [hoje]
  );

  console.log('Registros duplicados criados hoje:', rows.length);
  if (rows.length > 0) {
    console.log('');
    rows.forEach((r) => console.log(`  ${r.id} | CNPJ ${r.cnpj} | ${r.periodo_apuracao} | ${r.created_at}`));
  }
  console.log('');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

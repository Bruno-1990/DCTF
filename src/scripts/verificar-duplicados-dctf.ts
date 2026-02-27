/**
 * Verifica registros duplicados em dctf_declaracoes (mesmo cnpj + periodo_apuracao).
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { executeQuery } from '../config/mysql';

async function main() {
  console.log('\n=== Duplicados em dctf_declaracoes (cnpj + periodo_apuracao) ===\n');

  // Pares (cnpj, periodo) que aparecem mais de uma vez
  const duplicados = await executeQuery<{ cnpj: string; periodo_apuracao: string; qtd: number }>(
    `SELECT cnpj, periodo_apuracao, COUNT(*) AS qtd 
     FROM dctf_declaracoes 
     GROUP BY cnpj, periodo_apuracao 
     HAVING COUNT(*) > 1 
     ORDER BY qtd DESC`
  );

  const totalParesDuplicados = duplicados.length;
  const totalRegistrosEmDuplicatas = duplicados.reduce((s, r) => s + Number(r.qtd), 0);
  const registrosExcedentes = totalRegistrosEmDuplicatas - totalParesDuplicados; // quantos seriam "a mais"

  console.log('Pares (CNPJ + período) com mais de 1 registro:', totalParesDuplicados);
  console.log('Total de registros nesses pares:', totalRegistrosEmDuplicatas);
  console.log('Registros "excedentes" (duplicatas):', registrosExcedentes);
  console.log('');

  if (duplicados.length === 0) {
    console.log('Nenhum duplicado encontrado.\n');
    process.exit(0);
    return;
  }

  console.log('Amostra (até 15 pares):');
  const amostra = duplicados.slice(0, 15);
  amostra.forEach((r) => console.log(`  CNPJ ${r.cnpj} | Período ${r.periodo_apuracao} | ${r.qtd} registros`));
  if (duplicados.length > 15) {
    console.log(`  ... e mais ${duplicados.length - 15} par(es).`);
  }
  console.log('');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Remove registros duplicados das tabelas de cache IRPF faturamento.
 * Mantém um registro por (cliente_id, codigo_empresa, ano) no mini
 * e por (cliente_id, codigo_empresa, ano, mes) no consolidado e detalhado.
 *
 * Uso: npx ts-node src/scripts/remover-duplicados-irpf-faturamento.ts
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { executeQuery } from '../config/mysql';

async function main() {
  console.log('\n=== Remoção de duplicados – cache IRPF faturamento ===\n');

  // 1. irpf_faturamento_mini: manter um por (cliente_id, codigo_empresa, ano)
  try {
    const r = await executeQuery<any>(`
      DELETE t1 FROM \`irpf_faturamento_mini\` t1
      INNER JOIN \`irpf_faturamento_mini\` t2
        ON t1.cliente_id = t2.cliente_id
       AND t1.codigo_empresa = t2.codigo_empresa
       AND t1.ano = t2.ano
       AND t1.id > t2.id
    `);
    console.log('  irpf_faturamento_mini: duplicados removidos.');
  } catch (err: any) {
    console.error('  irpf_faturamento_mini:', err?.message || err);
    process.exit(1);
  }

  // 2. irpf_faturamento_consolidado: manter um por (cliente_id, codigo_empresa, ano, mes)
  try {
    await executeQuery(`
      DELETE t1 FROM \`irpf_faturamento_consolidado\` t1
      INNER JOIN \`irpf_faturamento_consolidado\` t2
        ON t1.cliente_id = t2.cliente_id
       AND t1.codigo_empresa = t2.codigo_empresa
       AND t1.ano = t2.ano
       AND t1.mes = t2.mes
       AND t1.id > t2.id
    `);
    console.log('  irpf_faturamento_consolidado: duplicados removidos.');
  } catch (err: any) {
    console.error('  irpf_faturamento_consolidado:', err?.message || err);
    process.exit(1);
  }

  // 3. irpf_faturamento_detalhado: manter um por (cliente_id, codigo_empresa, ano, mes)
  try {
    await executeQuery(`
      DELETE t1 FROM \`irpf_faturamento_detalhado\` t1
      INNER JOIN \`irpf_faturamento_detalhado\` t2
        ON t1.cliente_id = t2.cliente_id
       AND t1.codigo_empresa = t2.codigo_empresa
       AND t1.ano = t2.ano
       AND t1.mes = t2.mes
       AND t1.id > t2.id
    `);
    console.log('  irpf_faturamento_detalhado: duplicados removidos.');
  } catch (err: any) {
    console.error('  irpf_faturamento_detalhado:', err?.message || err);
    process.exit(1);
  }

  console.log('\n✅ Concluído.\n');
  process.exit(0);
}

main();

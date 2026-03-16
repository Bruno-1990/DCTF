/**
 * Remove "Filial falsa" do cache IRPF para TODOS os clientes: quando codigo_empresa
 * é igual ao codigo_sci do cliente (ex.: Filial 29 para cliente com codigo_sci=29),
 * esses registros são da Matriz no SCI, não de uma filial real.
 *
 * Uso: npx ts-node src/scripts/remover-todas-filiais-falsas-irpf.ts
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { executeQuery } from '../config/mysql';

async function main() {
  console.log('\n=== Remover todas as "Filial falsa" (codigo_empresa = codigo_sci) ===\n');

  const clientes = await executeQuery<any>(
    `SELECT id, razao_social, codigo_sci FROM clientes WHERE codigo_sci IS NOT NULL AND codigo_sci != 1 AND codigo_sci != 0`
  );

  if (!clientes || clientes.length === 0) {
    console.log('  Nenhum cliente com codigo_sci > 1 encontrado.');
    process.exit(0);
  }

  let totalMini = 0, totalConsolidado = 0, totalDetalhado = 0;

  for (const c of clientes) {
    const clienteId = c.id;
    const codigoSci = Number(c.codigo_sci);
    const razao = (c.razao_social || '').slice(0, 45);

    const counts = await executeQuery<any>(
      `SELECT
        (SELECT COUNT(*) FROM irpf_faturamento_mini WHERE cliente_id = ? AND codigo_empresa = ?) as mini,
        (SELECT COUNT(*) FROM irpf_faturamento_consolidado WHERE cliente_id = ? AND codigo_empresa = ?) as cons,
        (SELECT COUNT(*) FROM irpf_faturamento_detalhado WHERE cliente_id = ? AND codigo_empresa = ?) as det`,
      [clienteId, codigoSci, clienteId, codigoSci, clienteId, codigoSci]
    );
    const m = Number(counts?.[0]?.mini ?? 0);
    const co = Number(counts?.[0]?.cons ?? 0);
    const d = Number(counts?.[0]?.det ?? 0);
    if (m === 0 && co === 0 && d === 0) continue;

    await executeQuery(
      `DELETE FROM irpf_faturamento_mini WHERE cliente_id = ? AND codigo_empresa = ?`,
      [clienteId, codigoSci]
    );
    await executeQuery(
      `DELETE FROM irpf_faturamento_consolidado WHERE cliente_id = ? AND codigo_empresa = ?`,
      [clienteId, codigoSci]
    );
    await executeQuery(
      `DELETE FROM irpf_faturamento_detalhado WHERE cliente_id = ? AND codigo_empresa = ?`,
      [clienteId, codigoSci]
    );

    totalMini += m;
    totalConsolidado += co;
    totalDetalhado += d;
    console.log(`  ${razao} (sci=${codigoSci}): mini=${m}, consolidado=${co}, detalhado=${d}`);
  }

  console.log(`\n  Total removido: mini=${totalMini}, consolidado=${totalConsolidado}, detalhado=${totalDetalhado}`);
  console.log('\n✅ Concluído. Na tela deve aparecer apenas Matriz para essas empresas.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

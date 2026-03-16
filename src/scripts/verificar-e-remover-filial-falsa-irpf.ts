/**
 * Verifica no banco os registros de faturamento IRPF por codigo_empresa e,
 * para o cliente ADRIA (codigo_sci=3 / CNPJ 07799121000194), remove registros
 * que estejam como "Filial" (codigo_empresa != 1), mantendo só Matriz.
 *
 * Uso: npx ts-node src/scripts/verificar-e-remover-filial-falsa-irpf.ts
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { executeQuery } from '../config/mysql';

const CNPJ_ADRIA = '07799121000194'; // 07.799.121/0001-94
const CODIGO_SCI_ADRIA = 3;

async function main() {
  console.log('\n=== Verificar e remover "Filial" falsa (IRPF faturamento) ===\n');

  // 1. Buscar cliente por codigo_sci ou CNPJ
  const clientes = await executeQuery<any>(
    `SELECT id, razao_social, cnpj_limpo, codigo_sci FROM clientes WHERE codigo_sci = ? OR cnpj_limpo = ? LIMIT 1`,
    [CODIGO_SCI_ADRIA, CNPJ_ADRIA]
  );

  if (!clientes || clientes.length === 0) {
    console.log('  Cliente não encontrado com codigo_sci=3 ou CNPJ 07799121000194.');
    process.exit(1);
  }

  const cliente = clientes[0];
  const clienteId = cliente.id;
  const razao = cliente.razao_social || '';
  const codigoSci = cliente.codigo_sci;

  console.log(`  Cliente: ${razao}`);
  console.log(`  ID: ${clienteId}, codigo_sci: ${codigoSci}\n`);

  // 2. Mostrar o que existe hoje por codigo_empresa
  const miniRows = await executeQuery<any>(
    `SELECT codigo_empresa, ano, valor_total, updated_at FROM irpf_faturamento_mini WHERE cliente_id = ? ORDER BY codigo_empresa, ano`,
    [clienteId]
  );

  console.log('  --- irpf_faturamento_mini (antes) ---');
  if (miniRows && miniRows.length > 0) {
    for (const r of miniRows) {
      const tipo = r.codigo_empresa === 1 ? 'Matriz' : `Filial ${r.codigo_empresa}`;
      console.log(`    codigo_empresa=${r.codigo_empresa} (${tipo}), ano=${r.ano}, valor_total=${r.valor_total}`);
    }
  } else {
    console.log('    (nenhum registro)');
  }

  const detalhadoRows = await executeQuery<any>(
    `SELECT codigo_empresa, ano, mes FROM irpf_faturamento_detalhado WHERE cliente_id = ? GROUP BY codigo_empresa, ano, mes ORDER BY codigo_empresa, ano, mes`,
    [clienteId]
  );
  const numDetalhado = await executeQuery<any>(
    `SELECT COUNT(*) as n FROM irpf_faturamento_detalhado WHERE cliente_id = ?`,
    [clienteId]
  );
  console.log('\n  --- irpf_faturamento_detalhado ---');
  console.log(`    Total de linhas: ${numDetalhado?.[0]?.n ?? 0}`);
  if (detalhadoRows && detalhadoRows.length > 0) {
    const porEmpresa = new Map<number, number>();
    for (const r of detalhadoRows) {
      const e = Number(r.codigo_empresa);
      porEmpresa.set(e, (porEmpresa.get(e) || 0) + 1);
    }
    porEmpresa.forEach((count, cod) => {
      console.log(`    codigo_empresa=${cod} (${cod === 1 ? 'Matriz' : 'Filial ' + cod}): ${count} registro(s)`);
    });
  }

  // 3. Remover registros com codigo_empresa != 1 (manter só Matriz)
  console.log('\n  Removendo registros com codigo_empresa != 1 (Filial falsa)...');

  const delMini = await executeQuery(
    `DELETE FROM irpf_faturamento_mini WHERE cliente_id = ? AND codigo_empresa != 1`,
    [clienteId]
  );
  const delConsolidado = await executeQuery(
    `DELETE FROM irpf_faturamento_consolidado WHERE cliente_id = ? AND codigo_empresa != 1`,
    [clienteId]
  );
  const delDetalhado = await executeQuery(
    `DELETE FROM irpf_faturamento_detalhado WHERE cliente_id = ? AND codigo_empresa != 1`,
    [clienteId]
  );

  console.log('  irpf_faturamento_mini: linhas com codigo_empresa != 1 removidas.');
  console.log('  irpf_faturamento_consolidado: linhas com codigo_empresa != 1 removidas.');
  console.log('  irpf_faturamento_detalhado: linhas com codigo_empresa != 1 removidas.');

  // 4. Mostrar depois
  const miniDepois = await executeQuery<any>(
    `SELECT codigo_empresa, ano, valor_total FROM irpf_faturamento_mini WHERE cliente_id = ? ORDER BY ano`,
    [clienteId]
  );
  console.log('\n  --- irpf_faturamento_mini (depois) ---');
  if (miniDepois && miniDepois.length > 0) {
    for (const r of miniDepois) {
      console.log(`    codigo_empresa=${r.codigo_empresa} (Matriz), ano=${r.ano}, valor_total=${r.valor_total}`);
    }
  } else {
    console.log('    (nenhum registro)');
  }

  console.log('\n✅ Concluído. Na tela deve aparecer apenas Matriz para esta empresa.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

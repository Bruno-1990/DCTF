/**
 * Prova que a regra extraída para `DetProcuracoesRegra` decide igual à carga
 * inicial — sem depender do SPE nem de navegador.
 *
 * COMO: alimenta a reconciliação com o MESMO retrato do SPE que semeou o banco
 * em 21/08/2026, em modo seco. Se a regra sobreviveu à extração intacta, o
 * resultado é ZERO mudança: cada cliente é reclassificado exatamente na
 * situação em que já está gravado.
 *
 * Qualquer mudança aqui é regressão, não novidade — o retrato é o mesmo e o
 * banco saiu dele.
 *
 *   npx ts-node src/scripts/det-verificar-regra.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '.env') });
import { mysqlPool } from '../config/mysql';
import { reconciliarProcuracoes } from '../services/DetProcuracoesSync';
import type { ProcSpe } from '../services/DetProcuracoesRegra';

const SNAPSHOT = path.join(process.cwd(), 'data', 'det', 'spe-recebidas-2026-08-21.json');

async function run(): Promise<void> {
  const procs: ProcSpe[] = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  console.log(`Retrato de 21/08/2026: ${procs.length} linha(s).\n`);

  const r = await reconciliarProcuracoes(procs, { dryRun: true, log: (m) => console.log('  ' + m) });

  console.log('\n--- o que a regra decide hoje ---');
  console.table([
    {
      'clientes avaliados': r.clientesAvaliados,
      deferidos: r.deferidos,
      indeferidos: r.indeferidos,
      ganhariam: r.ganharam,
      perderiam: r.perderam,
    },
  ]);

  const [gravado] = await mysqlPool.query<any[]>(
    `SELECT situacao, COUNT(*) AS n FROM det_procuracoes GROUP BY situacao`
  );
  console.log('--- o que está gravado ---');
  console.table(gravado);

  if (r.mudancas.length === 0) {
    console.log('\n✔ ZERO mudanças — a regra extraída decide igual à carga inicial.');
  } else {
    console.log(`\n✗ ${r.mudancas.length} divergência(s) — a extração MUDOU a regra:`);
    console.table(
      r.mudancas.slice(0, 30).map((m) => ({
        cnpj: m.cnpj,
        cliente: m.razaoSocial.slice(0, 34),
        de: m.de,
        para: m.para,
        motivo: m.motivo.slice(0, 44),
      }))
    );
    process.exitCode = 1;
  }

  await mysqlPool.end();
}

run().catch(async (e) => {
  console.error('Falhou:', e?.message ?? e);
  await mysqlPool.end().catch(() => undefined);
  process.exit(1);
});

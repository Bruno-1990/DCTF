/**
 * Roda a coleta do DET na mão, com log no terminal.
 *
 *   npm run det:coleta -- --limite=3
 *
 * `--limite` existe para exercitar o caminho real em poucos clientes antes de
 * soltar os 132: uma varredura completa passa de uma hora.
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '.env') });
import { DetColetorService } from '../services/DetColetorService';
import { mysqlPool } from '../config/mysql';

const arg = process.argv.find((a) => a.startsWith('--limite='));
const limite = arg ? Number(arg.split('=')[1]) : undefined;
// --faltantes: pula quem já foi coletado hoje. Serve para RETOMAR uma coleta
// interrompida sem refazer os já varridos.
const faltantes = process.argv.includes('--faltantes');

(async () => {
  const t0 = Date.now();
  const coletor = new DetColetorService((m) => console.log('  ' + m));
  console.log(
    limite
      ? `Coleta manual (limite ${limite})`
      : faltantes
        ? 'Coleta manual (só os que faltam hoje)'
        : 'Coleta manual (todos)'
  );
  try {
    const r = await coletor.executar('manual', limite, { pularColetadosHoje: faltantes });
    const seg = Math.round((Date.now() - t0) / 1000);
    console.log('\n=== RESULTADO ===');
    console.log(`  coleta #${r.coletaId} em ${seg}s`);
    console.log(`  coletados : ${r.coletados}/${r.total}`);
    console.log(`  erros     : ${r.erros}`);
    console.log(`  novas     : ${r.mensagensNovas} (${r.notificacoesNovas} notificações)`);
    console.log(`  reautent. : ${r.reautenticacoes}`);
    const falhas = r.detalhes.filter((d) => !d.ok);
    if (falhas.length) {
      console.log('\n  FALHAS:');
      falhas.forEach((f) => console.log(`    ${f.cnpj} — ${f.motivo}`));
    }
    const truncados = r.detalhes.filter((d) => d.paginasNaoLidas);
    if (truncados.length) {
      console.log(`\n  ATENÇÃO: ${truncados.length} cliente(s) com mais páginas não lidas.`);
    }
  } catch (e: any) {
    console.error('FALHOU:', e?.message ?? e);
    process.exitCode = 1;
  } finally {
    await mysqlPool.end();
  }
})();

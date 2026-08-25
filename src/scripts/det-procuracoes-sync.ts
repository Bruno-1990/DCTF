/**
 * Varredura das procurações no SPE, fora da coleta.
 *
 *   npm run det:procuracoes:dry   -> lê o SPE, mostra o diff, NÃO grava
 *   npm run det:procuracoes       -> lê o SPE e grava
 *
 * POR QUE EXISTE O MODO SECO: a leitura do SPE decide quem entra na varredura
 * do dia. Um erro aqui não aparece como falha — aparece como cliente que
 * silenciosamente deixou de ser conferido. O modo seco imprime exatamente o que
 * mudaria, para conferir contra a tela do SPE antes de qualquer escrita. Mesma
 * ideia do `scrape:dry` do scraper do eCAC.
 *
 * PRECISA DE UM EDGE JÁ AUTENTICADO no gov.br (o login tem hCaptcha e exige uma
 * pessoa). Abra assim, faça "Entrar com gov.br > Seu certificado digital" e
 * deixe a janela aberta:
 *
 *   "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" ^
 *     --remote-debugging-port=9222 ^
 *     --user-data-dir=C:\ProgramData\dctf-det-edge ^
 *     https://det.sit.trabalho.gov.br/
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
// Carrega o .env ANTES de importar o pool MySQL (que lê process.env no load).
dotenv.config({ path: path.join(process.cwd(), '.env') });
import { DetColetorService } from '../services/DetColetorService';
import { mysqlPool } from '../config/mysql';

const seco = process.argv.includes('--dry') || process.argv.includes('--seco');

async function run(): Promise<void> {
  console.log(
    seco
      ? '=== VARREDURA DE PROCURAÇÕES — MODO SECO (nada será gravado) ===\n'
      : '=== VARREDURA DE PROCURAÇÕES — GRAVANDO ===\n'
  );

  const coletor = new DetColetorService((m) => console.log('  ' + m));
  const r = await coletor.sincronizarProcuracoes({ dryRun: seco });

  console.log('\n--- resumo ---');
  console.table([
    {
      'lidas no SPE': r.lidasNoSpe,
      'clientes avaliados': r.clientesAvaliados,
      deferidos: r.deferidos,
      indeferidos: r.indeferidos,
      ganharam: r.ganharam,
      perderam: r.perderam,
    },
  ]);

  if (r.manuaisConfirmadas || r.manuaisSemConfirmacao) {
    console.log(
      `\nmarcações manuais: ${r.manuaisConfirmadas} confirmada(s) pelo SPE, ` +
        `${r.manuaisSemConfirmacao} sem confirmação`
    );
  }

  if (r.mudancas.length) {
    console.log(`\n--- ${r.mudancas.length} mudança(s) ---`);
    console.table(
      r.mudancas.map((m) => ({
        cnpj: m.cnpj,
        cliente: m.razaoSocial.slice(0, 38),
        de: m.de,
        para: m.para,
        motivo: m.motivo.slice(0, 46),
      }))
    );
  } else {
    console.log('\nNenhuma mudança — a lista de procurações já estava em dia.');
  }

  if (seco) {
    console.log(
      '\nMODO SECO: nada foi gravado. Confira os números acima contra a aba\n' +
        '"Recebidas (sou Outorgado)" do SPE e rode sem --dry para aplicar.'
    );
  }

  await mysqlPool.end();
}

run().catch(async (e) => {
  console.error('\nFalhou:', e?.message ?? e);
  await mysqlPool.end().catch(() => undefined);
  process.exit(1);
});

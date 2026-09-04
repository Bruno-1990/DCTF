/**
 * Roda o lote de DARF uma vez e sai. É o que o Server Manager agenda.
 *
 *   npm run darf:lote                 → competência conforme DARF_LOTE_COMPETENCIA
 *   npm run darf:lote -- 2026 08      → competência explícita (ano mês)
 *   npm run darf:lote -- --forcar     → reemite mesmo quem já tem guia
 *
 * POR QUE UM PROCESSO SEPARADO, E NÃO O AGENDADOR DENTRO DA API:
 *   O agendador interno depende da API estar de pé no minuto exato e some junto
 *   com ela num restart. Como processo próprio, a rodada aparece no painel do
 *   Server Manager com log e código de saída — dá para ver que rodou, quanto
 *   demorou e o que aconteceu, sem caçar linha em log de servidor web.
 *
 * CÓDIGO DE SAÍDA, que é o que o painel lê:
 *   0 → a rodada terminou (mesmo com falhas de clientes: cliente sem débito é
 *       resposta legítima da Receita, não defeito da rotina)
 *   1 → a rodada não aconteceu: pasta fora do ar, carteira vazia, banco caído
 *
 * A distinção importa. Marcar vermelho porque duas empresas não tinham débito
 * treinaria todo mundo a ignorar o vermelho.
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
// Carrega o .env ANTES de importar qualquer coisa que leia process.env no load
// (o pool MySQL e as constantes de DarfLoteService fazem exatamente isso).
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { mysqlPool } from '../config/mysql';
import darfLoteService, { competenciaAlvo, modoCompetencia } from '../services/DarfLoteService';

const brl = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const forcar = args.includes('--forcar');
  const posicionais = args.filter((a) => !a.startsWith('--'));

  // Ano e mês na linha de comando vencem a regra do .env: é assim que se
  // reprocessa uma competência antiga sem mexer em configuração.
  const alvo =
    posicionais.length >= 2
      ? { anoPA: posicionais[0]!, mesPA: posicionais[1]!.padStart(2, '0') }
      : competenciaAlvo();

  console.log(
    `[darf:lote] Competência ${alvo.mesPA}/${alvo.anoPA} ` +
      `(regra: ${posicionais.length >= 2 ? 'informada na linha de comando' : modoCompetencia()})` +
      (forcar ? ' — FORÇANDO reemissão' : '')
  );

  const r = await darfLoteService.executar({
    anoPA: alvo.anoPA,
    mesPA: alvo.mesPA,
    disparadoPor: 'server-manager',
    forcar,
  });

  if (r.abortadoPor) {
    console.error(`[darf:lote] RODADA NÃO EXECUTADA — ${r.abortadoPor}`);
    return 1;
  }

  for (const i of r.itens) {
    const quem = (i.razaoSocial || i.cnpj).slice(0, 42);
    const sci = (i.codigoSci || '?').padStart(4);
    if (i.status === 'falha') {
      console.log(`  ${sci}  FALHA          ${quem} — ${i.erro}`);
    } else {
      console.log(`  ${sci}  ${i.status.padEnd(14)} ${quem} → ${i.arquivo}`);
    }
  }

  console.log(
    `[darf:lote] ${r.emitidos} emitida(s), ${r.reaproveitados} reaproveitada(s), ` +
      `${r.falhas} sem guia. Total ${brl(r.valorTotal)}.`
  );
  console.log(`[darf:lote] Pasta: ${r.pastaDestino}`);
  console.log(
    r.emailEnviado
      ? '[darf:lote] Relatório enviado ao DP.'
      : `[darf:lote] ATENÇÃO — relatório NÃO enviado: ${r.emailErro ?? 'motivo não informado'}`
  );

  return 0;
}

main()
  .then(async (codigo) => {
    // O pool segura o processo vivo; sem fechar, a tarefa agendada nunca
    // terminaria e o painel a mostraria rodando para sempre.
    await mysqlPool.end().catch(() => undefined);
    process.exit(codigo);
  })
  .catch(async (e) => {
    console.error('[darf:lote] ERRO:', e?.message ?? e);
    await mysqlPool.end().catch(() => undefined);
    process.exit(1);
  });

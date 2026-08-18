/**
 * Consulta regime tributário no OneClick para clientes sem regime no DCTF_WEB e atualiza.
 * Uso: npx ts-node src/scripts/preencher-regime-via-oneclick.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { mapTributacaoToRegimeCode, getEmpresaId } from '../services/oneclick.mappers';

const projectRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const regimeMap: Record<number, string> = {
  1: 'LUCRO PRESUMIDO',
  2: 'LUCRO REAL',
  4: 'SIMPLES NACIONAL',
  5: 'SIMPLES NACIONAL',
};

async function main() {
  const { getConnection } = await import('../config/mysql');
  const { getOneClickPool } = await import('../config/oneclick');

  const conn = await getConnection();
  const ocPool = getOneClickPool();

  try {
    // 1. Buscar clientes sem regime no DCTF_WEB
    const [semRegime] = await conn.execute(
      `SELECT id, cnpj_limpo, razao_social
       FROM clientes
       WHERE regime_tributario IS NULL OR TRIM(COALESCE(regime_tributario, '')) = ''
       ORDER BY razao_social`
    );
    const lista = semRegime as { id: string; cnpj_limpo: string; razao_social: string }[];

    if (lista.length === 0) {
      console.log('Nenhum cliente sem regime tributário. Nada a fazer.');
      return;
    }

    console.log(`\n${lista.length} cliente(s) sem regime. Consultando OneClick...\n`);

    let atualizados = 0;
    let naoEncontrados = 0;
    let semRegimeOC = 0;

    for (const cli of lista) {
      const cnpjLimpo = cli.cnpj_limpo.replace(/\D/g, '');

      // Buscar no OneClick de prod (public.clientes) por CNPJ (documento pode estar formatado)
      const { rows: ocRows } = await ocPool.query<{ tributacao: string | null }>(
        `SELECT tributacao
         FROM public.clientes
         WHERE regexp_replace(documento, '\\D', '', 'g') = $1
           AND tipo_documento = 'CNPJ'
           AND empresa_id = $2
         LIMIT 1`,
        [cnpjLimpo, getEmpresaId()]
      );

      if (!ocRows.length) {
        console.log(`  X ${cli.razao_social} [${cnpjLimpo}] -- nao encontrado no OneClick`);
        naoEncontrados++;
        continue;
      }

      const codigoRegime = mapTributacaoToRegimeCode(ocRows[0].tributacao);
      const regimeTexto = codigoRegime ? regimeMap[codigoRegime] || null : null;

      if (!regimeTexto) {
        console.log(`  ! ${cli.razao_social} [${cnpjLimpo}] -- OneClick regime=${codigoRegime} (sem mapeamento)`);
        semRegimeOC++;
        continue;
      }

      // Atualizar no DCTF_WEB. O regime é a fonte de verdade: derivamos
      // simples_optante junto para não criar divergência optante x regime.
      const simplesOptante = /simples/i.test(regimeTexto) ? 1 : 0;
      await conn.execute(
        `UPDATE clientes SET regime_tributario = ?, simples_optante = ?, updated_at = NOW() WHERE id = ?`,
        [regimeTexto, simplesOptante, cli.id]
      );
      console.log(`  OK ${cli.razao_social} [${cnpjLimpo}] -> ${regimeTexto}`);
      atualizados++;
    }

    console.log('\n========================================');
    console.log(`Atualizados:       ${atualizados}`);
    console.log(`Nao encontrados:   ${naoEncontrados}`);
    console.log(`Sem regime no OC:  ${semRegimeOC}`);
    console.log('========================================\n');
  } finally {
    conn.release();
    await ocPool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

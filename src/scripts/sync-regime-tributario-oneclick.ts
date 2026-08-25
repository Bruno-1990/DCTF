/**
 * Sincroniza o Regime Tributário do OneClick (PROD, `public.clientes.tributacao`)
 * para o DCTF_WEB (`clientes.regime_tributario`).
 *
 * Regras acordadas:
 *  - OneClick em branco (null/IMUNE/ISENTA/sem mapeamento) -> MANTÉM o que está no DCTF;
 *  - OneClick preenchido e DIFERENTE do DCTF -> traz o do OneClick;
 *  - regime é fonte de verdade: `simples_optante` é derivado dele.
 *
 * Sempre gera um XLSX (CNPJ | Razão Social | Antes | Depois) em `data/`.
 *
 * Uso:
 *   npx ts-node --transpile-only src/scripts/sync-regime-tributario-oneclick.ts          (dry-run)
 *   npx ts-node --transpile-only src/scripts/sync-regime-tributario-oneclick.ts --apply  (grava)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

const projectRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const APPLY = process.argv.includes('--apply');

/** Texto canônico do regime a partir do enum TaxRegime do OneClick. */
const TRIBUTACAO_PARA_REGIME: Record<string, string> = {
  LUCRO_PRESUMIDO: 'LUCRO PRESUMIDO',
  LUCRO_REAL: 'LUCRO REAL',
  SIMPLES_NACIONAL: 'SIMPLES NACIONAL',
  MEI: 'SIMPLES NACIONAL', // mesmo mapeamento já usado por Cliente.sincronizarComOneClick
};

const soDigitos = (v: string | null | undefined): string => (v || '').replace(/\D/g, '');

/** Normaliza para comparar (sem acento, sem espaço extra, maiúsculo). */
const norm = (v: string | null | undefined): string =>
  (v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

interface LinhaRelatorio {
  cnpj: string;
  razaoSocial: string;
  antes: string;
  depois: string;
}

interface OcRow {
  documento: string;
  razao_social: string | null;
  tributacao: string | null;
  situacao: string | null;
  status: string | null;
}

/** Entre linhas do mesmo CNPJ no OneClick, prefere a que tem tributação e é MENSAL/ATIVA. */
function melhorLinha(a: OcRow, b: OcRow): OcRow {
  const peso = (r: OcRow): number =>
    (r.tributacao ? 4 : 0) + (r.status === 'ATIVA' ? 2 : 0) + (r.situacao === 'MENSAL' ? 1 : 0);
  return peso(b) > peso(a) ? b : a;
}

async function main(): Promise<void> {
  const { getConnection } = await import('../config/mysql');
  const { getOneClickPool } = await import('../config/oneclick');
  const { getEmpresaId } = await import('../services/oneclick.mappers');
  const { ensureTunnel } = await import('../services/oneclickTunnel');

  await ensureTunnel();

  const conn = await getConnection();
  const ocPool = getOneClickPool();

  const alterados: LinhaRelatorio[] = [];
  const naoAlterados: (LinhaRelatorio & { motivo: string })[] = [];

  try {
    // 1) Clientes do DCTF_WEB
    const [dctfRows] = await conn.execute(
      `SELECT id, cnpj_limpo, razao_social, regime_tributario
         FROM clientes
        ORDER BY razao_social`,
    );
    const clientes = dctfRows as {
      id: string;
      cnpj_limpo: string;
      razao_social: string;
      regime_tributario: string | null;
    }[];

    // 2) Clientes do OneClick (tenant da Central), indexados por CNPJ só-dígitos.
    //    A normalização é feita no Node de propósito: no Postgres de prod o
    //    regexp_replace(documento, '\D', ...) não limpa a pontuação do documento.
    const { rows: ocRows } = await ocPool.query<OcRow>(
      `SELECT documento, razao_social, tributacao::text AS tributacao,
              situacao::text AS situacao, status::text AS status
         FROM public.clientes
        WHERE empresa_id = $1
          AND tipo_documento = 'CNPJ'
          AND deleted_at IS NULL`,
      [getEmpresaId()],
    );

    const porCnpj = new Map<string, OcRow>();
    for (const row of ocRows) {
      const cnpj = soDigitos(row.documento);
      if (cnpj.length !== 14) continue;
      const atual = porCnpj.get(cnpj);
      porCnpj.set(cnpj, atual ? melhorLinha(atual, row) : row);
    }

    console.log(`DCTF: ${clientes.length} cliente(s) | OneClick: ${porCnpj.size} CNPJ(s) do tenant\n`);

    for (const cli of clientes) {
      const cnpj = soDigitos(cli.cnpj_limpo);
      const antes = (cli.regime_tributario || '').trim();
      const base: LinhaRelatorio = { cnpj, razaoSocial: cli.razao_social, antes, depois: antes };

      const oc = porCnpj.get(cnpj);
      if (!oc) {
        naoAlterados.push({ ...base, motivo: 'CNPJ não encontrado no OneClick' });
        continue;
      }

      const depois = TRIBUTACAO_PARA_REGIME[norm(oc.tributacao)] || null;
      if (!depois) {
        naoAlterados.push({
          ...base,
          motivo: `Regime em branco no OneClick (${oc.tributacao || 'vazio'}) - mantido o do DCTF`,
        });
        continue;
      }

      if (norm(depois) === norm(antes)) {
        naoAlterados.push({ ...base, motivo: 'Igual nos dois sistemas' });
        continue;
      }

      if (APPLY) {
        const simplesOptante = /SIMPLES/.test(norm(depois)) ? 1 : 0;
        await conn.execute(
          `UPDATE clientes SET regime_tributario = ?, simples_optante = ?, updated_at = NOW() WHERE id = ?`,
          [depois, simplesOptante, cli.id],
        );
      }
      alterados.push({ ...base, depois });
      console.log(
        `  ${APPLY ? 'OK ' : 'DRY'} ${cli.razao_social} [${cnpj}]: ${antes || '(vazio)'} -> ${depois}`,
      );
    }

    // 3) Planilha
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Regime atualizado');
    ws.columns = [
      { header: 'CNPJ', key: 'cnpj', width: 20 },
      { header: 'Razão Social', key: 'razaoSocial', width: 55 },
      { header: 'Antes', key: 'antes', width: 22 },
      { header: 'Depois', key: 'depois', width: 22 },
    ];
    ws.getRow(1).font = { bold: true };
    alterados.forEach((l) => ws.addRow(l));

    const ws2 = wb.addWorksheet('Sem alteracao');
    ws2.columns = [
      { header: 'CNPJ', key: 'cnpj', width: 20 },
      { header: 'Razão Social', key: 'razaoSocial', width: 55 },
      { header: 'Regime no DCTF', key: 'antes', width: 22 },
      { header: 'Motivo', key: 'motivo', width: 60 },
    ];
    ws2.getRow(1).font = { bold: true };
    naoAlterados.forEach((l) => ws2.addRow(l));

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const outDir = path.join(projectRoot, 'data');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(
      outDir,
      `regime-tributario-oneclick-${APPLY ? 'aplicado' : 'dryrun'}-${stamp}.xlsx`,
    );
    await wb.xlsx.writeFile(outPath);

    console.log('\n========================================');
    console.log(`Modo:              ${APPLY ? 'APLICADO (banco atualizado)' : 'DRY-RUN (nada gravado)'}`);
    console.log(`Alterados:         ${alterados.length}`);
    console.log(`Sem alteracao:     ${naoAlterados.length}`);
    console.log(`Planilha:          ${outPath}`);
    console.log('========================================\n');
  } finally {
    conn.release();
    await ocPool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

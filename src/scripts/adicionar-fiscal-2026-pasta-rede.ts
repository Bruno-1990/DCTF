/**
 * Adiciona \FISCAL\2026 aos nome_pasta_rede que têm apenas 3 parâmetros:
 * \\192.168.0.9\Clientes\(Razão social)
 * Se já houver algo após a razão social (ex.: \CONTABIL\2025), não altera.
 *
 * Uso: npm run adicionar:fiscal-2026-rede  ou  npx ts-node src/scripts/adicionar-fiscal-2026-pasta-rede.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

const projectRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const PREFIXO = '\\\\192.168.0.9\\Clientes\\';
const SUFIXO_ADICIONAR = '\\FISCAL\\2026';

/** Retorna true se o caminho é exatamente \\192.168.0.9\Clientes\NomeCliente (sem subpastas). */
function soTemTresParametros(nomePastaRede: string | null): boolean {
  if (!nomePastaRede || typeof nomePastaRede !== 'string') return false;
  const p = nomePastaRede.trim();
  if (!p.startsWith(PREFIXO)) return false;
  const aposPrefix = p.slice(PREFIXO.length).trim();
  return aposPrefix.length > 0 && !aposPrefix.includes('\\');
}

async function main() {
  const { getConnection } = await import('../config/mysql');
  let connection;
  try {
    connection = await getConnection();
  } catch (e) {
    console.error('Erro ao conectar MySQL. Verifique .env (MYSQL_*).');
    process.exit(1);
  }

  try {
    const [rows] = await connection.execute(
      `SELECT id, razao_social, nome_pasta_rede FROM clientes WHERE nome_pasta_rede IS NOT NULL AND TRIM(nome_pasta_rede) != ''`
    );
    const list = rows as { id: string; razao_social: string; nome_pasta_rede: string }[];
    const paraAtualizar = list.filter((c) => soTemTresParametros(c.nome_pasta_rede));
    const ignorados = list.length - paraAtualizar.length;

    console.log('\n========================================');
    console.log('ADICIONAR \\FISCAL\\2026 À PASTA REDE');
    console.log('========================================');
    console.log(`Total com pasta preenchida: ${list.length}`);
    console.log(`Com só 3 parâmetros (serão atualizados): ${paraAtualizar.length}`);
    console.log(`Já com subpastas (ignorados): ${ignorados}\n`);

    if (paraAtualizar.length === 0) {
      console.log('Nenhum registro para alterar.\n');
      return;
    }

    let ok = 0;
    for (const c of paraAtualizar) {
      const novoPath = (c.nome_pasta_rede || '').trim() + SUFIXO_ADICIONAR;
      await connection.execute('UPDATE clientes SET nome_pasta_rede = ? WHERE id = ?', [novoPath, c.id]);
      ok++;
      console.log(`  [${ok}/${paraAtualizar.length}] ${(c.razao_social || '').slice(0, 50)}...`);
    }

    console.log('\n========================================');
    console.log(`Atualizados: ${ok}. Ignorados (já tinham subpasta): ${ignorados}`);
    console.log('========================================\n');
  } finally {
    connection.release();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

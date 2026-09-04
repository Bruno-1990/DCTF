/**
 * Executa as migrations da tabela `darfs_emitidos`, em ordem.
 *
 *   049 — generaliza o histórico e renomeia `sicalc_darfs` → `darfs_emitidos`
 *   050 — deixa só o DARF numerado e troca exclusão física por lógica
 *   051 — guia excluída deixa de guardar o PDF
 *   052 — lote mensal para a Acessórias (carteira + histórico das rodadas)
 *
 * Idempotentes: cada passo consulta o information_schema antes de agir, então
 * rodar de novo é seguro e serve de conferência.
 *
 *   npm run migrate:darf
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
// Carrega o .env ANTES de importar o pool MySQL (que lê process.env no load).
dotenv.config({ path: path.join(process.cwd(), '.env') });
import { mysqlPool } from '../config/mysql';

const PASTA = path.join(process.cwd(), 'docs', 'migrations', 'mysql');
const MIGRATIONS = [
  '049_darfs_emitidos.sql',
  '050_darfs_somente_numerado.sql',
  '051_darf_excluido_sem_pdf.sql',
  '052_darf_lote_acessorias.sql',
];

function statementsDe(arquivo: string): string[] {
  const sql = fs.readFileSync(arquivo, 'utf8');
  return sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function run(): Promise<void> {
  const conn = await mysqlPool.getConnection();
  try {
    for (const nome of MIGRATIONS) {
      const arquivo = path.join(PASTA, nome);
      if (!fs.existsSync(arquivo)) {
        console.error('Migration não encontrada:', arquivo);
        process.exit(1);
      }
      console.log(`
── ${nome} ──`);
      for (const stmt of statementsDe(arquivo)) {
        if (stmt.toUpperCase().startsWith('USE ')) continue;
        const [res] = await conn.query<any>(stmt + ';');
        // Os ramos "já existe" do IF devolvem um SELECT com a coluna `aviso`.
        // Imprimi-los é o que torna a re-execução legível em vez de silenciosa.
        if (Array.isArray(res) && res[0]?.aviso) console.log('  ·', res[0].aviso);
        if (stmt.toUpperCase().startsWith('EXECUTE')) console.log('  passo executado');
      }
    }

    const [cols] = await conn.query<any[]>('SHOW COLUMNS FROM `darfs_emitidos`');
    const nomes = cols.map((c: any) => c.Field);
    console.log(`\nConferência: darfs_emitidos com ${cols.length} colunas.`);
    // O que a tela precisa que exista…
    for (const precisa of ['categoria', 'ano_pa', 'mes_pa', 'numero_recibo', 'excluido_em']) {
      console.log(`  ${nomes.includes(precisa) ? 'OK    ' : 'FALTA '} ${precisa}`);
    }
    // …e o que a 050 tinha que ter derrubado.
    for (const morta of ['origem', 'codigo_receita', 'data_consolidacao', 'valor_multa']) {
      console.log(`  ${nomes.includes(morta) ? 'AINDA ' : 'fora  '} ${morta}`);
    }

    const [linhas] = await conn.query<any[]>(
      `SELECT COUNT(*) total,
              SUM(excluido_em IS NULL)     AS ativos,
              SUM(excluido_em IS NOT NULL) AS excluidos,
              SUM(excluido_em IS NOT NULL AND pdf_base64 IS NOT NULL) AS excluidos_com_pdf
         FROM darfs_emitidos`
    );
    console.log('  linhas:', JSON.stringify(linhas));
    console.log('  (excluidos_com_pdf deve ser 0 — ver migration 051)');

    // 052 — a carteira do lote. Zero aqui significa que o job mensal vai rodar
    // e não fazer nada, que é a falha mais silenciosa possível.
    const [lote] = await conn.query<any[]>(
      `SELECT COUNT(*) total, SUM(ativo = 1) AS ativos FROM darf_lote_acessorias`
    );
    console.log(`\nConferência: lote da Acessórias — ${JSON.stringify(lote)}`);
    const [exec] = await conn.query<any[]>(
      `SELECT COUNT(*) total FROM darf_lote_execucoes`
    );
    console.log(`  execuções registradas: ${(exec as any[])[0]?.total ?? 0}`);

    console.log('\nMigrations concluídas.');
  } finally {
    conn.release();
    await mysqlPool.end();
  }
}

run().catch((e) => {
  console.error('ERRO:', e?.message ?? e);
  process.exit(1);
});

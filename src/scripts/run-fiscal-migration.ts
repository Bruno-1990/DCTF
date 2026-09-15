/**
 * Executa as migrations da aba Fiscal: tabelas da ficha
 * (`fiscal_colaboradores`, `fiscal_ficha`) e as respostas dos questionários
 * (`fiscal_questionario_respostas`).
 *
 * Uso: npx ts-node --transpile-only src/scripts/run-fiscal-migration.ts
 *      ou: npm run migrate:fiscal
 *
 * A migration e idempotente (CREATE TABLE IF NOT EXISTS / INSERT IGNORE),
 * entao rodar de novo nao quebra nem duplica nada.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
// Carrega o .env ANTES de importar o pool MySQL (que lê process.env no load).
dotenv.config({ path: path.join(process.cwd(), '.env') });
import { mysqlPool } from '../config/mysql';

const MIGRATIONS = [
  '053_create_fiscal_ficha.sql',
  '054_fiscal_sped_quem_envia.sql',
  '055_fiscal_particularidade.sql',
  '056_fiscal_questionario_respostas.sql',
];
const TABELAS = ['fiscal_colaboradores', 'fiscal_ficha', 'fiscal_questionario_respostas'];

/**
 * Remove as linhas de comentário do INÍCIO de um statement.
 *
 * O split por `;` gruda o bloco de comentário que documenta cada tabela no
 * statement seguinte; sem isto o runner descartaria o `CREATE TABLE` inteiro
 * por achar que a linha começa com `--`, e a migration "passaria" sem criar
 * nada. Mesmo tratamento de run-cota-aprendizagem-migration.ts.
 */
function removerComentarioInicial(statement: string): string {
  const linhas = statement.split('\n');
  let i = 0;
  while (i < linhas.length) {
    const linha = linhas[i]?.trim() ?? '';
    if (linha === '' || linha.startsWith('--')) {
      i++;
      continue;
    }
    break;
  }
  return linhas.slice(i).join('\n').trim();
}

async function run(): Promise<void> {
  const connection = await mysqlPool.getConnection();
  try {
    for (const arquivo of MIGRATIONS) {
      const caminho = path.join(process.cwd(), 'docs', 'migrations', 'mysql', arquivo);
      if (!fs.existsSync(caminho)) {
        console.error('Arquivo de migration não encontrado:', caminho);
        process.exit(1);
      }

      console.log(`\n--- ${arquivo} ---`);
      const sql = fs.readFileSync(caminho, 'utf8');
      const statements = sql
        .split(/;\s*\n/)
        .map((s) => removerComentarioInicial(s))
        .filter((s) => s.length > 0);

      for (const stmt of statements) {
        if (stmt.toUpperCase().startsWith('USE ')) continue;
        await connection.query(stmt + ';');
        console.log('OK:', stmt.slice(0, 60).replace(/\s+/g, ' ') + '...');
      }
    }

    console.log('');
    for (const tabela of TABELAS) {
      const [cols] = await connection.query<any[]>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [tabela]
      );
      if (cols.length === 0) {
        throw new Error(`Tabela ${tabela} não foi criada`);
      }
      console.log(`${tabela}: ${cols.length} colunas`);
    }

    const [colabs] = await connection.query<any[]>(
      'SELECT nome FROM fiscal_colaboradores ORDER BY ordem, nome'
    );
    console.log(`colaboradores: ${colabs.map((c) => c.nome).join(', ')}`);

    console.log('\nMigration da ficha fiscal executada com sucesso.');
    console.log('Próximo passo: npm run import:fiscal-distribuicao');
  } catch (err: any) {
    console.error('Erro ao executar migration:', err.message);
    process.exit(1);
  } finally {
    connection.release();
    await mysqlPool.end();
  }
}

run();

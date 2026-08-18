/**
 * Executa a migration 038: tabelas da cota de aprendizagem
 * (`cota_faturamento_mensal`, `cota_classificacao_mensal`, `cota_aviso_log`).
 *
 * Uso: npx ts-node --transpile-only src/scripts/run-cota-aprendizagem-migration.ts
 *      ou: npm run migrate:cota-aprendizagem
 *
 * A migration e idempotente (CREATE TABLE IF NOT EXISTS), entao rodar de novo
 * nao quebra nada.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
// Carrega o .env ANTES de importar o pool MySQL (que lê process.env no load).
dotenv.config({ path: path.join(process.cwd(), '.env') });
import { mysqlPool } from '../config/mysql';

// Todas as migrations da feature, em ordem. Rodar o conjunto (em vez de uma
// por script) mantém um único comando e garante a ordem correta.
const MIGRATIONS = [
  '038_create_cota_aprendizagem.sql',
  '039_add_cota_revisar_motivos.sql',
  '040_cota_aviso_tipo.sql',
  '041_cota_motor_versao.sql',
];

const TABELAS = ['cota_faturamento_mensal', 'cota_classificacao_mensal', 'cota_aviso_log'];

/**
 * Remove as linhas de comentário do INÍCIO de um statement.
 *
 * O runner padrão do projeto descarta todo statement que começa com `--`. Como
 * esta migration documenta cada tabela num bloco de comentário logo acima do
 * `CREATE TABLE`, o split por `;` gruda o bloco no statement seguinte e ele
 * seria silenciosamente pulado — a migration "passaria" sem criar nada.
 * Aqui as linhas de comentário iniciais são retiradas antes da checagem.
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

      // PREPARE/EXECUTE precisa correr na MESMA conexão — por isso o loop
      // inteiro usa a conexão tomada acima, e não o pool.
      for (const stmt of statements) {
        if (stmt.toUpperCase().startsWith('USE ')) continue;
        await connection.query(stmt + ';');
        console.log('OK:', stmt.slice(0, 60).replace(/\s+/g, ' ') + '...');
      }
    }

    console.log('');
    // Verificação: as 3 tabelas precisam existir ao final.
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

    console.log('Migrations da cota de aprendizagem executadas com sucesso.');
  } catch (err: any) {
    console.error('Erro ao executar migration:', err.message);
    process.exit(1);
  } finally {
    connection.release();
    await mysqlPool.end();
  }
}

run();

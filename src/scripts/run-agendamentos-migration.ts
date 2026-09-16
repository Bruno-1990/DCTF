/**
 * Cria as tabelas do painel de agendamentos (migration 057).
 *
 * Idempotente: tudo é CREATE TABLE IF NOT EXISTS, então rodar de novo não
 * quebra nem apaga configuração já editada na tela.
 *
 * Uso: npm run migrate:agendamentos
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Antes de importar o pool: config/mysql lê process.env na carga do módulo.
dotenv.config({ path: path.join(process.cwd(), '.env') });

// eslint-disable-next-line import/first
import { mysqlPool } from '../config/mysql';

const MIGRATIONS = ['057_agendamentos.sql'];
const TABELAS = ['agendamentos', 'agendamento_emails', 'agendamento_alteracoes'];

/**
 * Tira o cabeçalho de comentários que antecede o statement.
 *
 * Sem isso, o split por ';' entrega blocos que começam com '--' e o MySQL
 * descarta o CREATE inteiro como comentário — "sucesso" no log e nenhuma tabela
 * criada. Já custou uma investigação neste projeto.
 */
function removerComentarioInicial(statement: string): string {
  return statement
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('--'))
    .join('\n')
    .trim();
}

async function run(): Promise<void> {
  const connection = await mysqlPool.getConnection();
  try {
    for (const arquivo of MIGRATIONS) {
      const caminho = path.join(process.cwd(), 'docs', 'migrations', 'mysql', arquivo);
      const sql = fs.readFileSync(caminho, 'utf8');
      const statements = sql
        .split(/;\s*\n/)
        .map(removerComentarioInicial)
        .filter((s) => s.length > 0);

      console.log(`\n=== ${arquivo} (${statements.length} statement(s)) ===`);
      for (const stmt of statements) {
        if (stmt.toUpperCase().startsWith('USE ')) continue; // o banco vem do .env
        await connection.query(`${stmt};`);
        console.log('OK:', stmt.slice(0, 70).replace(/\s+/g, ' '));
      }
    }

    console.log('\n=== conferência ===');
    for (const tabela of TABELAS) {
      const [linhas]: any = await connection.query(
        `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [tabela]
      );
      const colunas = Number(linhas?.[0]?.n ?? 0);
      if (colunas === 0) throw new Error(`Tabela ${tabela} não foi criada.`);
      console.log(`${tabela}: ${colunas} coluna(s)`);
    }
    console.log('\nMigration 057 aplicada.');
  } catch (err: any) {
    console.error('Erro ao executar migration:', err?.message || err);
    process.exit(1);
  } finally {
    connection.release();
    await mysqlPool.end();
  }
}

void run();

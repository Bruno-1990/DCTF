/**
 * Executa a migration 042: colunas de status Ativo/Inativo em `clientes`.
 *
 * Idempotente: se a coluna/index ja existir, o erro do MySQL (1060/1061) e
 * tratado como "ja aplicado" e o script segue.
 *
 * Uso: npm run migrate:clientes-ativo
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
// Carrega o .env ANTES de importar o pool MySQL (que lê process.env no load).
dotenv.config({ path: path.join(process.cwd(), '.env') });
import { mysqlPool } from '../config/mysql';

const MIGRATION_FILE = path.join(
  process.cwd(),
  'docs',
  'migrations',
  'mysql',
  '042_add_clientes_ativo.sql'
);

/** Erros que significam "esse pedaço da migration já foi aplicado". */
const JA_APLICADO = ['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME'];

async function run(): Promise<void> {
  if (!fs.existsSync(MIGRATION_FILE)) {
    console.error('Arquivo de migration não encontrado:', MIGRATION_FILE);
    process.exit(1);
  }

  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    // remove comentários de linha inteira antes de decidir se sobrou comando
    .map((s) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim())
    .filter((s) => s.length > 0);

  const connection = await mysqlPool.getConnection();
  try {
    for (const stmt of statements) {
      if (stmt.toUpperCase().startsWith('USE ')) continue;
      const resumo = stmt.slice(0, 70).replace(/\s+/g, ' ');
      try {
        await connection.query(stmt + ';');
        console.log('OK:', resumo);
      } catch (err: any) {
        if (JA_APLICADO.includes(err.code)) {
          console.log('JÁ APLICADO (ignorado):', resumo);
          continue;
        }
        throw err;
      }
    }

    const [cols] = await connection.query<any[]>(
      `SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes'
         AND COLUMN_NAME IN ('ativo','inativado_em','inativado_motivo','inativado_origem')`
    );
    console.log('Colunas presentes agora:', cols);

    const [tot] = await connection.query<any[]>(
      `SELECT SUM(ativo = 1) AS ativos, SUM(ativo = 0) AS inativos FROM clientes`
    );
    console.log('Situação atual:', tot[0]);
    console.log('Migration 042 executada com sucesso.');
  } catch (err: any) {
    console.error('Erro ao executar migration:', err.message);
    process.exit(1);
  } finally {
    connection.release();
    await mysqlPool.end();
  }
}

run();

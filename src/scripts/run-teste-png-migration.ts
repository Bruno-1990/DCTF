/**
 * Script para criar a tabela teste_png no MySQL (teste de importação PNG).
 * Usa as credenciais do .env (MYSQL_*).
 * Execute: npm run migrate:teste-png
 * Ou: npx ts-node src/scripts/run-teste-png-migration.ts
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { executeQuery } from '../config/mysql';

async function runMigration() {
  try {
    console.log('🚀 Criando tabela teste_png no MySQL...\n');

    const sqlPath = join(__dirname, '../../docs/migrations/mysql/017_create_teste_png.sql');
    const sql = readFileSync(sqlPath, 'utf-8');

    const sqlWithoutComments = sql
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    const queries = sqlWithoutComments
      .split(';')
      .map((q) => q.trim())
      .filter((q) => q.length > 0 && !q.toLowerCase().startsWith('use'));

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      if (query.trim().length === 0) continue;

      try {
        await executeQuery(query);
        console.log('✅ CREATE TABLE teste_png executado com sucesso.\n');
      } catch (error: any) {
        if (error.message?.includes('already exists') || error.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log('⚠️  Tabela teste_png já existe.\n');
        } else {
          console.error('❌ Erro:', error.message);
          throw error;
        }
      }
    }

    const rows = await executeQuery<{ count: number }>(
      `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'teste_png'`
    );
    const count = rows[0]?.count ?? 0;

    if (Number(count) > 0) {
      console.log('✅ Tabela teste_png criada/verificada no banco', process.env['MYSQL_DATABASE'] || 'dctf_web');
    } else {
      console.log('⚠️  Tabela não encontrada após execução. Verifique o banco.');
    }
  } catch (error: any) {
    console.error('❌ Falha na migração:', error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();

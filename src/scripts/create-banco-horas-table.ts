/**
 * Script para criar a tabela banco_horas_relatorios no MySQL
 * Execute: ts-node src/scripts/create-banco-horas-table.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { mysqlPool } from '../config/mysql';

async function createTable() {
  const sqlPath = path.join(__dirname, '../../docs/migrations/mysql/009_create_banco_horas_relatorios.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  const connection = await mysqlPool.getConnection();
  try {
    // Executar cada statement separadamente
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executando: ${statement.substring(0, 50)}...`);
        await connection.execute(statement);
      }
    }

    console.log('✅ Tabela banco_horas_relatorios criada com sucesso!');
  } catch (error: any) {
    if (error.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('ℹ️  Tabela banco_horas_relatorios já existe');
    } else {
      console.error('❌ Erro ao criar tabela:', error.message);
      throw error;
    }
  } finally {
    connection.release();
    await mysqlPool.end();
  }
}

createTable()
  .then(() => {
    console.log('Script concluído');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
  });




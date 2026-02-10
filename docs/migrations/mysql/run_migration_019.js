/**
 * Script para executar a migration 019: Adicionar coluna nome_pasta_rede em clientes
 *
 * Uso: node docs/migrations/mysql/run_migration_019.js
 * (Execute na raiz do projeto: C:\Users\bruno\Desktop\DCTF WEB\DCTF_MPC)
 *
 * Requer .env com MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

async function runMigration() {
  let connection;

  try {
    console.log('Conectando ao MySQL...');

    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'DCTF_WEB',
      multipleStatements: true,
    });

    console.log('Conectado. Lendo 019_add_clientes_nome_pasta_rede.sql...');

    const migrationFile = path.join(__dirname, '019_add_clientes_nome_pasta_rede.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');

    console.log('Executando migration 019...\n');
    await connection.query(sql);
    console.log('Migration 019 executada com sucesso.\n');

    const [cols] = await connection.query(`
      SELECT COLUMN_NAME as coluna, COLUMN_TYPE as tipo, IS_NULLABLE as nulavel
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'nome_pasta_rede'
    `);
    if (cols.length > 0) {
      console.log('Coluna nome_pasta_rede na tabela clientes:');
      console.table(cols);
    }
  } catch (err) {
    console.error('Erro ao executar migration:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

runMigration().catch(console.error);

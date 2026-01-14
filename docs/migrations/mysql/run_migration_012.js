/**
 * Script para executar a migração 012: criar tabela sitf_lote_progress
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

async function runMigration() {
  let connection;
  
  try {
    console.log('🔌 Conectando ao MySQL...');
    
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'dctf_web',
      multipleStatements: true,
    });
    
    console.log('✅ Conectado ao MySQL');
    console.log('📝 Lendo arquivo SQL...');
    
    const sqlPath = path.join(__dirname, '012_create_sitf_lote_progress.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    
    console.log('🚀 Executando migração...\n');
    
    await connection.query(sql);
    
    console.log('✅ Migração 012 executada com sucesso!');
    console.log('📊 Tabela sitf_lote_progress criada');
    
  } catch (error) {
    console.error('❌ Erro ao executar migração:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Conexão fechada');
    }
  }
}

runMigration();




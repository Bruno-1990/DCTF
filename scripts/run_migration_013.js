/**
 * Script para executar a migration 013: Criar tabela sitf_lote_cnpjs_pendentes
 * 
 * Uso: node scripts/run_migration_013.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  let connection = null;
  
  try {
    // Ler configurações do .env
    const config = {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'dctf_web',
    };

    console.log('🔍 Conectando ao MySQL...');
    console.log(`   Host: ${config.host}`);
    console.log(`   Database: ${config.database}`);
    console.log(`   User: ${config.user}`);

    // Conectar ao MySQL
    connection = await mysql.createConnection(config);
    console.log('✅ Conectado ao MySQL com sucesso!\n');

    // Ler arquivo SQL
    const sqlFile = path.join(__dirname, 'migrations', '013_create_sitf_lote_cnpjs_pendentes.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    console.log('📄 Executando migration 013...\n');
    console.log('SQL:');
    console.log(sql);
    console.log('\n');

    // Executar migration
    await connection.query(sql);
    
    console.log('✅ Migration 013 executada com sucesso!');
    console.log('   Tabela `sitf_lote_cnpjs_pendentes` criada.\n');

  } catch (error) {
    console.error('❌ Erro ao executar migration:', error);
    if (error.code) {
      console.error(`   Código do erro: ${error.code}`);
    }
    if (error.sqlMessage) {
      console.error(`   Mensagem SQL: ${error.sqlMessage}`);
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Conexão com MySQL fechada.');
    }
  }
}

// Executar migration
runMigration()
  .then(() => {
    console.log('\n✅ Script concluído com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });




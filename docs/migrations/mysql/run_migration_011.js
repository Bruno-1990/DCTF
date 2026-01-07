/**
 * Script para executar a migration 011: Adicionar CPF aos sócios
 * 
 * Executa: node run_migration_011.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

async function runMigration() {
  let connection;
  
  try {
    console.log('🔄 Conectando ao MySQL...');
    
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'dctf_web',
      multipleStatements: true,
    });

    console.log('✅ Conectado ao MySQL');
    console.log('📄 Lendo arquivo de migration...');

    const migrationFile = path.join(__dirname, '011_add_cpf_to_socios.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');

    console.log('🚀 Executando migration 011...\n');
    
    const [results] = await connection.query(sql);
    
    console.log('\n✅ Migration executada com sucesso!');
    
    // Verificar as colunas adicionadas
    console.log('\n📋 Verificando estrutura da tabela clientes_socios...');
    const [columns] = await connection.query(`
      SELECT 
        COLUMN_NAME as coluna,
        COLUMN_TYPE as tipo,
        IS_NULLABLE as nulavel,
        COLUMN_COMMENT as comentario
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'clientes_socios'
        AND COLUMN_NAME IN ('cpf', 'participacao_percentual', 'participacao_valor')
      ORDER BY ORDINAL_POSITION
    `);

    if (columns.length > 0) {
      console.log('\n✅ Colunas adicionadas com sucesso:');
      console.table(columns);
    } else {
      console.log('\n⚠️  Nenhuma coluna foi adicionada (pode ser que já existissem)');
    }

    // Verificar índices
    console.log('\n📋 Verificando índices...');
    const [indexes] = await connection.query(`
      SHOW INDEXES FROM clientes_socios 
      WHERE Key_name = 'idx_clientes_socios_cpf'
    `);

    if (indexes.length > 0) {
      console.log('✅ Índice idx_clientes_socios_cpf criado com sucesso');
    } else {
      console.log('ℹ️  Índice idx_clientes_socios_cpf não foi criado (pode já existir ou não ser necessário)');
    }

    console.log('\n✨ Migration 011 concluída!');

  } catch (error) {
    console.error('❌ Erro ao executar migration:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Conexão com MySQL encerrada');
    }
  }
}

// Executar
runMigration().catch(console.error);


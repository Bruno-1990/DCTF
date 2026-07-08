/**
 * Script para executar a migration 008: Controle de envio do e-BEF na tabela clientes
 *
 * Uso: node scripts/run_migration_008.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS n
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [table, column],
  );
  return Number(rows[0]?.n || 0) > 0;
}

async function indexExists(connection, table, indexName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS n
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?`,
    [table, indexName],
  );
  return Number(rows[0]?.n || 0) > 0;
}

async function runMigration() {
  let connection = null;

  try {
    const config = {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'dctf_web',
      multipleStatements: true,
    };

    console.log('🔍 Conectando ao MySQL...');
    console.log(`   Host: ${config.host}`);
    console.log(`   Database: ${config.database}`);
    console.log(`   User: ${config.user}`);

    connection = await mysql.createConnection(config);
    console.log('✅ Conectado ao MySQL com sucesso!\n');

    console.log('📄 Aplicando migration 008 (clientes.ebef_enviado / ebef_enviado_em)...\n');

    const hasEnviado = await columnExists(connection, 'clientes', 'ebef_enviado');
    const hasEnviadoEm = await columnExists(connection, 'clientes', 'ebef_enviado_em');

    const adds = [];
    if (!hasEnviado) adds.push('ADD COLUMN `ebef_enviado` TINYINT(1) NOT NULL DEFAULT 0');
    if (!hasEnviadoEm) adds.push('ADD COLUMN `ebef_enviado_em` DATETIME NULL');

    if (adds.length === 0) {
      console.log('ℹ️  Colunas já existem — nada a adicionar.');
    } else {
      const sql = `ALTER TABLE \`clientes\` ${adds.join(', ')};`;
      console.log('Executando:', sql);
      await connection.query(sql);
      console.log('✅ Colunas adicionadas.');
    }

    const hasIdx = await indexExists(connection, 'clientes', 'idx_clientes_ebef_enviado');
    if (!hasIdx) {
      const idxSql = 'CREATE INDEX `idx_clientes_ebef_enviado` ON `clientes` (`ebef_enviado`);';
      console.log('Executando:', idxSql);
      await connection.query(idxSql);
      console.log('✅ Índice criado.');
    } else {
      console.log('ℹ️  Índice idx_clientes_ebef_enviado já existe.');
    }

    console.log('\n✅ Migration 008 concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao executar migration:', error);
    if (error.code) console.error(`   Código do erro: ${error.code}`);
    if (error.sqlMessage) console.error(`   Mensagem SQL: ${error.sqlMessage}`);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Conexão com MySQL fechada.');
    }
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });

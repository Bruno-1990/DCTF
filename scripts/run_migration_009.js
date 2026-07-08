/**
 * Script para executar a migration 009: Estudo de Viabilidade
 *
 * Uso: node scripts/run_migration_009.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS n
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [table],
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

    console.log('Conectando ao MySQL...');
    console.log(`  Host: ${config.host}`);
    console.log(`  Database: ${config.database}`);

    connection = await mysql.createConnection(config);
    console.log('Conectado.\n');

    console.log('Aplicando migration 009 (estudo_viabilidade)...');

    const hasDocs = await tableExists(connection, 'estudo_viabilidade_documentos');
    if (!hasDocs) {
      await connection.query(`
        CREATE TABLE \`estudo_viabilidade_documentos\` (
          \`id\`            INT AUTO_INCREMENT PRIMARY KEY,
          \`nome_original\` VARCHAR(500) NOT NULL,
          \`mime_type\`     VARCHAR(100) NOT NULL,
          \`tamanho_bytes\` BIGINT NOT NULL,
          \`markdown\`      LONGTEXT NULL,
          \`status\`        ENUM('processando','concluido','erro') NOT NULL DEFAULT 'processando',
          \`erro_mensagem\` TEXT NULL,
          \`total_cnaes\`   INT NOT NULL DEFAULT 0,
          \`criado_em\`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`processado_em\` DATETIME NULL
        )
      `);
      console.log('  Tabela estudo_viabilidade_documentos criada.');
    } else {
      console.log('  Tabela estudo_viabilidade_documentos ja existe.');
    }

    const hasCnaes = await tableExists(connection, 'estudo_viabilidade_cnaes');
    if (!hasCnaes) {
      await connection.query(`
        CREATE TABLE \`estudo_viabilidade_cnaes\` (
          \`id\`               INT AUTO_INCREMENT PRIMARY KEY,
          \`documento_id\`     INT NOT NULL,
          \`cnae_original\`    VARCHAR(20) NOT NULL,
          \`cnae_normalizado\` VARCHAR(7)  NOT NULL,
          \`descricao\`        TEXT NULL,
          \`trecho\`           TEXT NULL,
          CONSTRAINT \`fk_estudo_viab_doc\`
            FOREIGN KEY (\`documento_id\`)
            REFERENCES \`estudo_viabilidade_documentos\`(\`id\`)
            ON DELETE CASCADE,
          INDEX \`idx_estudo_viab_cnae_norm\` (\`cnae_normalizado\`),
          INDEX \`idx_estudo_viab_doc\`       (\`documento_id\`)
        )
      `);
      console.log('  Tabela estudo_viabilidade_cnaes criada.');
    } else {
      console.log('  Tabela estudo_viabilidade_cnaes ja existe.');
    }

    console.log('\nMigration 009 concluida.');
  } catch (error) {
    console.error('Erro ao executar migration:', error);
    if (error.code) console.error(`  Codigo: ${error.code}`);
    if (error.sqlMessage) console.error(`  SQL: ${error.sqlMessage}`);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Conexao fechada.');
    }
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });

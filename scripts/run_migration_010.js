/**
 * Migration 010: adiciona colunas estruturadas em estudo_viabilidade_cnaes
 *   (denominacao, grau_risco, compreende_atuacao, condicao_classificacao_risco, orgao_vigilancia)
 *
 * Uso: node scripts/run_migration_010.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function columnExists(c, table, column) {
  const [rows] = await c.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return Number(rows[0]?.n || 0) > 0;
}

async function indexExists(c, table, name) {
  const [rows] = await c.query(
    `SELECT COUNT(*) AS n FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, name],
  );
  return Number(rows[0]?.n || 0) > 0;
}

(async () => {
  let c = null;
  try {
    c = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'dctf_web',
      multipleStatements: true,
    });
    console.log('Conectado.\nAplicando migration 010 (colunas estruturadas)...');

    const TABLE = 'estudo_viabilidade_cnaes';
    const COLS = [
      ['denominacao',                  'TEXT NULL'],
      ['grau_risco',                   'VARCHAR(100) NULL'],
      ['compreende_atuacao',           'TEXT NULL'],
      ['condicao_classificacao_risco', 'TEXT NULL'],
      ['orgao_vigilancia',             'TEXT NULL'],
    ];

    const adds = [];
    for (const [name, def] of COLS) {
      if (!(await columnExists(c, TABLE, name))) adds.push(`ADD COLUMN \`${name}\` ${def}`);
    }
    if (adds.length === 0) {
      console.log('  Todas as colunas ja existem.');
    } else {
      const sql = `ALTER TABLE \`${TABLE}\` ${adds.join(', ')};`;
      console.log('  ' + sql);
      await c.query(sql);
      console.log('  Colunas adicionadas.');
    }

    if (!(await indexExists(c, TABLE, 'idx_estudo_viab_grau_risco'))) {
      await c.query(`CREATE INDEX \`idx_estudo_viab_grau_risco\` ON \`${TABLE}\` (\`grau_risco\`)`);
      console.log('  Indice idx_estudo_viab_grau_risco criado.');
    } else {
      console.log('  Indice idx_estudo_viab_grau_risco ja existe.');
    }

    console.log('\nMigration 010 concluida.');
  } catch (e) {
    console.error('Erro:', e?.sqlMessage || e?.message || e);
    process.exit(1);
  } finally {
    if (c) await c.end();
  }
})();

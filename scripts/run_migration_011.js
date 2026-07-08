/**
 * Migration 011: Amplia PK de dctf_declaracoes e FKs filhas para CHAR(40).
 * Motivo: nova fonte (tabela scrapecac) usa SHA-1 como id.
 *
 * Uso: node scripts/run_migration_011.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function columnType(c, table, column) {
  const [rows] = await c.query(
    `SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows[0]?.t || null;
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
    console.log('Conectado.\nAplicando migration 011 (CHAR(36) -> CHAR(40))...');

    const targets = [
      ['dctf_declaracoes',   'id',            'NOT NULL'],
      ['dctf_dados',         'declaracao_id', 'NOT NULL'],
      ['analises',           'declaracao_id', 'NOT NULL'],
      ['flags',              'declaracao_id', 'NOT NULL'],
      ['relatorios',         'declaracao_id', 'NOT NULL'],
      ['receita_pagamentos', 'dctf_id',       'NULL'],
    ];

    await c.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const [table, column, nullability] of targets) {
      const current = await columnType(c, table, column);
      if (!current) {
        console.log(`  ${table}.${column}: coluna nao encontrada, pulando.`);
        continue;
      }
      if (current.toLowerCase() === 'char(40)') {
        console.log(`  ${table}.${column}: ja CHAR(40), pulando.`);
        continue;
      }
      const sql = `ALTER TABLE \`${table}\` MODIFY \`${column}\` CHAR(40) ${nullability}`;
      console.log('  ' + sql);
      await c.query(sql);
    }

    await c.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('\nMigration 011 concluida.');
  } catch (e) {
    console.error('Erro:', e?.sqlMessage || e?.message || e);
    if (c) {
      try { await c.query('SET FOREIGN_KEY_CHECKS = 1'); } catch (_) {}
    }
    process.exit(1);
  } finally {
    if (c) await c.end();
  }
})();

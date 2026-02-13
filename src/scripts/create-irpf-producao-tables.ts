/**
 * Script para criar tabelas do módulo IRPF Produção (PRD-IRPF-001)
 * Migration 020: irpf_producao_cases, irpf_producao_case_people
 */

import 'dotenv/config';

import { readFileSync } from 'fs';
import { join } from 'path';
import { mysqlPool } from '../config/mysql';

async function createIrpfProducaoTables() {
  try {
    const sqlPath = join(__dirname, '../../docs/migrations/mysql/020_create_irpf_producao_cases.sql');
    const sql = readFileSync(sqlPath, 'utf-8');

    const connection = await mysqlPool.getConnection();
    try {
      const lines = sql.split('\n');
      const cleanLines = lines
        .map(line => (line.trim().startsWith('--') && !line.trim().startsWith('-- =') ? '' : line))
        .filter(line => line.trim().length > 0);
      const cleanSql = cleanLines.join('\n');
      const commands = cleanSql
        .split(';')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 10);

      for (let i = 0; i < commands.length; i++) {
        try {
          await connection.query(commands[i]);
          console.log(`✅ [${i + 1}/${commands.length}] Comando executado`);
        } catch (error: any) {
          if (error.code === 'ER_TABLE_EXISTS_ERROR' || error.message?.includes('already exists')) {
            console.log(`⚠️  [${i + 1}] Tabela já existe (pulando)`);
          } else {
            console.error(`❌ Erro:`, error.message);
            throw error;
          }
        }
      }
      console.log('\n✅ IRPF Produção: tabelas criadas/verificadas.');
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Falha ao criar tabelas IRPF Produção:', error);
    process.exit(1);
  }
  process.exit(0);
}

createIrpfProducaoTables();

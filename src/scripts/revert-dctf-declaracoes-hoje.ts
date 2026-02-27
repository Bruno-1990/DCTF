/**
 * Script para reverter alterações de HOJE na tabela dctf_declaracoes (MySQL).
 * Carrega .env da raiz do projeto para usar MYSQL_*.
 *
 * O que pode ser revertido SEM backup:
 *   - INSERÇÕES de hoje: registros com created_at = data de hoje → são deletados.
 *
 * O que NÃO pode ser revertido sem backup:
 *   - MODIFICAÇÕES (UPDATEs) de hoje: o MySQL não guarda valores antigos.
 *     Só restauração de backup ou point-in-time recovery (binlog) restaura.
 *
 * Uso:
 *   npx ts-node src/scripts/revert-dctf-declaracoes-hoje.ts           # só mostra diagnóstico
 *   npx ts-node src/scripts/revert-dctf-declaracoes-hoje.ts --execute  # deleta inseridos hoje
 *
 * Opcional: usar data específica (formato YYYY-MM-DD)
 *   npx ts-node src/scripts/revert-dctf-declaracoes-hoje.ts --date=2026-02-26
 *   npx ts-node src/scripts/revert-dctf-declaracoes-hoje.ts --date=2026-02-26 --execute
 */

import * as path from 'path';
import * as dotenv from 'dotenv';

// Carregar .env da raiz do projeto (onde está package.json)
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { executeQuery, getConnection } from '../config/mysql';
import type { ResultSetHeader } from 'mysql2/promise';

const args = process.argv.slice(2);
const doExecute = args.includes('--execute');
const dateArg = args.find((a) => a.startsWith('--date='));
const targetDate = dateArg ? dateArg.replace('--date=', '').trim() : null;

async function main() {
  const dateToUse = targetDate || new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  console.log('\n=== Reverter alterações em dctf_declaracoes ===\n');
  console.log(`Data considerada: ${dateToUse}\n`);

  try {
    // 1. Contar inseridos na data
    const insertedRows = await executeQuery<{ inseridos: number }>(
      `SELECT COUNT(*) AS inseridos FROM dctf_declaracoes WHERE DATE(created_at) = ?`,
      [dateToUse]
    );
    const inseridos = Number(insertedRows[0]?.inseridos ?? 0);

    // 2. Contar modificados na data (updated_at na data, created_at antes)
    const updatedRows = await executeQuery<{ modificados: number }>(
      `SELECT COUNT(*) AS modificados FROM dctf_declaracoes 
       WHERE DATE(updated_at) = ? AND DATE(created_at) < ?`,
      [dateToUse, dateToUse]
    );
    const modificados = Number(updatedRows[0]?.modificados ?? 0);

    console.log('Diagnóstico:');
    console.log(`  - Inseridos na data (created_at = ${dateToUse}): ${inseridos}`);
    console.log(`  - Modificados na data (updated_at = ${dateToUse}, criados antes): ${modificados}`);
    console.log('');

    if (modificados > 0) {
      console.log(
        '⚠️  Os registros MODIFICADOS hoje não podem ser revertidos por este script.'
      );
      console.log(
        '    Para restaurar os valores antigos use um backup do MySQL ou point-in-time recovery (binlog).\n'
      );
    }

    if (inseridos === 0) {
      console.log('Nenhum registro inserido na data. Nada a reverter (inserções).\n');
      process.exit(0);
      return;
    }

    if (!doExecute) {
      console.log(
        `Para REMOVER os ${inseridos} registro(s) inserido(s) na data, execute:`
      );
      console.log('  npx ts-node src/scripts/revert-dctf-declaracoes-hoje.ts --execute');
      if (!targetDate) {
        console.log('  ou com data: --date=YYYY-MM-DD --execute');
      }
      console.log('');
      process.exit(0);
      return;
    }

    // Executar DELETE (usar conexão para obter affectedRows)
    const conn = await getConnection();
    try {
      const [result] = await conn.execute<ResultSetHeader>(
        `DELETE FROM dctf_declaracoes WHERE DATE(created_at) = ?`,
        [dateToUse]
      );
      const affected = result?.affectedRows ?? 0;
      console.log(`✅ ${affected} registro(s) inserido(s) na data ${dateToUse} foram removidos.\n`);
    } finally {
      conn.release();
    }
    process.exit(0);
  } catch (err) {
    console.error('Erro:', err);
    process.exit(1);
  }
}

main();

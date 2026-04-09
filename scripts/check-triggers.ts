/**
 * Verificar triggers na tabela dctf_declaracoes
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

const envPath = path.join(__dirname, '.env.temp');
dotenv.config({ path: envPath });

import { executeQuery } from './src/config/mysql';

async function checkTriggers() {
  try {
    console.log('🔍 VERIFICANDO TRIGGERS NA TABELA dctf_declaracoes\n');
    
    const triggers = await executeQuery<any>(`
      SELECT 
        TRIGGER_NAME,
        EVENT_MANIPULATION,
        EVENT_OBJECT_TABLE,
        ACTION_TIMING,
        ACTION_STATEMENT
      FROM information_schema.TRIGGERS
      WHERE EVENT_OBJECT_SCHEMA = 'DCTF_WEB'
        AND EVENT_OBJECT_TABLE = 'dctf_declaracoes'
    `);
    
    if (triggers.length > 0) {
      console.log(`📋 Encontrados ${triggers.length} trigger(s):\n`);
      triggers.forEach((trigger: any, index: number) => {
        console.log(`${index + 1}. ${trigger.TRIGGER_NAME}`);
        console.log(`   Tipo: ${trigger.ACTION_TIMING} ${trigger.EVENT_MANIPULATION}`);
        console.log(`   SQL:`);
        console.log(`   ${trigger.ACTION_STATEMENT}`);
        console.log('');
      });
    } else {
      console.log('✅ Nenhum trigger encontrado na tabela dctf_declaracoes\n');
    }
    
    // Verificar também constraints e índices
    console.log('🔍 VERIFICANDO ESTRUTURA DA TABELA\n');
    
    const columns = await executeQuery<any>(`
      SELECT 
        COLUMN_NAME,
        COLUMN_TYPE,
        IS_NULLABLE,
        COLUMN_KEY,
        COLUMN_DEFAULT,
        EXTRA
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = 'DCTF_WEB'
        AND TABLE_NAME = 'dctf_declaracoes'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('📊 Colunas da tabela:\n');
    columns.forEach((col: any) => {
      const keyInfo = col.COLUMN_KEY ? ` [${col.COLUMN_KEY}]` : '';
      const extra = col.EXTRA ? ` (${col.EXTRA})` : '';
      console.log(`   ${col.COLUMN_NAME}: ${col.COLUMN_TYPE}${keyInfo}${extra}`);
    });
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

checkTriggers();

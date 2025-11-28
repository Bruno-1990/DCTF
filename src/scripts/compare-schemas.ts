/**
 * Script para comparar schemas do Supabase e MySQL
 * e gerar script de migração para alinhar MySQL com Supabase
 */

import { supabaseAdmin, supabase } from '../config/database';
import { getConnection } from '../config/mysql';

interface ColumnInfo {
  column_name: string;
  data_type: string;
  character_maximum_length: number | null;
  is_nullable: string;
  column_default: string | null;
}

async function compareSchemas() {
  console.log('🔍 Comparando schemas Supabase vs MySQL...\n');

  const supabaseClient = supabaseAdmin || supabase;
  if (!supabaseClient) {
    console.error('❌ Supabase não está configurado');
    process.exit(1);
  }

  try {
    // 1. Buscar schema do Supabase (via registro de exemplo)
    console.log('📋 Buscando schema do Supabase...');
    const { data: supabaseSample, error: supabaseError } = await supabaseClient
      .from('dctf_declaracoes')
      .select('*')
      .limit(1);

    if (supabaseError) {
      console.error('❌ Erro ao buscar do Supabase:', supabaseError);
      process.exit(1);
    }

    if (!supabaseSample || supabaseSample.length === 0) {
      console.log('⚠️  Nenhum registro no Supabase para analisar');
      process.exit(1);
    }

    const supabaseColumns = Object.keys(supabaseSample[0]);
    console.log(`✅ Encontradas ${supabaseColumns.length} colunas no Supabase:`);
    supabaseColumns.forEach(col => console.log(`   - ${col}`));

    // 2. Buscar schema do MySQL
    console.log('\n📋 Buscando schema do MySQL...');
    const connection = await getConnection();
    
    try {
      const [mysqlColumns] = await connection.execute(`
        SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'dctf_declaracoes'
        ORDER BY ordinal_position
      `) as [ColumnInfo[], any];

      const mysqlColumnNames = mysqlColumns.map(col => col.column_name);
      console.log(`✅ Encontradas ${mysqlColumnNames.length} colunas no MySQL:`);
      mysqlColumnNames.forEach(col => console.log(`   - ${col}`));

      // 3. Comparar
      console.log('\n🔍 Comparando...\n');

      const missingInMySQL = supabaseColumns.filter(col => !mysqlColumnNames.includes(col));
      const missingInSupabase = mysqlColumnNames.filter(col => !supabaseColumns.includes(col));
      const inBoth = supabaseColumns.filter(col => mysqlColumnNames.includes(col));

      if (missingInMySQL.length > 0) {
        console.log('❌ Colunas no Supabase que NÃO estão no MySQL:');
        missingInMySQL.forEach(col => console.log(`   - ${col}`));
      }

      if (missingInSupabase.length > 0) {
        console.log('\n⚠️  Colunas no MySQL que NÃO estão no Supabase:');
        missingInSupabase.forEach(col => console.log(`   - ${col}`));
      }

      if (inBoth.length > 0) {
        console.log('\n✅ Colunas em ambos:');
        inBoth.forEach(col => console.log(`   - ${col}`));
      }

      // 4. Gerar script de migração
      if (missingInMySQL.length > 0) {
        console.log('\n📝 Gerando script de migração...\n');
        console.log('-- Script para adicionar colunas faltantes no MySQL');
        console.log('USE dctf_web;');
        console.log('');

        // Analisar tipos baseado no exemplo do Supabase
        const example = supabaseSample[0];
        for (const col of missingInMySQL) {
          const value = example[col];
          let sqlType = 'TEXT';
          
          if (value === null) {
            sqlType = 'TEXT NULL';
          } else if (typeof value === 'string') {
            const length = value.length;
            if (length <= 14) sqlType = 'VARCHAR(14)';
            else if (length <= 20) sqlType = 'VARCHAR(20)';
            else if (length <= 50) sqlType = 'VARCHAR(50)';
            else if (length <= 100) sqlType = 'VARCHAR(100)';
            else sqlType = 'TEXT';
          } else if (typeof value === 'number') {
            sqlType = 'DECIMAL(15,2)';
          } else if (value instanceof Date || (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/))) {
            sqlType = 'TIMESTAMP NULL';
          }

          console.log(`ALTER TABLE dctf_declaracoes ADD COLUMN IF NOT EXISTS \`${col}\` ${sqlType} NULL;`);
        }
      }

    } finally {
      connection.release();
    }

  } catch (err: any) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

compareSchemas();




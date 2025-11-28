/**
 * Script para obter o schema da tabela dctf_declaracoes do Supabase
 * e comparar com o MySQL
 */

import { supabaseAdmin, supabase } from '../config/database';

async function getSupabaseSchema() {
  const supabaseClient = supabaseAdmin || supabase;
  
  if (!supabaseClient) {
    console.error('❌ Supabase não está configurado');
    process.exit(1);
  }

  console.log('🔍 Buscando schema da tabela dctf_declaracoes no Supabase...\n');

  try {
    // Buscar informações da tabela via query SQL
    const { data, error } = await supabaseClient.rpc('exec_sql', {
      sql_query: `
        SELECT 
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'dctf_declaracoes'
        ORDER BY ordinal_position;
      `
    });

    if (error) {
      // Tentar método alternativo - buscar um registro de exemplo
      console.log('⚠️  Não foi possível usar RPC, buscando registro de exemplo...\n');
      
      const { data: sampleData, error: sampleError } = await supabaseClient
        .from('dctf_declaracoes')
        .select('*')
        .limit(1);

      if (sampleError) {
        console.error('❌ Erro ao buscar dados:', sampleError);
        process.exit(1);
      }

      if (sampleData && sampleData.length > 0) {
        console.log('📋 Colunas encontradas (baseado em registro de exemplo):\n');
        const record = sampleData[0];
        for (const [key, value] of Object.entries(record)) {
          const type = typeof value;
          const isNull = value === null;
          console.log(`  - ${key}: ${type}${isNull ? ' (nullable)' : ''}`);
        }
      } else {
        console.log('⚠️  Nenhum registro encontrado na tabela');
      }
    } else {
      console.log('📋 Schema da tabela dctf_declaracoes:\n');
      console.table(data);
    }

    // Buscar um registro de exemplo para ver os valores
    console.log('\n📝 Registro de exemplo:\n');
    const { data: example, error: exampleError } = await supabaseClient
      .from('dctf_declaracoes')
      .select('*')
      .limit(1);

    if (exampleError) {
      console.error('❌ Erro ao buscar exemplo:', exampleError);
    } else if (example && example.length > 0) {
      console.log(JSON.stringify(example[0], null, 2));
    } else {
      console.log('⚠️  Nenhum registro encontrado');
    }

  } catch (err: any) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

getSupabaseSchema();




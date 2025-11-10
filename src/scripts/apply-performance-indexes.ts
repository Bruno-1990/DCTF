/**
 * Script para aplicar índices de performance DCTF
 * Aplica índices otimizados para melhorar performance
 */

import { supabase } from '../config/database';
import fs from 'fs';
import path from 'path';

async function applyPerformanceIndexes() {
  console.log('🚀 Aplicando índices de performance DCTF...');

  try {
    // Ler arquivo SQL
    const sqlPath = path.join(__dirname, '../../docs/dctf-performance-indexes.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Dividir em comandos individuais
    const commands = sqlContent
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));

    console.log(`📝 Executando ${commands.length} comandos SQL...`);

    let sucessos = 0;
    let avisos = 0;
    let erros = 0;

    // Executar cada comando
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      
      if (command.trim()) {
        console.log(`   ${i + 1}/${commands.length}: ${command.substring(0, 60)}...`);
        
        try {
          const { error } = await supabase.rpc('exec_sql', { sql: command });
          
          if (error) {
            // Muitos índices podem já existir, então tratamos como aviso
            if (error.message.includes('already exists') || 
                error.message.includes('duplicate key') ||
                error.message.includes('constraint') && error.message.includes('already exists')) {
              console.log(`   ⚠️  Aviso: ${error.message}`);
              avisos++;
            } else {
              console.log(`   ❌ Erro: ${error.message}`);
              erros++;
            }
          } else {
            sucessos++;
          }
        } catch (error: any) {
          console.log(`   ❌ Erro: ${error.message}`);
          erros++;
        }
      }
    }

    console.log(`\n📊 Resultado da aplicação:`);
    console.log(`   ✅ Sucessos: ${sucessos}`);
    console.log(`   ⚠️  Avisos: ${avisos}`);
    console.log(`   ❌ Erros: ${erros}`);

    // Verificar índices aplicados
    console.log('\n🔍 Verificando índices aplicados...');
    
    const { data: indexes, error: indexesError } = await supabase
      .from('pg_indexes')
      .select('indexname, tablename, indexdef')
      .eq('schemaname', 'public')
      .in('tablename', ['clientes', 'dctf_declaracoes', 'dctf_dados', 'analises', 'flags', 'relatorios', 'dctf_codes', 'dctf_receita_codes', 'dctf_aliquotas']);

    if (indexesError) {
      console.error('❌ Erro ao verificar índices:', indexesError.message);
    } else {
      console.log(`📋 Índices encontrados: ${indexes?.length || 0}`);
      
      // Agrupar por tabela
      const porTabela = indexes?.reduce((acc: any, idx: any) => {
        acc[idx.tablename] = (acc[idx.tablename] || 0) + 1;
        return acc;
      }, {}) || {};

      Object.entries(porTabela).forEach(([tabela, count]) => {
        console.log(`   ${tabela}: ${count} índices`);
      });
    }

    // Verificar funções de performance
    console.log('\n⚙️ Verificando funções de performance...');
    
    const { data: functions, error: functionsError } = await supabase
      .from('information_schema.routines')
      .select('routine_name, routine_type')
      .eq('routine_schema', 'public')
      .like('routine_name', '%dctf%');

    if (functionsError) {
      console.error('❌ Erro ao verificar funções:', functionsError.message);
    } else {
      console.log(`⚙️ Funções encontradas: ${functions?.length || 0}`);
      functions?.forEach((f: any) => {
        console.log(`   ${f.routine_name} (${f.routine_type})`);
      });
    }

    // Testar performance
    console.log('\n🧪 Testando performance...');
    
    try {
      const { data: testQuery, error: testError } = await supabase
        .from('dctf_declaracoes')
        .select('id, cliente_id, periodo, status')
        .limit(10);

      if (testError) {
        console.log('   ⚠️  Teste de consulta falhou (normal se tabela estiver vazia)');
      } else {
        console.log(`   ✅ Teste de consulta executado com sucesso (${testQuery?.length || 0} registros)`);
      }
    } catch (error: any) {
      console.log('   ⚠️  Teste de consulta falhou:', error.message);
    }

    if (erros === 0) {
      console.log('\n🎉 Índices de performance aplicados com sucesso!');
    } else {
      console.log(`\n⚠️  Aplicação concluída com ${erros} erros. Verifique os logs acima.`);
    }

  } catch (error: any) {
    console.error('❌ Erro durante aplicação dos índices:', error.message);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  applyPerformanceIndexes()
    .then(() => {
      console.log('✅ Script finalizado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro fatal:', error);
      process.exit(1);
    });
}

export { applyPerformanceIndexes };


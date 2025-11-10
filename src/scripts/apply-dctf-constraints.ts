/**
 * Script para aplicar constraints de negócio DCTF no banco de dados
 * Aplica todas as constraints, triggers e validações
 */

import { supabase } from '../config/database';
import fs from 'fs';
import path from 'path';

async function applyDCTFConstraints() {
  console.log('🚀 Aplicando constraints de negócio DCTF...');

  try {
    // Ler arquivo SQL
    const sqlPath = path.join(__dirname, '../../docs/dctf-constraints.sql');
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
            // Muitas constraints podem já existir, então tratamos como aviso
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

    // Verificar constraints aplicadas
    console.log('\n🔍 Verificando constraints aplicadas...');
    
    const { data: constraints, error: constraintsError } = await supabase
      .from('information_schema.table_constraints')
      .select('constraint_name, constraint_type, table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['dctf_declaracoes', 'dctf_dados', 'clientes', 'analises', 'flags', 'relatorios']);

    if (constraintsError) {
      console.error('❌ Erro ao verificar constraints:', constraintsError.message);
    } else {
      console.log(`📋 Constraints encontradas: ${constraints?.length || 0}`);
      
      // Agrupar por tipo
      const porTipo = constraints?.reduce((acc: any, c: any) => {
        acc[c.constraint_type] = (acc[c.constraint_type] || 0) + 1;
        return acc;
      }, {}) || {};

      Object.entries(porTipo).forEach(([tipo, count]) => {
        console.log(`   ${tipo}: ${count}`);
      });
    }

    // Verificar triggers
    console.log('\n🔧 Verificando triggers...');
    
    const { data: triggers, error: triggersError } = await supabase
      .from('information_schema.triggers')
      .select('trigger_name, event_object_table')
      .eq('trigger_schema', 'public')
      .in('event_object_table', ['dctf_declaracoes', 'dctf_dados']);

    if (triggersError) {
      console.error('❌ Erro ao verificar triggers:', triggersError.message);
    } else {
      console.log(`🔧 Triggers encontrados: ${triggers?.length || 0}`);
      triggers?.forEach((t: any) => {
        console.log(`   ${t.trigger_name} em ${t.event_object_table}`);
      });
    }

    // Verificar funções
    console.log('\n⚙️ Verificando funções...');
    
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

    // Verificar índices
    console.log('\n📈 Verificando índices...');
    
    const { data: indexes, error: indexesError } = await supabase
      .from('pg_indexes')
      .select('indexname, tablename')
      .eq('schemaname', 'public')
      .in('tablename', ['dctf_declaracoes', 'dctf_dados', 'clientes', 'analises', 'flags', 'relatorios']);

    if (indexesError) {
      console.error('❌ Erro ao verificar índices:', indexesError.message);
    } else {
      console.log(`📈 Índices encontrados: ${indexes?.length || 0}`);
      
      // Agrupar por tabela
      const porTabela = indexes?.reduce((acc: any, i: any) => {
        acc[i.tablename] = (acc[i.tablename] || 0) + 1;
        return acc;
      }, {}) || {};

      Object.entries(porTabela).forEach(([tabela, count]) => {
        console.log(`   ${tabela}: ${count} índices`);
      });
    }

    if (erros === 0) {
      console.log('\n🎉 Constraints aplicadas com sucesso!');
    } else {
      console.log(`\n⚠️  Aplicação concluída com ${erros} erros. Verifique os logs acima.`);
    }

  } catch (error: any) {
    console.error('❌ Erro durante aplicação das constraints:', error.message);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  applyDCTFConstraints()
    .then(() => {
      console.log('✅ Script finalizado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro fatal:', error);
      process.exit(1);
    });
}

export { applyDCTFConstraints };


/**
 * Script para configurar códigos DCTF no banco de dados
 * Aplica o schema de códigos DCTF e insere dados padrão
 */

import { supabase } from '../config/database';
import fs from 'fs';
import path from 'path';

async function setupDCTFCodes() {
  console.log('🚀 Configurando códigos DCTF no banco de dados...');

  try {
    // Ler arquivo SQL
    const sqlPath = path.join(__dirname, '../../docs/dctf-codes-schema.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Dividir em comandos individuais
    const commands = sqlContent
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));

    console.log(`📝 Executando ${commands.length} comandos SQL...`);

    // Executar cada comando
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      
      if (command.trim()) {
        console.log(`   ${i + 1}/${commands.length}: ${command.substring(0, 50)}...`);
        
        const { error } = await supabase.rpc('exec_sql', { sql: command });
        
        if (error) {
          console.warn(`   ⚠️  Aviso no comando ${i + 1}: ${error.message}`);
        }
      }
    }

    console.log('✅ Schema de códigos DCTF configurado com sucesso!');

    // Verificar se as tabelas foram criadas
    console.log('🔍 Verificando tabelas criadas...');
    
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['dctf_codes', 'dctf_receita_codes', 'dctf_aliquotas']);

    if (tablesError) {
      console.error('❌ Erro ao verificar tabelas:', tablesError.message);
    } else {
      console.log('📊 Tabelas encontradas:', tables?.map(t => t.table_name).join(', '));
    }

    // Verificar dados inseridos
    console.log('📈 Verificando dados inseridos...');
    
    const { data: codesCount, error: codesError } = await supabase
      .from('dctf_codes')
      .select('id', { count: 'exact' });

    if (codesError) {
      console.error('❌ Erro ao contar códigos:', codesError.message);
    } else {
      console.log(`   Códigos DCTF: ${codesCount?.length || 0} registros`);
    }

    const { data: receitaCount, error: receitaError } = await supabase
      .from('dctf_receita_codes')
      .select('id', { count: 'exact' });

    if (receitaError) {
      console.error('❌ Erro ao contar códigos de receita:', receitaError.message);
    } else {
      console.log(`   Códigos de Receita: ${receitaCount?.length || 0} registros`);
    }

    const { data: aliquotaCount, error: aliquotaError } = await supabase
      .from('dctf_aliquotas')
      .select('id', { count: 'exact' });

    if (aliquotaError) {
      console.error('❌ Erro ao contar alíquotas:', aliquotaError.message);
    } else {
      console.log(`   Alíquotas: ${aliquotaCount?.length || 0} registros`);
    }

    console.log('🎉 Configuração concluída com sucesso!');

  } catch (error: any) {
    console.error('❌ Erro durante configuração:', error.message);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  setupDCTFCodes()
    .then(() => {
      console.log('✅ Script finalizado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro fatal:', error);
      process.exit(1);
    });
}

export { setupDCTFCodes };

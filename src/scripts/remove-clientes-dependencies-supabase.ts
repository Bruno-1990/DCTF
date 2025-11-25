/**
 * Script para remover dependências da tabela clientes na tabela dctf_declaracoes
 * Executa via API do Supabase usando service role key
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

async function removeClientesDependencies() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar configurados no .env');
    process.exit(1);
  }

  console.log('🔧 Conectando ao Supabase...');
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Ler o script SQL
  const sqlPath = path.join(__dirname, '../../docs/migrations/supabase/remove_clientes_dependencies.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  // Dividir o script em comandos individuais (separados por ;)
  const commands = sql
    .split(';')
    .map(cmd => cmd.trim())
    .filter(cmd => cmd.length > 0 && !cmd.startsWith('--') && !cmd.startsWith('/*'));

  console.log(`📝 Executando ${commands.length} comandos SQL...\n`);

  try {
    // Executar cada comando
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      
      // Pular blocos DO $$ ... END $$ (executar como um bloco)
      if (command.includes('DO $$')) {
        const doBlock = sql.match(/DO \$\$[\s\S]*?\$\$;/)?.[0];
        if (doBlock) {
          console.log(`[${i + 1}/${commands.length}] Executando bloco DO...`);
          const { error } = await supabase.rpc('exec_sql', { sql_query: doBlock });
          if (error) {
            console.error(`❌ Erro no comando ${i + 1}:`, error.message);
          } else {
            console.log(`✅ Comando ${i + 1} executado com sucesso`);
          }
          // Pular os comandos que já foram processados no bloco DO
          continue;
        }
      }

      // Pular comentários e comandos vazios
      if (command.startsWith('--') || command.length < 10) {
        continue;
      }

      console.log(`[${i + 1}/${commands.length}] Executando: ${command.substring(0, 50)}...`);
      
      // Usar RPC para executar SQL (se disponível) ou executar diretamente
      const { error } = await supabase.rpc('exec_sql', { sql_query: command });
      
      if (error) {
        // Se RPC não estiver disponível, tentar executar via query direta
        console.warn(`⚠️  RPC não disponível, tentando método alternativo...`);
        console.warn(`   Comando que precisa ser executado manualmente: ${command}`);
      } else {
        console.log(`✅ Comando ${i + 1} executado com sucesso`);
      }
    }

    console.log('\n✅ Processo concluído!');
    console.log('\n📋 Próximos passos:');
    console.log('   1. Verifique no Supabase SQL Editor se os triggers foram removidos');
    console.log('   2. Teste inserir dados via n8n');
    console.log('   3. Verifique se não há mais erros relacionados a "clientes"');

  } catch (error: any) {
    console.error('❌ Erro ao executar script:', error.message);
    console.error('\n💡 Alternativa: Execute o script SQL diretamente no Supabase SQL Editor');
    console.error(`   Arquivo: ${sqlPath}`);
    process.exit(1);
  }
}

// Executar
removeClientesDependencies().catch(console.error);


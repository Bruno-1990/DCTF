/**
 * Testar sincronização completa do Supabase para MySQL
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

import { DCTFSyncService } from './src/services/DCTFSyncService';
import { executeQuery } from './src/config/mysql';

async function testSyncCompleto() {
  try {
    console.log('🔄 TESTANDO SINCRONIZAÇÃO COMPLETA\n');
    
    const testId = 'dbc065fa-b850-410f-acde-8bf603a9bd41';
    
    // 1. Verificar valores ANTES da sincronização
    console.log('📊 ANTES DA SINCRONIZAÇÃO:\n');
    const before = await executeQuery<any>(
      `SELECT id, data_transmissao, situacao, updated_at FROM dctf_declaracoes WHERE id = ?`,
      [testId]
    );
    
    if (before.length > 0) {
      console.log(`   data_transmissao: ${before[0].data_transmissao}`);
      console.log(`   situacao: ${before[0].situacao}`);
      console.log(`   updated_at: ${before[0].updated_at}\n`);
    }
    
    // 2. Executar sincronização
    console.log('🔄 Executando sincronização do Supabase...\n');
    const syncService = new DCTFSyncService();
    
    const result = await syncService.syncFromSupabase((progress) => {
      if (progress.processed % 10 === 0 || progress.processed === progress.total) {
        console.log(`   Progresso: ${progress.processed}/${progress.total} (${progress.inserted} novos, ${progress.updated} atualizados, ${progress.errors} erros)`);
      }
    });
    
    if (!result.success) {
      console.log('\n❌ ERRO na sincronização:', result.error);
      process.exit(1);
    }
    
    console.log('\n✅ Sincronização concluída!');
    console.log(`   ${result.data?.inserted} inseridos`);
    console.log(`   ${result.data?.updated} atualizados`);
    console.log(`   ${result.data?.errors} erros\n`);
    
    // 3. Verificar valores DEPOIS da sincronização
    console.log('📊 DEPOIS DA SINCRONIZAÇÃO:\n');
    const after = await executeQuery<any>(
      `SELECT id, data_transmissao, situacao, updated_at FROM dctf_declaracoes WHERE id = ?`,
      [testId]
    );
    
    if (after.length > 0) {
      console.log(`   data_transmissao: ${after[0].data_transmissao}`);
      console.log(`   situacao: ${after[0].situacao}`);
      console.log(`   updated_at: ${after[0].updated_at}\n`);
      
      // Verificar se foi atualizado
      const dataTransStr = String(after[0].data_transmissao);
      const updatedAtStr = String(after[0].updated_at);
      
      const beforeDataStr = String(before[0].data_transmissao);
      const beforeUpdatedStr = String(before[0].updated_at);
      
      if (dataTransStr !== beforeDataStr || updatedAtStr !== beforeUpdatedStr) {
        console.log('✅ SUCESSO! Registro foi atualizado pelo Supabase!\n');
        console.log('📝 Mudanças detectadas:');
        if (dataTransStr !== beforeDataStr) {
          console.log(`   data_transmissao: ${beforeDataStr} → ${dataTransStr}`);
        }
        if (updatedAtStr !== beforeUpdatedStr) {
          console.log(`   updated_at: ${beforeUpdatedStr} → ${updatedAtStr}`);
        }
      } else {
        console.log('⚠️ ATENÇÃO: Registro não foi modificado pela sincronização');
        console.log('   Isso pode significar que os dados do Supabase já estão sincronizados\n');
      }
    }
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Erro:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testSyncCompleto();

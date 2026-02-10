/**
 * Testar se a correção do upsert está funcionando
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

const envPath = path.join(__dirname, '.env.temp');
dotenv.config({ path: envPath });

import { createSupabaseAdapter } from './src/services/SupabaseAdapter';

async function testSyncFix() {
  try {
    console.log('🔧 TESTANDO CORREÇÃO DO UPSERT\n');
    
    const adapter = createSupabaseAdapter();
    const testRecord = {
      id: 'dbc065fa-b850-410f-acde-8bf603a9bd41',
      cnpj: '33249391000131',
      cliente_id: null, // Convertido de CNPJ formatado
      periodo_apuracao: '12/2025',
      data_transmissao: '2026-01-23', // Data do Supabase
      hora_transmissao: '13:57:32',
      situacao: 'Ativa',
      created_at: '2026-01-28 11:12:49', // Timestamp do Supabase
      updated_at: '2026-01-28 11:12:49',
    };
    
    console.log('📝 Dados de teste (simulando Supabase):');
    console.log(JSON.stringify(testRecord, null, 2));
    console.log('');
    
    console.log('🔄 Executando UPSERT...');
    const { data, error } = await adapter
      .from('dctf_declaracoes')
      .upsert(testRecord, { onConflict: 'id' });
    
    if (error) {
      console.log('❌ ERRO no UPSERT:');
      console.log(JSON.stringify(error, null, 2));
      process.exit(1);
    }
    
    console.log('✅ UPSERT executado com sucesso!\n');
    
    // Verificar se o registro foi atualizado
    console.log('🔍 Verificando registro no MySQL...');
    const { data: verificacao } = await adapter
      .from('dctf_declaracoes')
      .select('*')
      .eq('id', testRecord.id)
      .limit(1);
    
    if (verificacao && verificacao.length > 0) {
      const record = verificacao[0];
      console.log('\n📄 Registro atualizado no MySQL:');
      console.log(`   ID: ${record.id}`);
      console.log(`   CNPJ: ${record.cnpj}`);
      console.log(`   Cliente ID: ${record.cliente_id}`);
      console.log(`   Período: ${record.periodo_apuracao}`);
      console.log(`   Data Transmissão: ${record.data_transmissao}`);
      console.log(`   Hora Transmissão: ${record.hora_transmissao}`);
      console.log(`   Situação: ${record.situacao}`);
      console.log(`   Created At: ${record.created_at}`);
      console.log(`   Updated At: ${record.updated_at}`);
      
      // Verificar se foi atualizado
      const dataTransmissaoStr = String(record.data_transmissao);
      if (dataTransmissaoStr.includes('2026-01-23')) {
        console.log('\n✅ SUCESSO! Registro foi atualizado com dados do Supabase!');
      } else {
        console.log('\n⚠️ ATENÇÃO: Data de transmissão não foi atualizada!');
        console.log(`   Esperado: 2026-01-23`);
        console.log(`   Obtido: ${dataTransmissaoStr}`);
      }
    } else {
      console.log('\n❌ Registro não encontrado após UPSERT!');
    }
    
    console.log('\n✅ Teste concluído!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Erro:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testSyncFix();

/**
 * Investigar por que um registro específico não está sendo sincronizado
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

import { supabaseAdmin, supabase } from './src/config/database';
import { executeQuery } from './src/config/mysql';

async function investigarSync() {
  try {
    const cnpj = '33249391000131';
    const idMysql = 'dbc065fa-b850-410f-acde-8bf603a9bd41';
    
    console.log('🔍 INVESTIGAÇÃO DE SINCRONIZAÇÃO\n');
    console.log(`   CNPJ: ${cnpj}`);
    console.log(`   ID MySQL: ${idMysql}\n`);
    
    // 1. Verificar Supabase
    console.log('📊 VERIFICANDO SUPABASE...\n');
    
    const supabaseClient = supabaseAdmin || supabase;
    if (!supabaseClient) {
      console.log('   ❌ Supabase não está configurado!');
      console.log('   ⚠️ Configure SUPABASE_URL e SUPABASE_ANON_KEY no .env\n');
    } else {
      console.log('   ✅ Supabase está configurado\n');
      
      // Buscar por ID
      console.log('   🔍 Buscando registro por ID no Supabase...');
      const { data: byId, error: errorId } = await supabaseClient
        .from('dctf_declaracoes')
        .select('*')
        .eq('id', idMysql);
      
      if (errorId) {
        console.log(`   ❌ Erro ao buscar por ID: ${errorId.message}`);
      } else if (byId && byId.length > 0) {
        console.log(`   ✅ ENCONTRADO por ID! Total: ${byId.length}`);
        console.log('\n   📄 Dados do Supabase:');
        const record = byId[0];
        console.log(`      ID: ${record.id}`);
        console.log(`      CNPJ: ${record.cnpj}`);
        console.log(`      Cliente ID: ${record.cliente_id}`);
        console.log(`      Período: ${record.periodo_apuracao || record.periodo}`);
        console.log(`      Data Transmissão: ${record.data_transmissao || record.dataTransmissao}`);
        console.log(`      Hora Transmissão: ${record.hora_transmissao}`);
        console.log(`      Situação: ${record.situacao}`);
        console.log(`      Created At: ${record.created_at}`);
        console.log(`      Updated At: ${record.updated_at}`);
      } else {
        console.log(`   ❌ NÃO ENCONTRADO por ID`);
        
        // Tentar buscar por CNPJ
        console.log('\n   🔍 Buscando por CNPJ no Supabase...');
        const { data: byCnpj, error: errorCnpj } = await supabaseClient
          .from('dctf_declaracoes')
          .select('*')
          .eq('cnpj', cnpj)
          .order('data_transmissao', { ascending: false })
          .limit(5);
        
        if (errorCnpj) {
          console.log(`   ❌ Erro ao buscar por CNPJ: ${errorCnpj.message}`);
        } else if (byCnpj && byCnpj.length > 0) {
          console.log(`   ✅ ENCONTRADO por CNPJ! Total: ${byCnpj.length} (mostrando até 5)`);
          byCnpj.forEach((rec: any, index: number) => {
            console.log(`\n   ${index + 1}. ID: ${rec.id}`);
            console.log(`      Período: ${rec.periodo_apuracao || rec.periodo}`);
            console.log(`      Data Trans.: ${rec.data_transmissao || rec.dataTransmissao}`);
          });
        } else {
          console.log(`   ❌ NÃO ENCONTRADO por CNPJ`);
        }
      }
    }
    
    // 2. Verificar MySQL
    console.log('\n\n📊 VERIFICANDO MYSQL...\n');
    
    const queryMysql = `SELECT * FROM dctf_declaracoes WHERE id = ?`;
    const resultMysql = await executeQuery<any>(queryMysql, [idMysql]);
    
    if (resultMysql.length > 0) {
      console.log('   ✅ ENCONTRADO no MySQL!');
      const record = resultMysql[0];
      console.log('\n   📄 Dados do MySQL:');
      console.log(`      ID: ${record.id}`);
      console.log(`      CNPJ: ${record.cnpj}`);
      console.log(`      Cliente ID: ${record.cliente_id}`);
      console.log(`      Período: ${record.periodo_apuracao}`);
      console.log(`      Data Transmissão: ${record.data_transmissao}`);
      console.log(`      Hora Transmissão: ${record.hora_transmissao}`);
      console.log(`      Situação: ${record.situacao}`);
      console.log(`      Created At: ${record.created_at}`);
      console.log(`      Updated At: ${record.updated_at}`);
    } else {
      console.log('   ❌ NÃO ENCONTRADO no MySQL');
    }
    
    // 3. Conclusão
    console.log('\n\n📋 CONCLUSÃO:\n');
    
    if (supabaseClient) {
      console.log('Se o registro:');
      console.log('   ✅ EXISTE no Supabase E no MySQL com mesmo ID → Sincronização funcionando (atualização)');
      console.log('   ✅ EXISTE no Supabase mas NÃO no MySQL → Será inserido na próxima sync');
      console.log('   ⚠️ NÃO EXISTE no Supabase mas EXISTE no MySQL → Foi criado direto no MySQL');
      console.log('   ❌ Tem IDs diferentes → São registros diferentes, não será sincronizado');
    } else {
      console.log('   ⚠️ SUPABASE NÃO CONFIGURADO');
      console.log('   O registro no MySQL foi criado diretamente ou via outra fonte');
    }
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

investigarSync();

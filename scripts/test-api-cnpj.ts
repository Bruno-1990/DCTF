/**
 * Script para testar se um CNPJ específico está sendo retornado pela API
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Carregar variáveis de ambiente
const envPath = path.join(__dirname, '.env.temp');
dotenv.config({ path: envPath });

import axios from 'axios';

async function testarAPICNPJ() {
  try {
    const cnpj = '33249391000131';
    const apiUrl = 'http://192.168.0.47:3000';
    
    console.log(`🔍 Testando API para CNPJ: ${cnpj}\n`);
    
    // 1. Testar listagem sem filtros
    console.log('📋 Teste 1: Listando TODAS as declarações (limite 100)...');
    const response1 = await axios.get(`${apiUrl}/api/dctf`, {
      params: {
        limit: 100
      }
    });
    
    console.log(`   Total retornado: ${response1.data.data?.length || 0}`);
    
    // Procurar o CNPJ nos resultados
    const encontrado = response1.data.data?.find((item: any) => 
      (item.numeroIdentificacao === cnpj || item.cnpj === cnpj)
    );
    
    if (encontrado) {
      console.log('   ✅ CNPJ ENCONTRADO na listagem geral!');
      console.log('   📄 Dados do registro:');
      console.log(JSON.stringify(encontrado, null, 2));
    } else {
      console.log('   ❌ CNPJ NÃO ENCONTRADO na listagem geral!');
      console.log('   🔍 Primeiros 5 CNPJs retornados:');
      response1.data.data?.slice(0, 5).forEach((item: any, index: number) => {
        console.log(`      ${index + 1}. ${item.numeroIdentificacao || item.cnpj || 'N/A'}`);
      });
    }
    
    // 2. Testar busca com filtro de transmissão
    console.log('\n📋 Teste 2: Listando com filtro de transmissão 01/2026...');
    const response2 = await axios.get(`${apiUrl}/api/dctf`, {
      params: {
        periodoTransmissao: '2026-01',
        limit: 100
      }
    });
    
    console.log(`   Total retornado com filtro: ${response2.data.data?.length || 0}`);
    
    const encontradoFiltro = response2.data.data?.find((item: any) => 
      (item.numeroIdentificacao === cnpj || item.cnpj === cnpj)
    );
    
    if (encontradoFiltro) {
      console.log('   ✅ CNPJ ENCONTRADO com filtro!');
    } else {
      console.log('   ❌ CNPJ NÃO ENCONTRADO com filtro!');
    }
    
    // 3. Testar busca direta no banco de dados
    console.log('\n📋 Teste 3: Buscando direto no MySQL...');
    
    // Importar depois para não causar conflito
    const { executeQuery } = await import('./src/config/mysql');
    
    const queryDirect = `SELECT * FROM dctf_declaracoes WHERE cnpj = ?`;
    const resultDirect = await executeQuery<any>(queryDirect, [cnpj]);
    
    console.log(`   Total no MySQL: ${resultDirect.length}`);
    
    if (resultDirect.length > 0) {
      console.log('   ✅ CNPJ EXISTE NO MYSQL!');
      console.log('   📄 Dados do banco:');
      resultDirect.forEach((row: any) => {
        console.log(`      ID: ${row.id}`);
        console.log(`      CNPJ: ${row.cnpj}`);
        console.log(`      Período: ${row.periodo_apuracao}`);
        console.log(`      Data Transmissão: ${row.data_transmissao}`);
        console.log(`      Created At: ${row.created_at}`);
        console.log('');
      });
    } else {
      console.log('   ❌ CNPJ NÃO EXISTE NO MYSQL!');
    }
    
    console.log('\n✅ Teste concluído!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Erro ao testar API:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    process.exit(1);
  }
}

testarAPICNPJ();

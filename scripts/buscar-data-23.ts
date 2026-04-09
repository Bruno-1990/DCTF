/**
 * Buscar registros com data de transmissão específica
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

const envPath = path.join(__dirname, '.env.temp');
dotenv.config({ path: envPath });

import { executeQuery } from './src/config/mysql';

async function buscarData23() {
  try {
    console.log('🔍 Buscando registros com data de transmissão 23/01/2026...\n');
    
    const query = `
      SELECT *
      FROM dctf_declaracoes
      WHERE cnpj = '33249391000131'
        AND DATE(data_transmissao) = '2026-01-23'
    `;
    
    const result = await executeQuery<any>(query);
    
    console.log(`📊 Total encontrado: ${result.length}\n`);
    
    if (result.length > 0) {
      result.forEach((row: any, index: number) => {
        console.log(`\nREGISTRO ${index + 1}:`);
        console.log(`   ID: ${row.id}`);
        console.log(`   CNPJ: ${row.cnpj}`);
        console.log(`   Período: ${row.periodo_apuracao}`);
        console.log(`   Data Transmissão: ${row.data_transmissao}`);
        console.log(`   Hora Transmissão: ${row.hora_transmissao}`);
        console.log(`   Situação: ${row.situacao}`);
        console.log(`   Criado em: ${row.created_at}`);
      });
    } else {
      console.log('❌ Nenhum registro encontrado com data 23/01/2026');
      console.log('\n🔍 Vou buscar todos os registros deste CNPJ...\n');
      
      const queryAll = `
        SELECT id, cnpj, periodo_apuracao, data_transmissao, hora_transmissao, created_at
        FROM dctf_declaracoes
        WHERE cnpj = '33249391000131'
        ORDER BY data_transmissao DESC
      `;
      
      const allRecords = await executeQuery<any>(queryAll);
      console.log(`📊 Total de registros para este CNPJ: ${allRecords.length}\n`);
      
      allRecords.forEach((row: any, index: number) => {
        const dateTransmissao = new Date(row.data_transmissao);
        const dateFormatted = dateTransmissao.toLocaleDateString('pt-BR') + ' ' + 
                             (row.hora_transmissao || dateTransmissao.toLocaleTimeString('pt-BR'));
        
        console.log(`${index + 1}. ${row.periodo_apuracao || 'N/A'} - ${dateFormatted} (criado: ${new Date(row.created_at).toLocaleDateString('pt-BR')})`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

buscarData23();

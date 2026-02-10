/**
 * Script para verificar quantos registros foram adicionados hoje na tabela dctf_declaracoes
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Carregar variáveis de ambiente
const envPath = path.join(__dirname, '.env.temp');
dotenv.config({ path: envPath });

console.log('📝 Configuração MySQL:');
console.log('   Host:', process.env['MYSQL_HOST']);
console.log('   Port:', process.env['MYSQL_PORT']);
console.log('   User:', process.env['MYSQL_USER']);
console.log('   Database:', process.env['MYSQL_DATABASE']);
console.log('');

import { executeQuery } from './src/config/mysql';

async function checkDCTFToday() {
  try {
    console.log('🔍 Verificando registros adicionados hoje em dctf_declaracoes...\n');
    
    // Data de hoje no formato YYYY-MM-DD
    const hoje = '2026-01-28';
    
    // Query para contar registros criados hoje
    const queryCount = `
      SELECT COUNT(*) as total
      FROM dctf_declaracoes
      WHERE DATE(created_at) = ?
    `;
    
    const resultCount = await executeQuery<{ total: number }>(queryCount, [hoje]);
    const total = resultCount[0]?.total || 0;
    
    console.log(`📊 Total de registros adicionados hoje (${hoje}): ${total}`);
    
    if (total > 0) {
      console.log('\n📋 Detalhes dos registros:\n');
      
      // Primeiro, verificar estrutura da tabela
      const queryColumns = `DESCRIBE dctf_declaracoes`;
      const columns = await executeQuery<any>(queryColumns);
      const columnNames = columns.map((c: any) => c.Field);
      
      console.log('📋 Colunas disponíveis na tabela:', columnNames.slice(0, 15).join(', '), '...');
      console.log('');
      
      // Query para listar os registros criados hoje - usar apenas colunas que existem
      const selectColumns = [
        'id',
        columnNames.includes('cnpj') ? 'cnpj' : null,
        columnNames.includes('periodo_apuracao') ? 'periodo_apuracao' : null,
        columnNames.includes('situacao') ? 'situacao' : null,
        columnNames.includes('tipo_declaracao') ? 'tipo_declaracao' : null,
        columnNames.includes('origem') ? 'origem' : null,
        columnNames.includes('data_transmissao') ? 'data_transmissao' : null,
        columnNames.includes('debito_apurado') ? 'debito_apurado' : null,
        columnNames.includes('saldo_a_pagar') ? 'saldo_a_pagar' : null,
        'created_at',
        'updated_at',
      ].filter(Boolean).join(', ');
      
      const queryDetails = `
        SELECT ${selectColumns}
        FROM dctf_declaracoes
        WHERE DATE(created_at) = ?
        ORDER BY created_at DESC
      `;
      
      const resultDetails = await executeQuery<any>(queryDetails, [hoje]);
      
      // Agrupar por período de transmissão
      const porPeriodoTransmissao = new Map<string, number>();
      const porSituacao = new Map<string, number>();
      const porOrigem = new Map<string, number>();
      
      resultDetails.forEach((row: any) => {
        // Período de transmissão
        if (row.data_transmissao) {
          const date = new Date(row.data_transmissao);
          const ano = date.getUTCFullYear();
          const mes = String(date.getUTCMonth() + 1).padStart(2, '0');
          const periodo = `${mes}/${ano}`;
          
          porPeriodoTransmissao.set(periodo, (porPeriodoTransmissao.get(periodo) || 0) + 1);
        }
        
        // Situação
        const situacao = row.situacao || 'N/A';
        porSituacao.set(situacao, (porSituacao.get(situacao) || 0) + 1);
        
        // Origem
        const origem = row.origem || 'N/A';
        porOrigem.set(origem, (porOrigem.get(origem) || 0) + 1);
      });
      
      console.log('📅 Por Período de Transmissão:');
      Array.from(porPeriodoTransmissao.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .forEach(([periodo, count]) => {
          console.log(`   ${periodo}: ${count} registro(s)`);
        });
      
      console.log('\n📊 Por Situação:');
      Array.from(porSituacao.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([situacao, count]) => {
          console.log(`   ${situacao}: ${count} registro(s)`);
        });
      
      console.log('\n🏢 Por Origem:');
      Array.from(porOrigem.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([origem, count]) => {
          console.log(`   ${origem}: ${count} registro(s)`);
        });
      
      console.log('\n📋 Primeiros 10 registros:');
      resultDetails.slice(0, 10).forEach((row: any, index: number) => {
        console.log(`\n${index + 1}. ID: ${row.id}`);
        if (row.cnpj) console.log(`   CNPJ: ${row.cnpj}`);
        if (row.periodo_apuracao) console.log(`   Período Apuração: ${row.periodo_apuracao}`);
        if (row.situacao) console.log(`   Situação: ${row.situacao}`);
        if (row.tipo_declaracao) console.log(`   Tipo: ${row.tipo_declaracao}`);
        if (row.origem) console.log(`   Origem: ${row.origem}`);
        if (row.data_transmissao) console.log(`   Data Transmissão: ${row.data_transmissao}`);
        console.log(`   Criado em: ${row.created_at}`);
      });
      
      if (resultDetails.length > 10) {
        console.log(`\n... e mais ${resultDetails.length - 10} registro(s)`);
      }
    }
    
    console.log('\n✅ Análise concluída!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao verificar registros:', error);
    process.exit(1);
  }
}

checkDCTFToday();

/**
 * Script para buscar registros por CNPJ
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Carregar variáveis de ambiente
const envPath = path.join(__dirname, '.env.temp');
dotenv.config({ path: envPath });

import { executeQuery } from './src/config/mysql';

async function buscarPorCNPJ() {
  try {
    const cnpj = '33024708000131';
    
    console.log(`🔍 Buscando registros para CNPJ: ${cnpj}\n`);
    
    // Query para buscar todos os registros deste CNPJ
    const query = `
      SELECT *
      FROM dctf_declaracoes
      WHERE cnpj = ?
      ORDER BY created_at DESC
    `;
    
    const result = await executeQuery<any>(query, [cnpj]);
    
    console.log(`📊 Total de registros encontrados: ${result.length}\n`);
    
    if (result.length === 0) {
      console.log('❌ Nenhum registro encontrado para este CNPJ.');
      process.exit(0);
    }
    
    // Mostrar todos os registros
    result.forEach((row: any, index: number) => {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`REGISTRO ${index + 1} de ${result.length}`);
      console.log('='.repeat(80));
      
      // Mostrar todos os campos
      Object.keys(row).forEach((key) => {
        const value = row[key];
        let displayValue = value;
        
        // Formatar valores
        if (value === null || value === undefined) {
          displayValue = 'NULL';
        } else if (value instanceof Date) {
          displayValue = value.toISOString();
        } else if (typeof value === 'number') {
          // Formatar números com vírgula se for decimal
          if (key.includes('debito') || key.includes('saldo') || key.includes('valor')) {
            displayValue = value.toLocaleString('pt-BR', { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            });
          }
        }
        
        console.log(`${key.padEnd(25)}: ${displayValue}`);
      });
    });
    
    console.log(`\n${'='.repeat(80)}\n`);
    
    // Estatísticas
    console.log('📊 ESTATÍSTICAS:');
    
    // Por situação
    const situacoes = new Map<string, number>();
    result.forEach((row: any) => {
      const situacao = row.situacao || 'N/A';
      situacoes.set(situacao, (situacoes.get(situacao) || 0) + 1);
    });
    
    console.log('\n📋 Por Situação:');
    Array.from(situacoes.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([situacao, count]) => {
        console.log(`   ${situacao}: ${count} registro(s)`);
      });
    
    // Por período de apuração
    const periodos = new Map<string, number>();
    result.forEach((row: any) => {
      const periodo = row.periodo_apuracao || 'N/A';
      periodos.set(periodo, (periodos.get(periodo) || 0) + 1);
    });
    
    console.log('\n📅 Por Período de Apuração:');
    Array.from(periodos.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .forEach(([periodo, count]) => {
        console.log(`   ${periodo}: ${count} registro(s)`);
      });
    
    // Por origem
    const origens = new Map<string, number>();
    result.forEach((row: any) => {
      const origem = row.origem || 'N/A';
      origens.set(origem, (origens.get(origem) || 0) + 1);
    });
    
    console.log('\n🏢 Por Origem:');
    Array.from(origens.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([origem, count]) => {
        console.log(`   ${origem}: ${count} registro(s)`);
      });
    
    // Totais financeiros
    const debitoTotal = result.reduce((sum: number, row: any) => {
      return sum + (row.debito_apurado || 0);
    }, 0);
    
    const saldoTotal = result.reduce((sum: number, row: any) => {
      return sum + (row.saldo_a_pagar || 0);
    }, 0);
    
    console.log('\n💰 Totais Financeiros:');
    console.log(`   Débito Apurado Total: R$ ${debitoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`   Saldo a Pagar Total: R$ ${saldoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    
    console.log('\n✅ Consulta concluída!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao buscar registros:', error);
    process.exit(1);
  }
}

buscarPorCNPJ();

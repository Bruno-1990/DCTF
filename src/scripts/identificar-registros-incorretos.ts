/**
 * Script para identificar registros incorretos:
 * 1. Razões sociais que ainda contêm CNPJs
 * 2. Clientes duplicados (mesma razão social sem CNPJ, mas CNPJs diferentes)
 */

// Carregar variáveis de ambiente
import * as dotenv from 'dotenv';
dotenv.config();

import { getConnection } from '../config/mysql';

async function main() {
  console.log('🔍 Identificando registros incorretos...\n');
  
  const connection = await getConnection();
  
  try {
    // 1. Buscar razões sociais que ainda contêm CNPJs
    const [rowsComCNPJ] = await connection.execute(`
      SELECT 
        id,
        razao_social,
        cnpj_limpo,
        codigo_sci,
        created_at
      FROM clientes
      WHERE razao_social REGEXP '[0-9]{2}\\.[0-9]{3}\\.[0-9]{3}/[0-9]{4}-[0-9]{2}'
      ORDER BY razao_social
    `);
    
    const comCNPJNaRazao = rowsComCNPJ as any[];
    
    // 2. Buscar duplicados por razão social (sem CNPJ no nome)
    const [rowsDuplicados] = await connection.execute(`
      SELECT 
        razao_social_limpa,
        COUNT(*) as quantidade,
        GROUP_CONCAT(id ORDER BY created_at SEPARATOR ',') as ids,
        GROUP_CONCAT(cnpj_limpo ORDER BY created_at SEPARATOR ' | ') as cnpjs,
        GROUP_CONCAT(created_at ORDER BY created_at SEPARATOR ' | ') as datas_criacao
      FROM (
        SELECT 
          id,
          cnpj_limpo,
          TRIM(REGEXP_REPLACE(razao_social, '[0-9]{2}\\.[0-9]{3}\\.[0-9]{3}/[0-9]{4}-[0-9]{2}', '')) as razao_social_limpa,
          created_at
        FROM clientes
        WHERE razao_social IS NOT NULL
      ) as clientes_limpos
      WHERE razao_social_limpa != ''
      GROUP BY razao_social_limpa
      HAVING COUNT(*) > 1
      ORDER BY quantidade DESC, razao_social_limpa
    `);
    
    const duplicados = rowsDuplicados as any[];
    
    console.log('='.repeat(100));
    console.log('RELATÓRIO DE REGISTROS INCORRETOS');
    console.log('='.repeat(100));
    console.log(`\n1. RAZÕES SOCIAIS COM CNPJ: ${comCNPJNaRazao.length}`);
    console.log(`2. RAZÕES SOCIAIS DUPLICADAS: ${duplicados.length}`);
    console.log('='.repeat(100));
    
    if (comCNPJNaRazao.length > 0) {
      console.log('\n📋 RAZÕES SOCIAIS QUE AINDA CONTÊM CNPJ:\n');
      comCNPJNaRazao.slice(0, 10).forEach((cliente, index) => {
        const cnpjMatch = cliente.razao_social.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
        const cnpjNaRazao = cnpjMatch ? cnpjMatch[0] : 'não encontrado';
        console.log(`${index + 1}. ID: ${cliente.id}`);
        console.log(`   Razão Social: ${cliente.razao_social}`);
        console.log(`   CNPJ na razão: ${cnpjNaRazao}`);
        console.log(`   CNPJ correto: ${cliente.cnpj_limpo || 'N/A'}`);
        console.log('');
      });
      if (comCNPJNaRazao.length > 10) {
        console.log(`   ... e mais ${comCNPJNaRazao.length - 10} registros\n`);
      }
    }
    
    if (duplicados.length > 0) {
      console.log('\n📋 RAZÕES SOCIAIS DUPLICADAS (mesma razão, CNPJs diferentes):\n');
      duplicados.slice(0, 10).forEach((dup, index) => {
        const ids = (dup.ids as string).split(',');
        const cnpjs = (dup.cnpjs as string).split(' | ');
        console.log(`${index + 1}. Razão Social: ${dup.razao_social_limpa}`);
        console.log(`   Quantidade: ${dup.quantidade} registros`);
        console.log(`   IDs: ${ids.join(', ')}`);
        console.log(`   CNPJs: ${cnpjs.join(', ')}`);
        console.log('');
      });
      if (duplicados.length > 10) {
        console.log(`   ... e mais ${duplicados.length - 10} grupos duplicados\n`);
      }
    }
    
    // Salvar relatório completo
    const fs = require('fs');
    const path = require('path');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const reportPath = path.join(
      process.cwd(),
      '..',
      '..',
      '..',
      'Desktop',
      `registros-incorretos-${timestamp}.txt`
    );
    
    const reportContent = [
      '='.repeat(100),
      'RELATÓRIO DE REGISTROS INCORRETOS',
      '='.repeat(100),
      `Data: ${new Date().toLocaleString('pt-BR')}`,
      `Total de razões sociais com CNPJ: ${comCNPJNaRazao.length}`,
      `Total de razões sociais duplicadas: ${duplicados.length}`,
      '='.repeat(100),
      '',
      '1. RAZÕES SOCIAIS QUE AINDA CONTÊM CNPJ:',
      '='.repeat(100),
      '',
      ...comCNPJNaRazao.map((cliente, index) => {
        const cnpjMatch = cliente.razao_social.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
        const cnpjNaRazao = cnpjMatch ? cnpjMatch[0] : 'não encontrado';
        const razaoLimpa = cliente.razao_social.replace(/\s+\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, '').trim();
        
        return [
          `${index + 1}. ID: ${cliente.id}`,
          `   Razão Social (atual): ${cliente.razao_social}`,
          `   Razão Social (corrigida): ${razaoLimpa}`,
          `   CNPJ na razão: ${cnpjNaRazao}`,
          `   CNPJ correto: ${cliente.cnpj_limpo || 'N/A'}`,
          `   Código SCI: ${cliente.codigo_sci || 'N/A'}`,
          `   Criado em: ${cliente.created_at || 'N/A'}`,
          '',
        ].join('\n');
      }),
      '',
      '2. RAZÕES SOCIAIS DUPLICADAS:',
      '='.repeat(100),
      '',
      ...duplicados.map((dup, index) => {
        const ids = (dup.ids as string).split(',');
        const cnpjs = (dup.cnpjs as string).split(' | ');
        const datas = (dup.datas_criacao as string).split(' | ');
        
        return [
          `${index + 1}. Razão Social: ${dup.razao_social_limpa}`,
          `   Quantidade: ${dup.quantidade} registros`,
          `   IDs: ${ids.join(', ')}`,
          `   CNPJs: ${cnpjs.join(', ')}`,
          `   Datas de criação: ${datas.join(', ')}`,
          '',
        ].join('\n');
      }),
      '='.repeat(100),
      'FIM DO RELATÓRIO',
      '='.repeat(100),
    ].join('\n');
    
    fs.writeFileSync(reportPath, reportContent, 'utf-8');
    console.log(`\n📝 Relatório completo salvo em: ${reportPath}`);
    
  } catch (error: any) {
    console.error('❌ Erro:', error);
    throw error;
  } finally {
    connection.release();
  }
}

main()
  .then(() => {
    console.log('\n✅ Verificação concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar verificação:', error);
    process.exit(1);
  });



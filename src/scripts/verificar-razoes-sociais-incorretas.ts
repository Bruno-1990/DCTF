/**
 * Script para verificar clientes com razões sociais que contêm CNPJs
 * Isso indica que o parsing anterior pode ter capturado incorretamente
 */

// Carregar variáveis de ambiente
import * as dotenv from 'dotenv';
dotenv.config();

import { getConnection } from '../config/mysql';

async function main() {
  console.log('🔍 Verificando razões sociais com CNPJs incorretos...\n');
  
  const connection = await getConnection();
  
  try {
    // Buscar clientes cuja razão social contém um CNPJ formatado
    const [rows] = await connection.execute(`
      SELECT 
        id,
        razao_social,
        cnpj_limpo,
        codigo_sci
      FROM clientes
      WHERE razao_social REGEXP '[0-9]{2}\\.[0-9]{3}\\.[0-9]{3}/[0-9]{4}-[0-9]{2}'
      ORDER BY razao_social
    `);
    
    const clientesComProblema = rows as any[];
    
    if (clientesComProblema.length === 0) {
      console.log('✅ Nenhum cliente com razão social contendo CNPJ encontrado!');
      return;
    }
    
    console.log(`⚠️  Encontrados ${clientesComProblema.length} cliente(s) com razão social contendo CNPJ:\n`);
    console.log('='.repeat(100));
    console.log('ID'.padEnd(40) + ' | Razão Social (com CNPJ)'.padEnd(50) + ' | CNPJ Correto');
    console.log('-'.repeat(100));
    
    for (const cliente of clientesComProblema) {
      // Extrair CNPJ da razão social
      const cnpjMatch = cliente.razao_social.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
      const cnpjNaRazaoSocial = cnpjMatch ? cnpjMatch[0] : 'não encontrado';
      
      console.log(`${cliente.id.padEnd(40)} | ${cliente.razao_social.substring(0, 48).padEnd(50)} | ${cliente.cnpj_limpo || 'N/A'}`);
      console.log(`${' '.repeat(40)} | CNPJ na razão social: ${cnpjNaRazaoSocial}`);
      console.log(`${' '.repeat(40)} | Código SCI: ${cliente.codigo_sci || 'N/A'}`);
      console.log('-'.repeat(100));
    }
    
    // Salvar relatório
    const fs = require('fs');
    const path = require('path');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const reportPath = path.join(
      process.cwd(),
      '..',
      '..',
      '..',
      'Desktop',
      `razoes-sociais-incorretas-${timestamp}.txt`
    );
    
    const reportContent = [
      '='.repeat(100),
      'RELATÓRIO DE RAZÕES SOCIAIS COM CNPJs INCORRETOS',
      '='.repeat(100),
      `Data: ${new Date().toLocaleString('pt-BR')}`,
      `Total: ${clientesComProblema.length} cliente(s)`,
      '='.repeat(100),
      '',
      ...clientesComProblema.map((cliente, index) => {
        const cnpjMatch = cliente.razao_social.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
        const cnpjNaRazaoSocial = cnpjMatch ? cnpjMatch[0] : 'não encontrado';
        const razaoSocialCorrigida = cliente.razao_social.replace(/\s+\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, '').trim();
        
        return [
          `${index + 1}. ID: ${cliente.id}`,
          `   Razão Social (atual): ${cliente.razao_social}`,
          `   Razão Social (corrigida): ${razaoSocialCorrigida}`,
          `   CNPJ na razão social: ${cnpjNaRazaoSocial}`,
          `   CNPJ correto (cnpj_limpo): ${cliente.cnpj_limpo || 'N/A'}`,
          `   Código SCI: ${cliente.codigo_sci || 'N/A'}`,
          '',
        ].join('\n');
      }),
      '='.repeat(100),
      'FIM DO RELATÓRIO',
      '='.repeat(100),
    ].join('\n');
    
    fs.writeFileSync(reportPath, reportContent, 'utf-8');
    console.log(`\n📝 Relatório salvo em: ${reportPath}`);
    
  } catch (error: any) {
    console.error('❌ Erro ao verificar:', error);
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



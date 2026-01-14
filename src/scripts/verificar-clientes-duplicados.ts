/**
 * Script para verificar clientes duplicados no banco de dados
 * Identifica clientes com o mesmo CNPJ
 */

// Carregar variáveis de ambiente
import * as dotenv from 'dotenv';
dotenv.config();

import { getConnection } from '../config/mysql';

interface ClienteDuplicado {
  cnpj_limpo: string;
  quantidade: number;
  ids: string[];
  razao_social: string[];
  codigo_sci: string[];
}

async function main() {
  console.log('🔍 Verificando clientes duplicados no banco de dados...\n');
  
  const connection = await getConnection();
  
  try {
    // Buscar clientes duplicados por CNPJ
    const [rows] = await connection.execute(`
      SELECT 
        cnpj_limpo,
        COUNT(*) as quantidade,
        GROUP_CONCAT(id ORDER BY created_at) as ids,
        GROUP_CONCAT(razao_social ORDER BY created_at SEPARATOR ' | ') as razoes_sociais,
        GROUP_CONCAT(COALESCE(codigo_sci, 'NULL') ORDER BY created_at SEPARATOR ' | ') as codigos_sci
      FROM clientes
      WHERE cnpj_limpo IS NOT NULL AND cnpj_limpo != ''
      GROUP BY cnpj_limpo
      HAVING COUNT(*) > 1
      ORDER BY quantidade DESC, cnpj_limpo
    `);
    
    const duplicados = rows as any[];
    
    if (duplicados.length === 0) {
      console.log('✅ Nenhum cliente duplicado encontrado!');
      return;
    }
    
    console.log(`⚠️  Encontrados ${duplicados.length} CNPJ(s) com clientes duplicados:\n`);
    console.log('='.repeat(100));
    console.log('CNPJ'.padEnd(20) + ' | Qtd | IDs'.padEnd(40) + ' | Razões Sociais');
    console.log('-'.repeat(100));
    
    let totalDuplicados = 0;
    
    for (const dup of duplicados) {
      const ids = (dup.ids as string).split(',');
      const razoes = (dup.razoes_sociais as string).split(' | ');
      const codigos = (dup.codigos_sci as string).split(' | ');
      const quantidade = parseInt(dup.quantidade);
      totalDuplicados += quantidade - 1; // -1 porque um é o original
      
      console.log(`${dup.cnpj_limpo.padEnd(20)} | ${String(quantidade).padStart(3)} | ${ids.slice(0, 3).join(', ')}${ids.length > 3 ? '...' : ''}`);
      console.log(`${' '.repeat(20)} |     | Razões: ${razoes.slice(0, 2).join(' | ')}${razoes.length > 2 ? '...' : ''}`);
      console.log(`${' '.repeat(20)} |     | Códigos SCI: ${codigos.join(' | ')}`);
      console.log('-'.repeat(100));
    }
    
    console.log(`\n📊 RESUMO:`);
    console.log(`   Total de CNPJs duplicados: ${duplicados.length}`);
    console.log(`   Total de registros duplicados (excluindo originais): ${totalDuplicados}`);
    console.log(`   Total de registros que podem ser removidos: ${totalDuplicados}`);
    
    // Salvar relatório em arquivo
    const fs = require('fs');
    const path = require('path');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const reportPath = path.join(
      process.cwd(),
      '..',
      '..',
      '..',
      'Desktop',
      `clientes-duplicados-${timestamp}.txt`
    );
    
    const reportContent = [
      '='.repeat(100),
      'RELATÓRIO DE CLIENTES DUPLICADOS',
      '='.repeat(100),
      `Data: ${new Date().toLocaleString('pt-BR')}`,
      `Total de CNPJs duplicados: ${duplicados.length}`,
      `Total de registros duplicados: ${totalDuplicados}`,
      '='.repeat(100),
      '',
      ...duplicados.map((dup, index) => {
        const ids = (dup.ids as string).split(',');
        const razoes = (dup.razoes_sociais as string).split(' | ');
        const codigos = (dup.codigos_sci as string).split(' | ');
        const quantidade = parseInt(dup.quantidade);
        
        return [
          `${index + 1}. CNPJ: ${dup.cnpj_limpo}`,
          `   Quantidade: ${quantidade}`,
          `   IDs: ${ids.join(', ')}`,
          `   Razões Sociais:`,
          ...razoes.map((r, i) => `     ${i + 1}. ${r}`),
          `   Códigos SCI:`,
          ...codigos.map((c, i) => `     ${i + 1}. ${c === 'NULL' ? '(vazio)' : c}`),
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
    console.error('❌ Erro ao verificar duplicados:', error);
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



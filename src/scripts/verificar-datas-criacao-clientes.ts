/**
 * Script para verificar as datas de criação dos clientes
 */

// Carregar variáveis de ambiente
import * as dotenv from 'dotenv';
dotenv.config();

import { getConnection } from '../config/mysql';

async function main() {
  console.log('🔍 Verificando datas de criação dos clientes...\n');
  
  const connection = await getConnection();
  
  try {
    // Buscar estatísticas de criação
    const [stats] = await connection.execute(`
      SELECT 
        DATE(created_at) as data_criacao,
        COUNT(*) as quantidade
      FROM clientes
      GROUP BY DATE(created_at)
      ORDER BY data_criacao DESC
      LIMIT 20
    `);
    
    const estatisticas = stats as any[];
    
    console.log('📊 ÚLTIMAS 20 DATAS DE CRIAÇÃO:\n');
    console.log('Data'.padEnd(20) + ' | Quantidade');
    console.log('-'.repeat(40));
    
    estatisticas.forEach(stat => {
      console.log(`${stat.data_criacao || 'N/A'}`.padEnd(20) + ` | ${stat.quantidade}`);
    });
    
    // Buscar registros criados a partir de 12/01/2026
    const [recentes] = await connection.execute(`
      SELECT 
        COUNT(*) as total,
        MIN(created_at) as mais_antigo,
        MAX(created_at) as mais_recente
      FROM clientes
      WHERE created_at >= '2026-01-12 00:00:00'
    `);
    
    const infoRecentes = (recentes as any[])[0];
    
    console.log('\n📅 REGISTROS CRIADOS A PARTIR DE 12/01/2026:');
    console.log(`   Total: ${infoRecentes.total || 0}`);
    if (infoRecentes.mais_antigo) {
      console.log(`   Mais antigo: ${infoRecentes.mais_antigo}`);
    }
    if (infoRecentes.mais_recente) {
      console.log(`   Mais recente: ${infoRecentes.mais_recente}`);
    }
    
    // Buscar alguns exemplos de registros recentes
    const [exemplos] = await connection.execute(`
      SELECT 
        id,
        razao_social,
        cnpj_limpo,
        created_at
      FROM clientes
      WHERE created_at >= '2026-01-12 00:00:00'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    const exemplosRecentes = exemplos as any[];
    
    if (exemplosRecentes.length > 0) {
      console.log('\n📋 EXEMPLOS DE REGISTROS RECENTES (últimos 10):\n');
      exemplosRecentes.forEach((exemplo, index) => {
        console.log(`${index + 1}. ID: ${exemplo.id}`);
        console.log(`   Razão Social: ${exemplo.razao_social || 'N/A'}`);
        console.log(`   CNPJ: ${exemplo.cnpj_limpo || 'N/A'}`);
        console.log(`   Criado em: ${exemplo.created_at || 'N/A'}`);
        console.log('');
      });
    }
    
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



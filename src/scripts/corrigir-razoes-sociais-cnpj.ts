/**
 * Script para corrigir razões sociais que contêm CNPJs incorretos
 * Remove o CNPJ do final da razão social
 */

// Carregar variáveis de ambiente
import * as dotenv from 'dotenv';
dotenv.config();

import { getConnection } from '../config/mysql';

async function main() {
  console.log('🔧 Corrigindo razões sociais com CNPJs incorretos...\n');
  
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
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
      console.log('✅ Nenhum cliente com problema encontrado!');
      await connection.commit();
      return;
    }
    
    console.log(`⚠️  Encontrados ${clientesComProblema.length} cliente(s) para corrigir\n`);
    
    let corrigidos = 0;
    const erros: Array<{ id: string; erro: string }> = [];
    
    for (const cliente of clientesComProblema) {
      try {
        // Remover CNPJ do final da razão social
        const razaoSocialCorrigida = cliente.razao_social.replace(/\s+\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, '').trim();
        
        if (razaoSocialCorrigida === cliente.razao_social) {
          // Não houve mudança, pular
          continue;
        }
        
        // Atualizar no banco
        await connection.execute(
          `UPDATE \`clientes\` 
           SET \`razao_social\` = ?, \`updated_at\` = NOW() 
           WHERE \`id\` = ?`,
          [razaoSocialCorrigida, cliente.id]
        );
        
        corrigidos++;
        
        if (corrigidos % 10 === 0) {
          console.log(`  Corrigidos: ${corrigidos}/${clientesComProblema.length}`);
        }
      } catch (error: any) {
        erros.push({
          id: cliente.id,
          erro: error.message || 'Erro desconhecido',
        });
      }
    }
    
    await connection.commit();
    
    console.log(`\n✅ Correção concluída!`);
    console.log(`   Clientes corrigidos: ${corrigidos}`);
    console.log(`   Erros: ${erros.length}`);
    
    if (erros.length > 0) {
      console.log(`\n❌ Erros encontrados:`);
      erros.forEach((erro, index) => {
        console.log(`  ${index + 1}. ID ${erro.id}: ${erro.erro}`);
      });
    }
    
  } catch (error: any) {
    await connection.rollback();
    console.error('❌ Erro durante a correção:', error);
    throw error;
  } finally {
    connection.release();
  }
}

main()
  .then(() => {
    console.log('\n✅ Script executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar script:', error);
    process.exit(1);
  });



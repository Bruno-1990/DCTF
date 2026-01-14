/**
 * Script para remover todos os registros de clientes adicionados após 12/01/2026
 * Remove apenas registros criados a partir de 13/01/2026
 */

// Carregar variáveis de ambiente
import * as dotenv from 'dotenv';
dotenv.config();

import { getConnection } from '../config/mysql';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🗑️  Removendo clientes adicionados a partir de 13/01/2026...\n');
  
  const dataLimite = '2026-01-11 23:59:59';
  const dataInicio = '2026-01-12 00:00:00';
  
  console.log(`📅 Data limite: até ${dataLimite}`);
  console.log(`📅 Removendo registros criados a partir de: ${dataInicio} (incluindo 12/01/2026)\n`);
  
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Buscar todos os registros criados a partir de 13/01/2026
    const [rows] = await connection.execute(`
      SELECT 
        id,
        razao_social,
        cnpj_limpo,
        codigo_sci,
        created_at
      FROM clientes
      WHERE created_at >= ?
      ORDER BY created_at
    `, [dataInicio]);
    
    const registrosRecentes = rows as any[];
    
    if (registrosRecentes.length === 0) {
      console.log('✅ Nenhum registro criado a partir de 12/01/2026 encontrado!');
      await connection.commit();
      return;
    }
    
    console.log(`⚠️  Encontrados ${registrosRecentes.length} registro(s) criado(s) a partir de 12/01/2026\n`);
    
    let removidos = 0;
    const naoRemovidos: Array<{ id: string; razao_social: string; created_at: string; motivo: string }> = [];
    const removidosComSucesso: Array<{ id: string; razao_social: string; cnpj: string; created_at: string }> = [];
    
    console.log('Verificando dependências e removendo registros...\n');
    
    for (let i = 0; i < registrosRecentes.length; i++) {
      const registro = registrosRecentes[i];
      
      try {
        // Verificar se há dependências DCTF
        const [dependenciasDCTF] = await connection.execute(
          `SELECT COUNT(*) as count FROM dctf_declaracoes WHERE cliente_id = ?`,
          [registro.id]
        );
        
        const countDCTF = (dependenciasDCTF as any[])[0]?.count || 0;
        
        if (countDCTF > 0) {
          naoRemovidos.push({
            id: registro.id,
            razao_social: registro.razao_social || 'N/A',
            created_at: registro.created_at || 'N/A',
            motivo: `Possui ${countDCTF} declaração(ões) DCTF vinculada(s)`,
          });
          console.log(`⚠️  ID ${registro.id}: Não removido - ${countDCTF} dependência(s) DCTF`);
          continue;
        }
        
        // Remover dependências em clientes_socios primeiro
        const [dependenciasSocios] = await connection.execute(
          `SELECT COUNT(*) as count FROM clientes_socios WHERE cliente_id = ?`,
          [registro.id]
        );
        
        const countSocios = (dependenciasSocios as any[])[0]?.count || 0;
        
        if (countSocios > 0) {
          // Remover sócios primeiro
          await connection.execute(
            `DELETE FROM \`clientes_socios\` WHERE cliente_id = ?`,
            [registro.id]
          );
          console.log(`  Removidos ${countSocios} sócio(s) do cliente ${registro.id}`);
        }
        
        // Verificar outras dependências possíveis
        // (adicionar outras tabelas conforme necessário)
        
        // Remover o registro
        await connection.execute(
          `DELETE FROM \`clientes\` WHERE id = ?`,
          [registro.id]
        );
        
        removidos++;
        removidosComSucesso.push({
          id: registro.id,
          razao_social: registro.razao_social || 'N/A',
          cnpj: registro.cnpj_limpo || 'N/A',
          created_at: registro.created_at || 'N/A',
        });
        
        if (removidos % 10 === 0) {
          console.log(`  Removidos: ${removidos}/${registrosRecentes.length}`);
        }
      } catch (error: any) {
        naoRemovidos.push({
          id: registro.id,
          razao_social: registro.razao_social || 'N/A',
          created_at: registro.created_at || 'N/A',
          motivo: `Erro: ${error.message || 'Erro desconhecido'}`,
        });
        console.error(`❌ Erro ao remover ID ${registro.id}:`, error.message);
      }
    }
    
    await connection.commit();
    
    console.log(`\n✅ Remoção concluída!`);
    console.log(`   Registros removidos: ${removidos}`);
    console.log(`   Registros não removidos: ${naoRemovidos.length}`);
    
    if (naoRemovidos.length > 0) {
      console.log(`\n⚠️  Registros não removidos (têm dependências):`);
      naoRemovidos.slice(0, 10).forEach((r, index) => {
        console.log(`  ${index + 1}. ID ${r.id}: ${r.motivo}`);
      });
      if (naoRemovidos.length > 10) {
        console.log(`  ... e mais ${naoRemovidos.length - 10} registros`);
      }
    }
    
    // Salvar relatório
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const reportPath = path.join(
      process.cwd(),
      '..',
      '..',
      '..',
      'Desktop',
      `remocao-clientes-recentes-${timestamp}.txt`
    );
    
    const reportContent = [
      '='.repeat(100),
      'RELATÓRIO DE REMOÇÃO DE CLIENTES RECENTES',
      '='.repeat(100),
      `Data: ${new Date().toLocaleString('pt-BR')}`,
      `Data limite: até ${dataLimite}`,
      `Removendo registros criados a partir de: ${dataInicio}`,
      `Total encontrado: ${registrosRecentes.length}`,
      `Registros removidos: ${removidos}`,
      `Registros não removidos: ${naoRemovidos.length}`,
      '='.repeat(100),
      '',
      'REGISTROS REMOVIDOS:',
      '='.repeat(100),
      '',
      ...removidosComSucesso.map((r, index) => {
        return [
          `${index + 1}. ID: ${r.id}`,
          `   Razão Social: ${r.razao_social}`,
          `   CNPJ: ${r.cnpj}`,
          `   Criado em: ${r.created_at}`,
          '',
        ].join('\n');
      }),
      '',
      'REGISTROS NÃO REMOVIDOS (têm dependências):',
      '='.repeat(100),
      '',
      ...naoRemovidos.map((r, index) => {
        return [
          `${index + 1}. ID: ${r.id}`,
          `   Razão Social: ${r.razao_social}`,
          `   Criado em: ${r.created_at}`,
          `   Motivo: ${r.motivo}`,
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
    await connection.rollback();
    console.error('❌ Erro:', error);
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


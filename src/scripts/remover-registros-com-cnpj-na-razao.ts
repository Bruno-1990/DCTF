/**
 * Script para remover todos os registros que contêm CNPJ na razão social
 */

// Carregar variáveis de ambiente
import * as dotenv from 'dotenv';
dotenv.config();

import { getConnection } from '../config/mysql';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🗑️  Removendo registros com CNPJ na razão social...\n');
  
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Buscar todos os registros cuja razão social contém um CNPJ formatado
    const [rows] = await connection.execute(`
      SELECT 
        id,
        razao_social,
        cnpj_limpo,
        codigo_sci,
        created_at
      FROM clientes
      WHERE razao_social REGEXP '[0-9]{2}\\.[0-9]{3}\\.[0-9]{3}/[0-9]{4}-[0-9]{2}'
      ORDER BY created_at
    `);
    
    const registrosComProblema = rows as any[];
    
    if (registrosComProblema.length === 0) {
      console.log('✅ Nenhum registro com CNPJ na razão social encontrado!');
      await connection.commit();
      return;
    }
    
    console.log(`⚠️  Encontrados ${registrosComProblema.length} registro(s) com CNPJ na razão social\n`);
    
    let removidos = 0;
    const naoRemovidos: Array<{ id: string; razao_social: string; motivo: string }> = [];
    const removidosComSucesso: Array<{ id: string; razao_social: string; cnpj: string }> = [];
    
    console.log('Verificando dependências e removendo registros...\n');
    
    for (let i = 0; i < registrosComProblema.length; i++) {
      const registro = registrosComProblema[i];
      
      try {
        // Verificar se há dependências
        const [dependenciasDCTF] = await connection.execute(
          `SELECT COUNT(*) as count FROM dctf_declaracoes WHERE cliente_id = ?`,
          [registro.id]
        );
        
        const countDCTF = (dependenciasDCTF as any[])[0]?.count || 0;
        
        if (countDCTF > 0) {
          naoRemovidos.push({
            id: registro.id,
            razao_social: registro.razao_social,
            motivo: `Possui ${countDCTF} declaração(ões) DCTF vinculada(s)`,
          });
          console.log(`⚠️  ID ${registro.id}: Não removido - ${countDCTF} dependência(s) DCTF`);
          continue;
        }
        
        // Verificar outras dependências possíveis
        const [dependenciasSitf] = await connection.execute(
          `SELECT COUNT(*) as count FROM sitf_downloads WHERE cnpj = ?`,
          [registro.cnpj_limpo]
        );
        
        const countSitf = (dependenciasSitf as any[])[0]?.count || 0;
        
        if (countSitf > 0) {
          // SITF não é bloqueante, mas vamos avisar
          console.log(`ℹ️  ID ${registro.id}: Possui ${countSitf} registro(s) SITF (não bloqueante)`);
        }
        
        // Remover o registro
        await connection.execute(
          `DELETE FROM \`clientes\` WHERE id = ?`,
          [registro.id]
        );
        
        removidos++;
        removidosComSucesso.push({
          id: registro.id,
          razao_social: registro.razao_social,
          cnpj: registro.cnpj_limpo || 'N/A',
        });
        
        if (removidos % 10 === 0) {
          console.log(`  Removidos: ${removidos}/${registrosComProblema.length}`);
        }
      } catch (error: any) {
        naoRemovidos.push({
          id: registro.id,
          razao_social: registro.razao_social,
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
      `remocao-cnpj-na-razao-${timestamp}.txt`
    );
    
    const reportContent = [
      '='.repeat(100),
      'RELATÓRIO DE REMOÇÃO DE REGISTROS COM CNPJ NA RAZÃO SOCIAL',
      '='.repeat(100),
      `Data: ${new Date().toLocaleString('pt-BR')}`,
      `Total encontrado: ${registrosComProblema.length}`,
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



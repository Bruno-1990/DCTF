/**
 * Script para verificar downloads recentes de Situação Fiscal no MySQL
 */

// Carregar variáveis de ambiente
import dotenv from 'dotenv';
dotenv.config();

import { executeQuery } from '../src/config/mysql';

async function verificarDownloadsRecentes() {
  try {
    console.log('🔍 Buscando downloads recentes de Situação Fiscal...\n');

    // Query para buscar os 20 downloads mais recentes
    const query = `
      SELECT 
        id,
        cnpj,
        file_url,
        created_at,
        CASE 
          WHEN extracted_data IS NOT NULL THEN 'Sim'
          ELSE 'Não'
        END as tem_dados_extraidos,
        CASE 
          WHEN pdf_base64 IS NOT NULL THEN 'Sim'
          ELSE 'Não'
        END as tem_pdf_base64,
        LENGTH(extracted_data) as tamanho_extracted_data,
        LENGTH(pdf_base64) as tamanho_pdf_base64
      FROM sitf_downloads
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const resultados = await executeQuery(query);

    console.log(`✅ Encontrados ${resultados.length} registros:\n`);

    if (resultados.length === 0) {
      console.log('⚠️  Nenhum registro encontrado na tabela sitf_downloads');
      return;
    }

    // Exibir resultados formatados
    resultados.forEach((row: any, index: number) => {
      console.log(`\n📄 Registro ${index + 1}:`);
      console.log(`   ID: ${row.id}`);
      console.log(`   CNPJ: ${row.cnpj}`);
      console.log(`   Data: ${new Date(row.created_at).toLocaleString('pt-BR')}`);
      console.log(`   File URL: ${row.file_url || 'N/A'}`);
      console.log(`   Tem dados extraídos: ${row.tem_dados_extraidos}`);
      console.log(`   Tem PDF base64: ${row.tem_pdf_base64}`);
      if (row.tamanho_extracted_data) {
        console.log(`   Tamanho extracted_data: ${(row.tamanho_extracted_data / 1024).toFixed(2)} KB`);
      }
      if (row.tamanho_pdf_base64) {
        console.log(`   Tamanho PDF base64: ${(row.tamanho_pdf_base64 / 1024).toFixed(2)} KB`);
      }
    });

    // Estatísticas gerais
    console.log('\n\n📊 Estatísticas Gerais:');
    
    const statsQuery = `
      SELECT 
        COUNT(*) as total_registros,
        COUNT(DISTINCT cnpj) as cnpjs_unicos,
        COUNT(CASE WHEN extracted_data IS NOT NULL THEN 1 END) as com_dados_extraidos,
        COUNT(CASE WHEN pdf_base64 IS NOT NULL THEN 1 END) as com_pdf_base64,
        MIN(created_at) as primeiro_registro,
        MAX(created_at) as ultimo_registro
      FROM sitf_downloads
    `;

    const stats = await executeQuery(statsQuery);
    
    if (stats && stats.length > 0) {
      const s = stats[0] as any;
      console.log(`   Total de registros: ${s.total_registros}`);
      console.log(`   CNPJs únicos: ${s.cnpjs_unicos}`);
      console.log(`   Com dados extraídos: ${s.com_dados_extraidos}`);
      console.log(`   Com PDF base64: ${s.com_pdf_base64}`);
      console.log(`   Primeiro registro: ${s.primeiro_registro ? new Date(s.primeiro_registro).toLocaleString('pt-BR') : 'N/A'}`);
      console.log(`   Último registro: ${s.ultimo_registro ? new Date(s.ultimo_registro).toLocaleString('pt-BR') : 'N/A'}`);
    }

    // Verificar estrutura de extracted_data de um registro recente
    console.log('\n\n🔬 Análise de extracted_data (primeiro registro):');
    const sampleQuery = `
      SELECT 
        id,
        cnpj,
        created_at,
        extracted_data
      FROM sitf_downloads
      WHERE extracted_data IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const sample = await executeQuery(sampleQuery);
    
    if (sample && sample.length > 0) {
      const s = sample[0] as any;
      console.log(`   ID: ${s.id}`);
      console.log(`   CNPJ: ${s.cnpj}`);
      console.log(`   Data: ${new Date(s.created_at).toLocaleString('pt-BR')}`);
      
      try {
        const extractedData = typeof s.extracted_data === 'string' 
          ? JSON.parse(s.extracted_data) 
          : s.extracted_data;
        
        console.log(`   Tipo: ${typeof extractedData}`);
        if (typeof extractedData === 'object' && extractedData !== null) {
          console.log(`   Chaves principais: ${Object.keys(extractedData).join(', ')}`);
          if (extractedData.debitos) {
            console.log(`   Débitos: ${Array.isArray(extractedData.debitos) ? extractedData.debitos.length : 'N/A'}`);
          }
          if (extractedData.pendencias) {
            console.log(`   Pendências: ${Array.isArray(extractedData.pendencias) ? extractedData.pendencias.length : 'N/A'}`);
          }
          if (extractedData.socios) {
            console.log(`   Sócios: ${Array.isArray(extractedData.socios) ? extractedData.socios.length : 'N/A'}`);
          }
        }
      } catch (e) {
        console.log(`   ⚠️  Erro ao parsear extracted_data: ${e}`);
      }
    } else {
      console.log('   ⚠️  Nenhum registro com extracted_data encontrado');
    }

  } catch (error: any) {
    console.error('❌ Erro ao buscar downloads:', error);
    console.error('   Mensagem:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

// Executar
verificarDownloadsRecentes()
  .then(() => {
    console.log('\n✅ Verificação concluída');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });


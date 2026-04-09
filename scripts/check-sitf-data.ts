/**
 * Script para verificar dados na tabela de situação fiscal
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { executeQuery } from './src/config/mysql';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSitfData() {
  console.log('🔍 Verificando dados de situação fiscal...\n');

  try {
    // 1. Verificar sitf_extracted_data (MySQL)
    console.log('📊 Verificando sitf_extracted_data (MySQL)...');
    const extractedDataQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT cnpj) as cnpjs_unicos,
        COUNT(DISTINCT sitf_download_id) as downloads_unicos,
        MIN(created_at) as primeiro_registro,
        MAX(created_at) as ultimo_registro
      FROM sitf_extracted_data
    `;
    
    const extractedDataResult = await executeQuery(extractedDataQuery);
    console.log('Resultado:', extractedDataResult);
    
    // Buscar alguns registros de exemplo
    const sampleQuery = `
      SELECT 
        id,
        cnpj,
        sitf_download_id,
        certidao_tipo,
        certidao_data_validade,
        created_at
      FROM sitf_extracted_data
      ORDER BY created_at DESC
      LIMIT 5
    `;
    
    const sampleResult = await executeQuery(sampleQuery);
    console.log('\n📋 Últimos 5 registros:');
    console.log(JSON.stringify(sampleResult, null, 2));

    // 2. Verificar sitf_downloads (Supabase)
    console.log('\n\n📊 Verificando sitf_downloads (Supabase)...');
    const { data: downloads, error: downloadsError } = await supabase
      .from('sitf_downloads')
      .select('id, cnpj, created_at, status, has_extracted_data')
      .order('created_at', { ascending: false })
      .limit(10);

    if (downloadsError) {
      console.error('❌ Erro ao buscar sitf_downloads:', downloadsError);
    } else {
      console.log(`Total de registros encontrados: ${downloads?.length || 0}`);
      console.log('\n📋 Últimos 10 registros:');
      downloads?.forEach((d, i) => {
        console.log(`${i + 1}. ID: ${d.id}, CNPJ: ${d.cnpj}, Status: ${d.status}, Tem dados extraídos: ${d.has_extracted_data || false}, Criado em: ${d.created_at}`);
      });
    }

    // 3. Verificar todos os registros recentes do Supabase
    console.log('\n\n📊 Verificando todos os registros recentes do Supabase...');
    const { data: allDownloads, error: allError } = await supabase
      .from('sitf_downloads')
      .select('id, cnpj, extracted_data, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (allError) {
      console.error('❌ Erro ao buscar registros:', allError);
    } else {
      console.log(`Total de registros encontrados: ${allDownloads?.length || 0}`);
      allDownloads?.forEach((d, i) => {
        const extractedData = typeof d.extracted_data === 'string' 
          ? JSON.parse(d.extracted_data) 
          : d.extracted_data;
        const textLength = extractedData?.text?.length || 0;
        const debitosCount = extractedData?.debitos?.length || 0;
        console.log(`${i + 1}. ID: ${d.id}, CNPJ: ${d.cnpj}, Texto: ${textLength} chars, Débitos: ${debitosCount}, Criado: ${d.created_at}`);
      });
      
      // Verificar o registro específico se existir
      const targetId = '1b65f2c3-0cb1-4947-9eef-71569d64642f';
      const recentDownload = allDownloads?.find(d => d.id === targetId);
      
      if (recentDownload) {
        console.log(`\n\n📊 Registro específico encontrado (ID: ${targetId}):`);
        const extractedData = typeof recentDownload.extracted_data === 'string' 
          ? JSON.parse(recentDownload.extracted_data) 
          : recentDownload.extracted_data;
        const debitosCount = extractedData?.debitos?.length || 0;
        const pendenciasCount = extractedData?.pendencias?.length || 0;
        const textLength = extractedData?.text?.length || 0;
        const numPages = extractedData?.numPages || 0;
        
        console.log(`Texto extraído: ${textLength} caracteres`);
        console.log(`Páginas: ${numPages}`);
        console.log(`Débitos: ${debitosCount}`);
        console.log(`Pendências: ${pendenciasCount}`);
        
        if (textLength > 0) {
          const text = extractedData.text || '';
          const temPendencia = text.includes('Pendência') || text.includes('pendência');
          const temDebito = text.includes('Débito') || text.includes('débito');
          const temSIEF = text.includes('SIEF');
          console.log(`\nAnálise do texto:`);
          console.log(`   Contém "Pendência": ${temPendencia}`);
          console.log(`   Contém "Débito": ${temDebito}`);
          console.log(`   Contém "SIEF": ${temSIEF}`);
          
          if (temPendencia || temDebito) {
            const pendenciaIndex = text.search(/Pendência/i);
            const debitoIndex = text.search(/Débito/i);
            if (pendenciaIndex !== -1) {
              console.log(`\n   Primeira ocorrência de "Pendência" (posição ${pendenciaIndex}):`);
              console.log(`   ${text.substring(pendenciaIndex, pendenciaIndex + 300)}`);
            }
            if (debitoIndex !== -1) {
              console.log(`\n   Primeira ocorrência de "Débito" (posição ${debitoIndex}):`);
              console.log(`   ${text.substring(debitoIndex, debitoIndex + 300)}`);
            }
          }
        }
      } else {
        console.log(`\n⚠️  Registro com ID ${targetId} não encontrado no Supabase.`);
      }
    }

    // 4. Verificar se há extracted_data com débitos (todos os registros)
    console.log('\n\n📊 Verificando extracted_data com débitos (todos os registros)...');
    const { data: downloadsWithDebitos, error: debitosError } = await supabase
      .from('sitf_downloads')
      .select('id, cnpj, extracted_data, created_at')
      .not('extracted_data', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);

    if (debitosError) {
      console.error('❌ Erro ao buscar dados com débitos:', debitosError);
    } else {
      console.log(`Registros com extracted_data: ${downloadsWithDebitos?.length || 0}`);
      downloadsWithDebitos?.forEach((d, i) => {
        const extractedData = typeof d.extracted_data === 'string' 
          ? JSON.parse(d.extracted_data) 
          : d.extracted_data;
        const debitosCount = extractedData?.debitos?.length || 0;
        const pendenciasCount = extractedData?.pendencias?.length || 0;
        const textLength = extractedData?.text?.length || 0;
        const numPages = extractedData?.numPages || 0;
        console.log(`\n${i + 1}. ID: ${d.id}`);
        console.log(`   CNPJ: ${d.cnpj}`);
        console.log(`   Criado em: ${d.created_at}`);
        console.log(`   Texto extraído: ${textLength} caracteres`);
        console.log(`   Páginas: ${numPages}`);
        console.log(`   Débitos: ${debitosCount}`);
        console.log(`   Pendências: ${pendenciasCount}`);
        
        // Verificar se tem as seções no texto
        if (textLength > 0) {
          const text = extractedData.text || '';
          const temPendencia = text.includes('Pendência') || text.includes('pendência');
          const temDebito = text.includes('Débito') || text.includes('débito');
          const temSIEF = text.includes('SIEF');
          console.log(`   Contém "Pendência": ${temPendencia}`);
          console.log(`   Contém "Débito": ${temDebito}`);
          console.log(`   Contém "SIEF": ${temSIEF}`);
          
          // Mostrar preview do texto onde pode estar a seção
          if (temPendencia || temDebito) {
            const pendenciaIndex = text.search(/Pendência/i);
            const debitoIndex = text.search(/Débito/i);
            if (pendenciaIndex !== -1) {
              console.log(`   Preview "Pendência" (posição ${pendenciaIndex}):`, text.substring(pendenciaIndex, pendenciaIndex + 200));
            }
            if (debitoIndex !== -1) {
              console.log(`   Preview "Débito" (posição ${debitoIndex}):`, text.substring(debitoIndex, debitoIndex + 200));
            }
          }
        }
        
        if (debitosCount > 0) {
          console.log(`   Primeiro débito:`, JSON.stringify(extractedData.debitos[0], null, 2));
        }
      });
    }

    // 4. Verificar sitf_protocols
    console.log('\n\n📊 Verificando sitf_protocols (Supabase)...');
    const { data: protocols, error: protocolsError } = await supabase
      .from('sitf_protocols')
      .select('cnpj, protocolo, status, expires_at, next_eligible_at, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (protocolsError) {
      console.error('❌ Erro ao buscar protocols:', protocolsError);
    } else {
      console.log(`Total de protocolos encontrados: ${protocols?.length || 0}`);
      console.log('\n📋 Últimos 5 protocolos:');
      protocols?.forEach((p, i) => {
        console.log(`${i + 1}. CNPJ: ${p.cnpj}, Status: ${p.status}, Protocolo: ${p.protocolo ? 'Sim' : 'Não'}, Expira em: ${p.expires_at || 'N/A'}`);
      });
    }

  } catch (error: any) {
    console.error('❌ Erro ao verificar dados:', error);
  }
}

// Executar
checkSitfData()
  .then(() => {
    console.log('\n✅ Verificação concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });


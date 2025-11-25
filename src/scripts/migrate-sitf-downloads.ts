/**
 * Script para migrar dados de sitf_downloads do Supabase para MySQL
 * 
 * Execute: npx ts-node src/scripts/migrate-sitf-downloads.ts
 */

import 'dotenv/config';
import { mysqlPool } from '../config/mysql';

// ID do projeto Supabase
const SUPABASE_PROJECT_ID = 'utyelfwvrrbfpcyzzxgu';

interface SupabaseSITFDownload {
  id: string;
  cnpj: string;
  file_url?: string | null;
  created_at: string | Date;
  extracted_data?: any;
  pdf_base64?: string | null;
}

// Função auxiliar para converter datas
function parseDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

async function migrateSITFDownloads() {
  try {
    console.log('🚀 Iniciando migração de sitf_downloads do Supabase para MySQL...\n');
    console.log(`📡 Projeto Supabase: ${SUPABASE_PROJECT_ID}\n`);

    // Verificar variáveis de ambiente
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY devem estar configurados no .env');
    }

    // Conectar ao MySQL
    console.log('🔌 Conectando ao MySQL...');
    const connection = await mysqlPool.getConnection();

    try {
      // Verificar quantos registros já existem no MySQL
      const [existingCount] = await connection.query(
        'SELECT COUNT(*) as total FROM sitf_downloads'
      ) as any[];
      const existing = existingCount[0]?.total || 0;
      console.log(`📊 Registros existentes no MySQL: ${existing}\n`);

      // Buscar todos os dados do Supabase
      console.log('📥 Buscando dados do Supabase...');
      const response = await fetch(
        `${supabaseUrl}/rest/v1/sitf_downloads?select=*&order=created_at.asc`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro ao buscar dados do Supabase: ${response.status} - ${errorText}`);
      }

      const supabaseData = (await response.json()) as SupabaseSITFDownload[];
      console.log(`✅ Encontrados ${supabaseData.length} registros no Supabase\n`);

      if (supabaseData.length === 0) {
        console.log('⚠️  Nenhum dado para migrar');
        process.exit(0);
      }

      let totalMigrated = 0;
      let totalSkipped = 0;
      let totalErrors = 0;

      console.log(`📦 Processando ${supabaseData.length} registros...\n`);

      // Processar cada registro
      for (const item of supabaseData) {
        try {
          // Verificar se já existe pelo ID
          const [existingRows] = await connection.query(
            'SELECT id FROM sitf_downloads WHERE id = ?',
            [item.id]
          ) as any[];

          if (existingRows.length > 0) {
            totalSkipped++;
            continue;
          }

          // Preparar dados para inserção
          const downloadData = {
            id: item.id,
            cnpj: item.cnpj,
            file_url: item.file_url,
            created_at: parseDate(item.created_at) || new Date(),
            extracted_data: item.extracted_data ? JSON.stringify(item.extracted_data) : null,
            pdf_base64: item.pdf_base64,
          };

          // Inserir no MySQL
          await connection.query(
            `INSERT INTO sitf_downloads (
              id, cnpj, file_url, created_at, extracted_data, pdf_base64
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              downloadData.id,
              downloadData.cnpj,
              downloadData.file_url,
              downloadData.created_at,
              downloadData.extracted_data,
              downloadData.pdf_base64,
            ]
          );

          totalMigrated++;
        } catch (error: any) {
          totalErrors++;
          console.error(`   ❌ Erro ao inserir registro ${item.id}:`, error.message);
        }
      }

      console.log('\n✅ Migração concluída!');
      console.log(`📊 Estatísticas:`);
      console.log(`   ✅ Inseridos: ${totalMigrated}`);
      console.log(`   ⏭️  Pulados (já existentes): ${totalSkipped}`);
      console.log(`   ❌ Erros: ${totalErrors}`);

      // Verificar total final
      const [finalCount] = await connection.query(
        'SELECT COUNT(*) as total FROM sitf_downloads'
      ) as any[];
      console.log(`\n📈 Total de registros no MySQL: ${finalCount[0]?.total || 0}`);

    } finally {
      connection.release();
    }

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Erro na migração:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

migrateSITFDownloads();






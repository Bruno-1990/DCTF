/**
 * Script para executar a migration da tabela sitf_extracted_data
 * Execute: npx ts-node src/scripts/run-sitf-migration.ts
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { executeQuery } from '../config/mysql';

async function runMigration() {
  try {
    console.log('🚀 Iniciando migration: sitf_extracted_data...\n');
    
    // Ler o arquivo SQL
    const sqlPath = join(__dirname, '../../docs/migrations/mysql/006_create_sitf_extracted_data.sql');
    const sql = readFileSync(sqlPath, 'utf-8');
    
    // Executar o SQL (pode ter múltiplas queries)
    // Remover comentários de linha e blocos
    const sqlWithoutComments = sql
      .replace(/--.*$/gm, '') // Remove comentários de linha
      .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove comentários de bloco
    
    const queries = sqlWithoutComments
      .split(';')
      .map(q => q.trim())
      .filter(q => q.length > 0 && !q.toLowerCase().startsWith('use'));
    
    console.log(`📝 Executando ${queries.length} query(s)...\n`);
    
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      if (query.trim().length === 0) continue;
      
      try {
        console.log(`[${i + 1}/${queries.length}] Executando query...`);
        await executeQuery(query);
        console.log(`✅ Query ${i + 1} executada com sucesso\n`);
      } catch (error: any) {
        // Se a tabela já existe, não é um erro crítico
        if (error.message?.includes('already exists') || error.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log(`⚠️  Tabela já existe, pulando criação...\n`);
        } else {
          console.error(`❌ Erro ao executar query ${i + 1}:`, error.message);
          throw error;
        }
      }
    }
    
    console.log('✅ Migration concluída com sucesso!');
    console.log('\n📊 Verificando se a tabela foi criada...');
    
    // Verificar se a tabela foi criada
    const checkQuery = `
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name = 'sitf_extracted_data'
    `;
    
    const result: any = await executeQuery(checkQuery);
    
    if (result && Array.isArray(result) && result.length > 0) {
      const firstResult = result[0];
      if (firstResult && firstResult.count > 0) {
        console.log('✅ Tabela sitf_extracted_data criada com sucesso!');
        
        // Mostrar estrutura da tabela
        const structureQuery = `
          DESCRIBE sitf_extracted_data
        `;
        const structure: any = await executeQuery(structureQuery);
        
        if (structure && Array.isArray(structure) && structure.length > 0) {
          console.log('\n📋 Estrutura da tabela:');
          console.table(structure.map((col: any) => ({
            Campo: col.Field,
            Tipo: col.Type,
            Null: col.Null,
            Chave: col.Key,
          })));
        }
      } else {
        console.log('⚠️  Tabela não encontrada após a migration');
      }
    } else {
      console.log('⚠️  Tabela não encontrada após a migration');
    }
    
  } catch (error: any) {
    console.error('❌ Erro ao executar migration:', error);
    process.exit(1);
  }
}

// Executar migration
runMigration()
  .then(() => {
    console.log('\n✨ Processo concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Erro fatal:', error);
    process.exit(1);
  });


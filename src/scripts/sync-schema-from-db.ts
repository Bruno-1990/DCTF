/**
 * Script para sincronizar o schema do banco de dados com a documentação
 * Consulta o schema real do Supabase e atualiza os arquivos de documentação
 */

import { supabaseAdmin } from '../config/database';
import * as fs from 'fs';
import * as path from 'path';

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
}

interface TableInfo {
  table_name: string;
  columns: ColumnInfo[];
}

async function getTableSchema(tableName: string): Promise<ColumnInfo[]> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client não está configurado');
  }

  // Consultar informações das colunas usando SQL direto
  const query = `
    SELECT 
      column_name,
      data_type,
      is_nullable,
      column_default,
      character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = '${tableName}'
    ORDER BY ordinal_position;
  `;

  const { data, error } = await supabaseAdmin.rpc('exec_sql', { sql: query });

  if (error) {
    // Tentar método alternativo: buscar uma linha e inferir colunas
    console.warn(`Não foi possível consultar schema via RPC, tentando método alternativo para ${tableName}...`);
    
    const { data: sampleData, error: sampleError } = await supabaseAdmin
      .from(tableName)
      .select('*')
      .limit(1);

    if (sampleError) {
      console.error(`Erro ao buscar amostra de ${tableName}:`, sampleError);
      return [];
    }

    // Se não há dados, tentar buscar informações via query direta
    // Nota: Isso requer permissões especiais no Supabase
    return [];
  }

  return data as ColumnInfo[];
}

async function getAllTables(): Promise<string[]> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client não está configurado');
  }

  // Listar todas as tabelas do schema public
  const query = `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;

  // Como não temos acesso direto ao SQL, vamos tentar uma abordagem diferente
  // Tentar acessar tabelas conhecidas e ver quais existem
  const knownTables = [
    'clientes',
    'dctf_declaracoes',
    'dctf_dados',
    'analises',
    'flags',
    'relatorios',
    'upload_history',
    'dctf_codes',
    'dctf_receita_codes',
    'dctf_aliquotas',
    'receita_pagamentos',
  ];

  const existingTables: string[] = [];

  for (const table of knownTables) {
    try {
      const { error } = await supabaseAdmin
        .from(table)
        .select('*')
        .limit(0);

      if (!error || error.code === 'PGRST116') {
        // Tabela existe (mesmo que vazia)
        existingTables.push(table);
      }
    } catch (err) {
      // Tabela não existe ou erro de acesso
      console.warn(`Tabela ${table} não encontrada ou sem acesso`);
    }
  }

  return existingTables;
}

async function getTableColumnsDirect(tableName: string): Promise<ColumnInfo[]> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client não está configurado');
  }

  // Tentar buscar uma linha para inferir as colunas
  const { data, error } = await supabaseAdmin
    .from(tableName)
    .select('*')
    .limit(1);

  if (error) {
    console.error(`Erro ao buscar dados de ${tableName}:`, error);
    return [];
  }

  if (!data || data.length === 0) {
    // Tabela vazia, retornar colunas conhecidas do schema
    console.warn(`Tabela ${tableName} está vazia, usando schema conhecido`);
    return [];
  }

  // Inferir tipos das colunas a partir dos dados
  const columns: ColumnInfo[] = [];
  const firstRow = data[0];

  for (const [key, value] of Object.entries(firstRow)) {
    let dataType = 'unknown';
    let isNullable = 'YES';
    let maxLength: number | null = null;

    if (value === null) {
      isNullable = 'YES';
      dataType = 'unknown';
    } else if (typeof value === 'string') {
      dataType = 'character varying';
      maxLength = value.length > 255 ? null : value.length;
    } else if (typeof value === 'number') {
      dataType = Number.isInteger(value) ? 'integer' : 'numeric';
    } else if (typeof value === 'boolean') {
      dataType = 'boolean';
    } else if (value instanceof Date || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))) {
      dataType = 'timestamp with time zone';
    }

    columns.push({
      column_name: key,
      data_type: dataType,
      is_nullable: isNullable,
      column_default: null,
      character_maximum_length: maxLength,
    });
  }

  return columns;
}

function generateSchemaSQL(tables: TableInfo[]): string {
  let sql = `-- ============================================================================\n`;
  sql += `-- SCHEMA SINCRONIZADO DO BANCO DE DADOS REAL\n`;
  sql += `-- Gerado automaticamente em: ${new Date().toISOString()}\n`;
  sql += `-- ============================================================================\n\n`;

  for (const table of tables) {
    sql += `-- ============================================================================\n`;
    sql += `-- TABELA: ${table.table_name}\n`;
    sql += `-- ============================================================================\n`;
    sql += `CREATE TABLE IF NOT EXISTS ${table.table_name} (\n`;

    const columnDefs: string[] = [];
    for (const col of table.columns) {
      let def = `    ${col.column_name} `;

      // Mapear tipos
      switch (col.data_type) {
        case 'character varying':
          def += `VARCHAR(${col.character_maximum_length || 255})`;
          break;
        case 'text':
          def += 'TEXT';
          break;
        case 'integer':
          def += 'INTEGER';
          break;
        case 'bigint':
          def += 'BIGINT';
          break;
        case 'numeric':
        case 'decimal':
          def += 'DECIMAL(15,2)';
          break;
        case 'boolean':
          def += 'BOOLEAN';
          break;
        case 'timestamp with time zone':
          def += 'TIMESTAMP WITH TIME ZONE';
          break;
        case 'date':
          def += 'DATE';
          break;
        case 'uuid':
          def += 'UUID';
          break;
        default:
          def += col.data_type.toUpperCase();
      }

      if (col.is_nullable === 'NO') {
        def += ' NOT NULL';
      }

      if (col.column_default) {
        def += ` DEFAULT ${col.column_default}`;
      }

      columnDefs.push(def);
    }

    sql += columnDefs.join(',\n');
    sql += `\n);\n\n`;
  }

  return sql;
}

async function main() {
  console.log('🔄 Sincronizando schema do banco de dados...\n');

  if (!supabaseAdmin) {
    console.error('❌ Supabase admin client não está configurado');
    console.error('   Configure SUPABASE_SERVICE_ROLE_KEY no .env');
    process.exit(1);
  }

  try {
    // Buscar todas as tabelas
    console.log('📋 Buscando tabelas...');
    const tables = await getAllTables();
    console.log(`✅ Encontradas ${tables.length} tabelas:`, tables.join(', '));

    // Buscar schema de cada tabela
    const tableSchemas: TableInfo[] = [];
    for (const tableName of tables) {
      console.log(`\n🔍 Analisando tabela: ${tableName}...`);
      const columns = await getTableColumnsDirect(tableName);
      
      if (columns.length > 0) {
        tableSchemas.push({
          table_name: tableName,
          columns,
        });
        console.log(`   ✅ ${columns.length} colunas encontradas`);
      } else {
        console.log(`   ⚠️  Não foi possível determinar colunas (tabela vazia ou sem acesso)`);
      }
    }

    // Gerar SQL do schema
    console.log('\n📝 Gerando arquivo de schema...');
    const schemaSQL = generateSchemaSQL(tableSchemas);

    // Salvar arquivo
    const outputPath = path.join(__dirname, '../../docs/database-schema-synced.sql');
    fs.writeFileSync(outputPath, schemaSQL, 'utf-8');
    console.log(`✅ Schema salvo em: ${outputPath}`);

    // Gerar relatório de comparação
    console.log('\n📊 Resumo:');
    console.log(`   - Tabelas encontradas: ${tableSchemas.length}`);
    for (const table of tableSchemas) {
      console.log(`   - ${table.table_name}: ${table.columns.length} colunas`);
    }

    console.log('\n✅ Sincronização concluída!');
  } catch (error) {
    console.error('❌ Erro ao sincronizar schema:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main().catch(console.error);
}

export { main as syncSchemaFromDB };



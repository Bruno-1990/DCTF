/**
 * Script para atualizar o schema baseado em uma query SQL executada no Supabase
 * 
 * INSTRUÇÕES:
 * 1. Execute o script SQL em docs/scripts/get-schema.sql no Supabase SQL Editor
 * 2. Copie os resultados (especialmente a query de colunas)
 * 3. Cole os resultados em um arquivo JSON ou atualize este script
 * 
 * Alternativamente, este script pode ser usado para validar o schema atual
 * contra o que está documentado.
 */

import * as fs from 'fs';
import * as path from 'path';

interface ColumnInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  character_maximum_length: number | null;
  is_nullable: string;
  column_default: string | null;
  ordinal_position: number;
}

interface TableSchema {
  tableName: string;
  columns: ColumnInfo[];
}

/**
 * Atualizar o schema documentado com base nos dados reais do banco
 */
function updateSchemaDocumentation(schemaData: ColumnInfo[]): void {
  // Agrupar por tabela
  const tablesMap = new Map<string, ColumnInfo[]>();
  
  for (const col of schemaData) {
    if (!tablesMap.has(col.table_name)) {
      tablesMap.set(col.table_name, []);
    }
    tablesMap.get(col.table_name)!.push(col);
  }

  // Gerar SQL atualizado
  let sql = `-- ============================================================================\n`;
  sql += `-- SCHEMA SINCRONIZADO DO BANCO DE DADOS REAL\n`;
  sql += `-- Gerado automaticamente em: ${new Date().toISOString()}\n`;
  sql += `-- Execute este script no Supabase SQL Editor para criar/atualizar tabelas\n`;
  sql += `-- ============================================================================\n\n`;

  for (const [tableName, columns] of tablesMap.entries()) {
    sql += `-- ============================================================================\n`;
    sql += `-- TABELA: ${tableName}\n`;
    sql += `-- ============================================================================\n`;
    sql += `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;

    const columnDefs: string[] = [];
    for (const col of columns.sort((a, b) => a.ordinal_position - b.ordinal_position)) {
      let def = `    ${col.column_name} `;

      // Mapear tipos do PostgreSQL
      switch (col.data_type) {
        case 'character varying':
          if (col.character_maximum_length) {
            def += `VARCHAR(${col.character_maximum_length})`;
          } else {
            def += 'VARCHAR';
          }
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
        case 'timestamp without time zone':
          def += 'TIMESTAMP';
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

  // Salvar arquivo
  const outputPath = path.join(__dirname, '../../docs/database-schema-synced.sql');
  fs.writeFileSync(outputPath, sql, 'utf-8');
  console.log(`✅ Schema atualizado salvo em: ${outputPath}`);
}

/**
 * Comparar schema documentado com schema real
 */
function compareSchemas(
  documentedSchema: string,
  realSchema: ColumnInfo[]
): void {
  console.log('\n📊 Comparando schemas...\n');

  // Ler schema documentado e extrair informações
  // (implementação simplificada - pode ser melhorada)
  
  const tablesMap = new Map<string, ColumnInfo[]>();
  for (const col of realSchema) {
    if (!tablesMap.has(col.table_name)) {
      tablesMap.set(col.table_name, []);
    }
    tablesMap.get(col.table_name)!.push(col);
  }

  console.log('Tabelas encontradas no banco:');
  for (const [tableName, columns] of tablesMap.entries()) {
    console.log(`  - ${tableName}: ${columns.length} colunas`);
    console.log(`    Colunas: ${columns.map(c => c.column_name).join(', ')}`);
  }
}

// Exemplo de uso: se você tiver os dados da query, pode passar aqui
// const schemaData: ColumnInfo[] = [ /* dados da query SQL */ ];
// updateSchemaDocumentation(schemaData);

console.log(`
📋 INSTRUÇÕES PARA SINCRONIZAR O SCHEMA:

1. Acesse o Supabase Dashboard > SQL Editor
2. Execute o script em: docs/scripts/get-schema.sql
3. Copie os resultados da query de colunas (segunda query)
4. Converta para JSON ou atualize o script update-schema-from-query.ts
5. Execute: npx ts-node src/scripts/update-schema-from-query.ts

OU

Use o script sync-schema-from-db.ts que tenta fazer isso automaticamente
(requer SUPABASE_SERVICE_ROLE_KEY configurado no .env)
`);



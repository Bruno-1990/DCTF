/**
 * Script para criar tabelas do sistema de conhecimento de documentos legais (SPED v2.0)
 * Migration 013: sped_v2_legal_documents, sped_v2_document_chunks, sped_v2_legal_rules
 */

// Carregar variáveis de ambiente
import 'dotenv/config';

import { readFileSync } from 'fs';
import { join } from 'path';
import { mysqlPool } from '../config/mysql';

async function createSpedV2LegalDocumentsTables() {
  try {
    console.log('🔍 Lendo script SQL da migration 013...');
    const sqlPath = join(__dirname, '../../docs/migrations/mysql/013_create_sped_v2_legal_documents.sql');
    const sql = readFileSync(sqlPath, 'utf-8');
    
    console.log('🔌 Conectando ao MySQL...');
    const connection = await mysqlPool.getConnection();
    
    try {
      console.log('📝 Executando script SQL...\n');
      
      // Remover linhas de comentário (mas manter comentários inline)
      const lines = sql.split('\n');
      const cleanLines = lines
        .map(line => {
          // Remover comentários de linha completa (exceto separadores)
          if (line.trim().startsWith('--') && !line.trim().startsWith('-- =')) {
            return '';
          }
          return line;
        })
        .filter(line => line.trim().length > 0);
      
      const cleanSql = cleanLines.join('\n');
      
      // Executar cada comando separadamente
      const commands = cleanSql
        .split(';')
        .map(cmd => cmd.trim())
        .filter(cmd => {
          const trimmed = cmd.trim();
          // Filtrar vazios
          if (trimmed.length === 0) return false;
          // Filtrar linhas que são apenas comentários ou espaços
          if (trimmed.match(/^[\s-]*$/)) return false;
          // Manter comandos que contêm palavras-chave SQL
          return trimmed.length > 10;
        });
      
      console.log(`📝 Encontrados ${commands.length} comandos SQL para executar...\n`);
      
      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i];
        try {
          await connection.query(cmd);
          const cmdType = cmd.match(/\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT|INDEX|FOREIGN|VIEW|OR|REPLACE)\b/i)?.[1] || 'SQL';
          console.log(`✅ [${i + 1}/${commands.length}] ${cmdType} executado`);
        } catch (error: any) {
          // Ignorar erros de "table already exists" ou "duplicate key"
          if (error.code === 'ER_TABLE_EXISTS_ERROR' || 
              error.code === 'ER_DUP_KEYNAME' ||
              error.code === 'ER_DUP_ENTRY' ||
              error.message.includes('already exists') || 
              error.message.includes('Duplicate key name') ||
              error.message.includes('Duplicate entry')) {
            console.log(`⚠️  [${i + 1}/${commands.length}] Já existe (pulando)`);
          } else {
            console.error(`❌ [${i + 1}/${commands.length}] Erro:`, error.message);
            const preview = cmd.substring(0, 100).replace(/\n/g, ' ');
            console.error(`   SQL: ${preview}...`);
            throw error; // Re-throw para parar execução em caso de erro crítico
          }
        }
      }
      
      console.log('\n✅ Script executado!');
      
      // Verificar se as tabelas foram criadas
      const [tables] = await connection.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME LIKE 'sped_v2_%'
        ORDER BY TABLE_NAME
      `) as any[];
      
      console.log('\n📊 Tabelas criadas:');
      if (Array.isArray(tables) && tables.length > 0) {
        tables.forEach((table: any) => {
          console.log(`   ✅ ${table.TABLE_NAME}`);
        });
      } else {
        console.log('   ⚠️  Nenhuma tabela encontrada');
      }
      
      // Verificar views criadas
      const [views] = await connection.query(`
        SELECT TABLE_NAME 
        FROM information_schema.VIEWS 
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME LIKE 'vw_sped_v2_%'
        ORDER BY TABLE_NAME
      `) as any[];
      
      console.log('\n📊 Views criadas:');
      if (Array.isArray(views) && views.length > 0) {
        views.forEach((view: any) => {
          console.log(`   ✅ ${view.TABLE_NAME}`);
        });
      } else {
        console.log('   ⚠️  Nenhuma view encontrada');
      }
      
      // Verificar índices criados
      const [indexes] = await connection.query(`
        SELECT 
          TABLE_NAME,
          INDEX_NAME,
          COLUMN_NAME
        FROM information_schema.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME LIKE 'sped_v2_%'
        ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
      `) as any[];
      
      console.log('\n📊 Índices criados:');
      if (Array.isArray(indexes) && indexes.length > 0) {
        const indexMap = new Map<string, string[]>();
        indexes.forEach((idx: any) => {
          const key = `${idx.TABLE_NAME}.${idx.INDEX_NAME}`;
          if (!indexMap.has(key)) {
            indexMap.set(key, []);
          }
          indexMap.get(key)!.push(idx.COLUMN_NAME);
        });
        
        indexMap.forEach((columns, key) => {
          console.log(`   ✅ ${key} (${columns.join(', ')})`);
        });
      } else {
        console.log('   ⚠️  Nenhum índice encontrado');
      }
      
    } finally {
      connection.release();
    }
    
    console.log('\n✅ Migration 013 concluída com sucesso!');
    process.exit(0);
    
  } catch (error: any) {
    console.error('\n❌ Erro ao executar migration:', error);
    console.error('   Mensagem:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

// Executar
createSpedV2LegalDocumentsTables();



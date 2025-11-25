/**
 * Script para criar tabelas de SITF no MySQL
 */

// Carregar variáveis de ambiente
import 'dotenv/config';

import { readFileSync } from 'fs';
import { join } from 'path';
import { mysqlPool } from '../config/mysql';

async function createSITFTables() {
  try {
    console.log('🔍 Lendo script SQL...');
    const sqlPath = join(__dirname, '../../docs/migrations/mysql/005_create_sitf_downloads.sql');
    const sql = readFileSync(sqlPath, 'utf-8');
    
    console.log('🔌 Conectando ao MySQL...');
    const connection = await mysqlPool.getConnection();
    
    try {
      console.log('📝 Executando script SQL...\n');
      
      // Remover linhas de comentário (mas manter comentários inline)
      const lines = sql.split('\n');
      const cleanLines = lines
        .map(line => {
          // Remover comentários de linha completa
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
          const cmdType = cmd.match(/\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT|INDEX|FOREIGN)\b/i)?.[1] || 'SQL';
          console.log(`✅ [${i + 1}/${commands.length}] ${cmdType} executado`);
        } catch (error: any) {
          // Ignorar erros de "table already exists" ou "duplicate key"
          if (error.code === 'ER_TABLE_EXISTS_ERROR' || 
              error.code === 'ER_DUP_KEYNAME' ||
              error.message.includes('already exists') ||
              error.message.includes('Duplicate key name')) {
            console.log(`⚠️  [${i + 1}/${commands.length}] Já existe (pulando)`);
          } else {
            console.error(`❌ [${i + 1}/${commands.length}] Erro:`, error.message);
            const preview = cmd.substring(0, 80).replace(/\n/g, ' ');
            console.error(`   SQL: ${preview}...`);
          }
        }
      }
      
      console.log('\n✅ Script executado!');
      
      // Verificar se as tabelas foram criadas
      const [tables] = await connection.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME IN ('sitf_downloads', 'sitf_protocols')
      `, [process.env.MYSQL_DATABASE || 'dctf_web']);
      
      console.log('\n📊 Tabelas encontradas no banco:');
      if (Array.isArray(tables) && tables.length > 0) {
        (tables as any[]).forEach((table: any) => {
          console.log(`   ✅ ${table.TABLE_NAME}`);
        });
      } else {
        console.log('   ⚠️  Nenhuma tabela encontrada');
      }
      
    } finally {
      connection.release();
    }
    
    console.log('\n🎉 Processo concluído!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Erro ao criar tabelas:', error.message);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n💡 Dica: Verifique as variáveis de ambiente:');
      console.error('   - MYSQL_HOST');
      console.error('   - MYSQL_USER');
      console.error('   - MYSQL_PASSWORD');
      console.error('   - MYSQL_DATABASE');
    }
    process.exit(1);
  }
}

createSITFTables();






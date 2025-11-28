/**
 * Script para criar a tabela host_dados no banco de dados MySQL
 * Execute este script antes de usar o projeto Export
 */

import { getConnection } from '../config/mysql';
import * as fs from 'fs';
import * as path from 'path';

async function createHostDadosTable() {
  console.log('🔧 Criando tabela host_dados...\n');

  const connection = await getConnection();
  
  try {
    // Ler o arquivo SQL
    const sqlPath = path.join(__dirname, '../../docs/migrations/mysql/008_create_host_dados.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    
    // Remover comentários e dividir em comandos
    const commands = sql
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => {
        // Remover linhas vazias e comentários
        return cmd.length > 0 
          && !cmd.startsWith('--') 
          && !cmd.startsWith('/*');
      });
    
    console.log(`📝 Executando ${commands.length} comandos SQL...\n`);
    
    // Executar cada comando
    for (const command of commands) {
      if (command.trim()) {
        await connection.execute(command);
      }
    }
    
    console.log('✅ Tabela host_dados criada com sucesso!');
    console.log('   Database: dctf_web');
    
  } catch (error: any) {
    console.error('❌ Erro ao criar tabela:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  createHostDadosTable()
    .then(() => {
      console.log('✅ Script executado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro ao executar script:', error);
      process.exit(1);
    });
}

export default createHostDadosTable;


/**
 * Script interativo para operações CRUD no MySQL
 * Permite criar, ler, atualizar e deletar registros diretamente
 */

import 'dotenv/config';
import { executeQuery, getConnection } from '../config/mysql';
import { v4 as uuidv4 } from 'uuid';

// Interface para opções de CRUD
interface CrudOptions {
  table: string;
  operation: 'create' | 'read' | 'update' | 'delete' | 'list';
  id?: string;
  data?: Record<string, any>;
  filters?: Record<string, any>;
  limit?: number;
}

/**
 * Listar todos os registros de uma tabela
 */
async function listRecords(table: string, limit: number = 10): Promise<void> {
  try {
    // Validar nome da tabela para evitar SQL injection
    const validTables = ['clientes', 'dctf_declaracoes', 'dctf_dados', 'analises', 'flags', 'relatorios', 'dctf_codes'];
    if (!validTables.includes(table)) {
      throw new Error(`Tabela '${table}' não é permitida. Tabelas válidas: ${validTables.join(', ')}`);
    }
    
    // LIMIT não aceita parâmetros preparados no MySQL, então interpolamos o número diretamente
    // Como limit é sempre um número validado, é seguro fazer isso
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit))); // Garantir entre 1 e 1000, e inteiro
    const query = `SELECT * FROM \`${table}\` LIMIT ${safeLimit}`;
    const results = await executeQuery(query);
    
    console.log(`\n📋 Registros da tabela '${table}' (limitado a ${safeLimit}):`);
    console.log('='.repeat(80));
    
    if (results.length === 0) {
      console.log('Nenhum registro encontrado.');
    } else {
      console.table(results);
      console.log(`\nTotal: ${results.length} registro(s)`);
    }
  } catch (error) {
    console.error(`❌ Erro ao listar registros:`, error);
  }
}

/**
 * Buscar um registro por ID
 */
async function readRecord(table: string, id: string): Promise<void> {
  try {
    // Validar nome da tabela para evitar SQL injection
    const validTables = ['clientes', 'dctf_declaracoes', 'dctf_dados', 'analises', 'flags', 'relatorios', 'dctf_codes'];
    if (!validTables.includes(table)) {
      throw new Error(`Tabela '${table}' não é permitida. Tabelas válidas: ${validTables.join(', ')}`);
    }
    
    const query = `SELECT * FROM \`${table}\` WHERE id = ?`;
    const results = await executeQuery(query, [id]);
    
    if (results.length === 0) {
      console.log(`\n❌ Registro com ID '${id}' não encontrado na tabela '${table}'`);
    } else {
      console.log(`\n📖 Registro encontrado:`);
      console.log('='.repeat(80));
      console.log(JSON.stringify(results[0], null, 2));
    }
  } catch (error) {
    console.error(`❌ Erro ao buscar registro:`, error);
  }
}

/**
 * Criar um novo registro
 */
async function createRecord(table: string, data: Record<string, any>): Promise<void> {
  try {
    // Validar nome da tabela para evitar SQL injection
    const validTables = ['clientes', 'dctf_declaracoes', 'dctf_dados', 'analises', 'flags', 'relatorios', 'dctf_codes'];
    if (!validTables.includes(table)) {
      throw new Error(`Tabela '${table}' não é permitida. Tabelas válidas: ${validTables.join(', ')}`);
    }
    
    // Adicionar ID se não existir
    if (!data.id) {
      data.id = uuidv4();
    }
    
    // Adicionar timestamps se a tabela tiver essas colunas
    const hasTimestamps = ['clientes', 'dctf_declaracoes', 'analises', 'flags', 'relatorios'].includes(table);
    if (hasTimestamps && !data.created_at) {
      data.created_at = new Date();
    }
    
    const fields = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const values = Object.values(data);
    
    const query = `INSERT INTO \`${table}\` (${fields}) VALUES (${placeholders})`;
    
    const connection = await getConnection();
    try {
      await connection.execute(query, values);
      console.log(`\n✅ Registro criado com sucesso!`);
      console.log(`ID: ${data.id}`);
      
      // Buscar o registro criado para exibir
      const selectQuery = `SELECT * FROM \`${table}\` WHERE id = ?`;
      const [rows] = await connection.execute(selectQuery, [data.id]);
      const created = (rows as any[])[0];
      console.log('\n📖 Registro criado:');
      console.log(JSON.stringify(created, null, 2));
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error(`❌ Erro ao criar registro:`, error);
  }
}

/**
 * Atualizar um registro
 */
async function updateRecord(table: string, id: string, data: Record<string, any>): Promise<void> {
  try {
    // Validar nome da tabela para evitar SQL injection
    const validTables = ['clientes', 'dctf_declaracoes', 'dctf_dados', 'analises', 'flags', 'relatorios', 'dctf_codes'];
    if (!validTables.includes(table)) {
      throw new Error(`Tabela '${table}' não é permitida. Tabelas válidas: ${validTables.join(', ')}`);
    }
    
    // Remover ID dos dados de atualização se existir
    delete data.id;
    
    // Adicionar updated_at se a tabela tiver essa coluna
    const hasTimestamps = ['clientes', 'dctf_declaracoes', 'analises', 'flags', 'relatorios'].includes(table);
    if (hasTimestamps) {
      data.updated_at = new Date();
    }
    
    const fields = Object.keys(data)
      .map(key => `${key} = ?`)
      .join(', ');
    const values = [...Object.values(data), id];
    
    const query = `UPDATE \`${table}\` SET ${fields} WHERE id = ?`;
    
    const connection = await getConnection();
    try {
      const [result] = await connection.execute(query, values);
      const affectedRows = (result as any).affectedRows;
      
      if (affectedRows === 0) {
        console.log(`\n⚠️  Nenhum registro foi atualizado. Verifique se o ID '${id}' existe.`);
      } else {
        console.log(`\n✅ Registro atualizado com sucesso!`);
        console.log(`Linhas afetadas: ${affectedRows}`);
        
        // Buscar o registro atualizado
        const selectQuery = `SELECT * FROM \`${table}\` WHERE id = ?`;
        const [rows] = await connection.execute(selectQuery, [id]);
        const updated = (rows as any[])[0];
        console.log('\n📖 Registro atualizado:');
        console.log(JSON.stringify(updated, null, 2));
      }
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error(`❌ Erro ao atualizar registro:`, error);
  }
}

/**
 * Deletar um registro
 */
async function deleteRecord(table: string, id: string): Promise<void> {
  try {
    // Validar nome da tabela para evitar SQL injection
    const validTables = ['clientes', 'dctf_declaracoes', 'dctf_dados', 'analises', 'flags', 'relatorios', 'dctf_codes'];
    if (!validTables.includes(table)) {
      throw new Error(`Tabela '${table}' não é permitida. Tabelas válidas: ${validTables.join(', ')}`);
    }
    
    const query = `DELETE FROM \`${table}\` WHERE id = ?`;
    const connection = await getConnection();
    
    try {
      const [result] = await connection.execute(query, [id]);
      const affectedRows = (result as any).affectedRows;
      
      if (affectedRows === 0) {
        console.log(`\n⚠️  Nenhum registro foi deletado. Verifique se o ID '${id}' existe.`);
      } else {
        console.log(`\n✅ Registro deletado com sucesso!`);
        console.log(`Linhas afetadas: ${affectedRows}`);
      }
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error(`❌ Erro ao deletar registro:`, error);
  }
}

/**
 * Buscar registros com filtros
 */
async function findRecords(table: string, filters: Record<string, any>): Promise<void> {
  try {
    // Validar nome da tabela para evitar SQL injection
    const validTables = ['clientes', 'dctf_declaracoes', 'dctf_dados', 'analises', 'flags', 'relatorios', 'dctf_codes'];
    if (!validTables.includes(table)) {
      throw new Error(`Tabela '${table}' não é permitida. Tabelas válidas: ${validTables.join(', ')}`);
    }
    
    const conditions = Object.keys(filters)
      .map(key => `\`${key}\` = ?`)
      .join(' AND ');
    const values = Object.values(filters);
    
    const query = `SELECT * FROM \`${table}\` WHERE ${conditions}`;
    const results = await executeQuery(query, values);
    
    console.log(`\n🔍 Resultados da busca na tabela '${table}':`);
    console.log('='.repeat(80));
    
    if (results.length === 0) {
      console.log('Nenhum registro encontrado com os filtros especificados.');
    } else {
      console.table(results);
      console.log(`\nTotal: ${results.length} registro(s) encontrado(s)`);
    }
  } catch (error) {
    console.error(`❌ Erro ao buscar registros:`, error);
  }
}

/**
 * Função principal para executar operações CRUD
 */
export async function executeCrud(options: CrudOptions): Promise<void> {
  const { table, operation, id, data, filters, limit } = options;
  
  console.log(`\n🔧 Operação: ${operation.toUpperCase()} na tabela '${table}'`);
  console.log('='.repeat(80));
  
  switch (operation) {
    case 'list':
      await listRecords(table, limit || 10);
      break;
      
    case 'read':
      if (!id) {
        console.error('❌ ID é obrigatório para operação READ');
        return;
      }
      await readRecord(table, id);
      break;
      
    case 'create':
      if (!data) {
        console.error('❌ Dados são obrigatórios para operação CREATE');
        return;
      }
      await createRecord(table, data);
      break;
      
    case 'update':
      if (!id || !data) {
        console.error('❌ ID e dados são obrigatórios para operação UPDATE');
        return;
      }
      await updateRecord(table, id, data);
      break;
      
    case 'delete':
      if (!id) {
        console.error('❌ ID é obrigatório para operação DELETE');
        return;
      }
      await deleteRecord(table, id);
      break;
      
    default:
      console.error(`❌ Operação '${operation}' não reconhecida`);
  }
}

// Se executado diretamente, mostrar exemplos de uso
if (require.main === module) {
  console.log(`
📚 Exemplos de uso do MySQL CRUD:

// Listar clientes
import { executeCrud } from './mysql-crud';
await executeCrud({ table: 'clientes', operation: 'list', limit: 5 });

// Buscar cliente por ID
await executeCrud({ table: 'clientes', operation: 'read', id: 'uuid-aqui' });

// Criar novo cliente
await executeCrud({
  table: 'clientes',
  operation: 'create',
  data: {
    razao_social: 'Empresa Exemplo LTDA',
    cnpj_limpo: '12345678000190',
    email: 'contato@exemplo.com'
  }
});

// Atualizar cliente
await executeCrud({
  table: 'clientes',
  operation: 'update',
  id: 'uuid-aqui',
  data: { email: 'novo@email.com' }
});

// Deletar cliente
await executeCrud({ table: 'clientes', operation: 'delete', id: 'uuid-aqui' });
  `);
}


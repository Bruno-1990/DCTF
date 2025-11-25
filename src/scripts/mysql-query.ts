/**
 * Script para executar queries SQL customizadas no MySQL
 * Permite executar qualquer query SQL diretamente
 */

import 'dotenv/config';
import { executeQuery, getConnection } from '../config/mysql';

/**
 * Executar uma query SQL customizada
 */
export async function executeSQL(query: string, params?: any[]): Promise<any[]> {
  try {
    console.log(`\n🔧 Executando query SQL:`);
    console.log('='.repeat(80));
    console.log(query);
    if (params) {
      console.log('Parâmetros:', params);
    }
    console.log('='.repeat(80));
    
    const results = await executeQuery(query, params);
    
    console.log(`\n✅ Query executada com sucesso!`);
    console.log(`Resultados: ${results.length} linha(s)`);
    
    if (results.length > 0) {
      console.log('\n📊 Resultados:');
      console.table(results);
    }
    
    return results;
  } catch (error) {
    console.error(`\n❌ Erro ao executar query:`, error);
    throw error;
  }
}

/**
 * Executar query de modificação (INSERT, UPDATE, DELETE)
 */
export async function executeModification(
  query: string,
  params?: any[]
): Promise<{ affectedRows: number; insertId?: number }> {
  try {
    console.log(`\n🔧 Executando modificação SQL:`);
    console.log('='.repeat(80));
    console.log(query);
    if (params) {
      console.log('Parâmetros:', params);
    }
    console.log('='.repeat(80));
    
    const connection = await getConnection();
    try {
      const [result] = await connection.execute(query, params);
      const mysqlResult = result as any;
      
      console.log(`\n✅ Modificação executada com sucesso!`);
      console.log(`Linhas afetadas: ${mysqlResult.affectedRows || 0}`);
      if (mysqlResult.insertId) {
        console.log(`ID inserido: ${mysqlResult.insertId}`);
      }
      
      return {
        affectedRows: mysqlResult.affectedRows || 0,
        insertId: mysqlResult.insertId,
      };
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error(`\n❌ Erro ao executar modificação:`, error);
    throw error;
  }
}

// Exemplo de uso se executado diretamente
if (require.main === module) {
  console.log(`
📚 Exemplos de uso do MySQL Query:

import { executeSQL, executeModification } from './mysql-query';

// SELECT
const clientes = await executeSQL('SELECT * FROM clientes LIMIT 5');
const cliente = await executeSQL('SELECT * FROM clientes WHERE cnpj_limpo = ?', ['12345678000190']);

// INSERT
await executeModification(
  'INSERT INTO clientes (id, razao_social, cnpj_limpo) VALUES (?, ?, ?)',
  [uuid(), 'Empresa LTDA', '12345678000190']
);

// UPDATE
await executeModification(
  'UPDATE clientes SET email = ? WHERE id = ?',
  ['novo@email.com', 'uuid-aqui']
);

// DELETE
await executeModification('DELETE FROM clientes WHERE id = ?', ['uuid-aqui']);
  `);
}









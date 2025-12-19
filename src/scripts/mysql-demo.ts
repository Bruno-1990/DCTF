/**
 * Script de demonstração - Exemplos práticos de CRUD
 * Execute: npm run mysql:demo
 */

import 'dotenv/config';
import { executeCrud } from './mysql-crud';
import { executeSQL, executeModification } from './mysql-query';
import { v4 as uuidv4 } from 'uuid';

async function demo() {
  console.log('🚀 Demonstração de CRUD MySQL\n');
  
  // 1. Listar clientes
  console.log('\n1️⃣ LISTAR CLIENTES (primeiros 5)');
  await executeCrud({
    table: 'clientes',
    operation: 'list',
    limit: 5,
  });
  
  // 2. Contar registros
  console.log('\n2️⃣ CONTAR CLIENTES');
  const countResult = await executeSQL('SELECT COUNT(*) as total FROM clientes');
  console.log(`Total de clientes: ${countResult[0]?.total || 0}`);
  
  // 3. Buscar por CNPJ
  console.log('\n3️⃣ BUSCAR CLIENTE POR CNPJ');
  const clientes = await executeSQL(
    'SELECT * FROM clientes WHERE cnpj_limpo = ? LIMIT 1',
    ['12345678000190'] // Exemplo - substitua por um CNPJ real
  );
  
  if (clientes.length > 0) {
    console.log('Cliente encontrado:', clientes[0]);
  } else {
    console.log('Nenhum cliente encontrado com esse CNPJ');
  }
  
  // 4. Listar declarações DCTF
  console.log('\n4️⃣ LISTAR DECLARAÇÕES DCTF (primeiras 3)');
  await executeCrud({
    table: 'dctf_declaracoes',
    operation: 'list',
    limit: 3,
  });
  
  console.log('\n✅ Demonstração concluída!');
}

// Executar se chamado diretamente
if (require.main === module) {
  demo().catch(console.error);
}

export { demo };










































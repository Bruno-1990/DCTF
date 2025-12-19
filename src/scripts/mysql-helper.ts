/**
 * Helper functions para operações CRUD rápidas no MySQL
 * Use estas funções diretamente no chat para adicionar/consultar registros
 */

import 'dotenv/config';
import { executeCrud } from './mysql-crud';
import { executeSQL, executeModification } from './mysql-query';
import { v4 as uuidv4 } from 'uuid';

/**
 * Adicionar um novo cliente
 */
export async function adicionarCliente(dados: {
  razao_social: string;
  cnpj_limpo: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  cod_emp?: number;
}) {
  return await executeCrud({
    table: 'clientes',
    operation: 'create',
    data: {
      razao_social: dados.razao_social,
      cnpj_limpo: dados.cnpj_limpo,
      email: dados.email || null,
      telefone: dados.telefone || null,
      endereco: dados.endereco || null,
      cod_emp: dados.cod_emp || null,
    },
  });
}

/**
 * Listar clientes
 */
export async function listarClientes(limit: number = 10) {
  return await executeCrud({
    table: 'clientes',
    operation: 'list',
    limit,
  });
}

/**
 * Buscar cliente por CNPJ
 */
export async function buscarClientePorCNPJ(cnpj: string) {
  const results = await executeSQL(
    'SELECT * FROM clientes WHERE cnpj_limpo = ? LIMIT 1',
    [cnpj]
  );
  
  if (results.length === 0) {
    console.log(`\n❌ Cliente com CNPJ '${cnpj}' não encontrado`);
    return null;
  }
  
  console.log(`\n📖 Cliente encontrado:`);
  console.log(JSON.stringify(results[0], null, 2));
  return results[0];
}

/**
 * Atualizar cliente
 */
export async function atualizarCliente(id: string, dados: Partial<{
  razao_social: string;
  email: string;
  telefone: string;
  endereco: string;
  cod_emp: number;
}>) {
  return await executeCrud({
    table: 'clientes',
    operation: 'update',
    id,
    data: dados,
  });
}

/**
 * Deletar cliente
 */
export async function deletarCliente(id: string) {
  return await executeCrud({
    table: 'clientes',
    operation: 'delete',
    id,
  });
}

/**
 * Adicionar declaração DCTF
 */
export async function adicionarDeclaracaoDCTF(dados: {
  cliente_id: string;
  cnpj?: string;
  periodo_apuracao?: string;
  situacao?: string;
  tipo?: string;
  debito_apurado?: number;
  saldo_a_pagar?: number;
  tipo_ni?: string;
  categoria?: string;
  origem?: string;
}) {
  return await executeCrud({
    table: 'dctf_declaracoes',
    operation: 'create',
    data: {
      cliente_id: dados.cliente_id,
      cnpj: dados.cnpj || null,
      periodo_apuracao: dados.periodo_apuracao || null,
      situacao: dados.situacao || null,
      tipo: dados.tipo || null,
      debito_apurado: dados.debito_apurado || null,
      saldo_a_pagar: dados.saldo_a_pagar || null,
      tipo_ni: dados.tipo_ni || null,
      categoria: dados.categoria || null,
      origem: dados.origem || null,
      metadados: '{}',
    },
  });
}

/**
 * Listar declarações DCTF
 */
export async function listarDeclaracoesDCTF(limit: number = 10) {
  return await executeCrud({
    table: 'dctf_declaracoes',
    operation: 'list',
    limit,
  });
}

/**
 * Buscar declaração por ID
 */
export async function buscarDeclaracaoPorId(id: string) {
  return await executeCrud({
    table: 'dctf_declaracoes',
    operation: 'read',
    id,
  });
}

/**
 * Executar query SQL customizada
 */
export async function executarQuery(query: string, params?: any[]) {
  return await executeSQL(query, params);
}

/**
 * Contar registros em uma tabela
 */
export async function contarRegistros(tabela: string) {
  const results = await executeSQL(`SELECT COUNT(*) as total FROM \`${tabela}\``);
  const total = results[0]?.total || 0;
  console.log(`\n📊 Total de registros na tabela '${tabela}': ${total}`);
  return total;
}

// Exemplo de uso se executado diretamente
if (require.main === module) {
  console.log(`
📚 Helper Functions para MySQL CRUD

Exemplos de uso:

import { 
  adicionarCliente, 
  listarClientes, 
  buscarClientePorCNPJ,
  atualizarCliente,
  deletarCliente,
  adicionarDeclaracaoDCTF,
  listarDeclaracoesDCTF,
  executarQuery,
  contarRegistros
} from './mysql-helper';

// Adicionar cliente
await adicionarCliente({
  razao_social: 'Empresa Exemplo LTDA',
  cnpj_limpo: '12345678000190',
  email: 'contato@exemplo.com'
});

// Listar clientes
await listarClientes(5);

// Buscar por CNPJ
await buscarClientePorCNPJ('12345678000190');

// Contar registros
await contarRegistros('clientes');
  `);
}










































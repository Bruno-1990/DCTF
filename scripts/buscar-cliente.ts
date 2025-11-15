/**
 * Script para buscar cliente "Central Cotabil" no banco de dados
 */

import dotenv from 'dotenv';
import { Cliente } from '../src/models/Cliente';

dotenv.config();

async function buscarCliente() {
  console.log('🔍 Buscando cliente "Central Cotabil" ou "Central Contábil"...\n');

  try {
    const clienteModel = new Cliente();

    // Primeiro, listar todos os clientes para ver o que existe
    console.log('📋 Listando os primeiros 20 clientes do banco...\n');
    const todosClientes = await clienteModel.findAll();
    
    if (todosClientes.success && todosClientes.data && todosClientes.data.length > 0) {
      console.log(`✅ Total de ${todosClientes.data.length} cliente(s) encontrado(s) no banco\n`);
      console.log('Primeiros 20 clientes:\n');
      todosClientes.data.slice(0, 20).forEach((cliente, index) => {
        console.log(`${index + 1}. ID: ${cliente.id}`);
        console.log(`   Razão Social: ${cliente.razao_social || 'N/A'}`);
        console.log(`   Nome: ${cliente.nome || 'N/A'}`);
        console.log(`   CNPJ: ${cliente.cnpj_limpo || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('❌ Não foi possível listar os clientes');
      if (todosClientes.error) {
        console.log(`   Erro: ${todosClientes.error}`);
      }
    }

    // Buscar por diferentes variações do nome
    console.log('\n🔍 Buscando especificamente por "Central Cotabil" ou "Central Contábil"...\n');
    const termos = ['Central Contabil', 'Central Cotabil', 'Central Contábil', 'central contabil', 'CENTRAL CONTABIL'];

    let clientesEncontrados: any[] = [];

    for (const termo of termos) {
      console.log(`🔍 Buscando por: "${termo}"...`);
      
      const result = await clienteModel.searchByName(termo);

      if (result.success && result.data && result.data.length > 0) {
        console.log(`✅ Encontrados ${result.data.length} cliente(s) com "${termo}"`);
        clientesEncontrados = [...clientesEncontrados, ...result.data];
      } else {
        console.log(`❌ Nenhum cliente encontrado com "${termo}"`);
      }
    }

    // Remover duplicatas por ID
    const clientesUnicos = Array.from(
      new Map(clientesEncontrados.map(c => [c.id, c])).values()
    );

    if (clientesUnicos.length === 0) {
      console.log('\n❌ Nenhum cliente encontrado com "Central Cotabil" ou "Central Contábil"\n');
      console.log('🔍 Buscando clientes que contenham apenas "Central"...\n');

      const resultCentral = await clienteModel.searchByName('Central');

      if (resultCentral.success && resultCentral.data && resultCentral.data.length > 0) {
        console.log(`✅ Encontrados ${resultCentral.data.length} cliente(s) com "Central":\n`);
        resultCentral.data.forEach((cliente, index) => {
          console.log(`${index + 1}. ID: ${cliente.id}`);
          console.log(`   Razão Social: ${cliente.razao_social || 'N/A'}`);
          console.log(`   Nome: ${cliente.nome || 'N/A'}`);
          console.log(`   CNPJ: ${cliente.cnpj_limpo || 'N/A'}`);
          console.log(`   Email: ${cliente.email || 'N/A'}`);
          console.log(`   Telefone: ${cliente.telefone || 'N/A'}`);
          console.log(`   Endereço: ${cliente.endereco || 'N/A'}`);
          console.log('');
        });
      } else {
        console.log('❌ Nenhum cliente encontrado com "Central"');
      }
    } else {
      console.log(`\n✅ Encontrados ${clientesUnicos.length} cliente(s):\n`);
      clientesUnicos.forEach((cliente, index) => {
        console.log(`${index + 1}. ID: ${cliente.id}`);
        console.log(`   Razão Social: ${cliente.razao_social || 'N/A'}`);
        console.log(`   Nome: ${cliente.nome || 'N/A'}`);
        console.log(`   CNPJ: ${cliente.cnpj_limpo || 'N/A'}`);
        console.log(`   Email: ${cliente.email || 'N/A'}`);
        console.log(`   Telefone: ${cliente.telefone || 'N/A'}`);
        console.log(`   Endereço: ${cliente.endereco || 'N/A'}`);
        console.log('');
      });
    }

    // Verificar se o CNPJ 32401481000133 está associado a algum cliente
    const cnpjBuscado = '32401481000133';
    console.log(`\n🔍 Verificando se o CNPJ ${cnpjBuscado} está cadastrado...\n`);

    const resultCNPJ = await clienteModel.findByCNPJ(cnpjBuscado);

    if (resultCNPJ.success && resultCNPJ.data) {
      console.log(`✅ Cliente encontrado pelo CNPJ ${cnpjBuscado}:`);
      console.log(`   ID: ${resultCNPJ.data.id}`);
      console.log(`   Razão Social: ${resultCNPJ.data.razao_social || 'N/A'}`);
      console.log(`   Nome: ${resultCNPJ.data.nome || 'N/A'}`);
      console.log(`   CNPJ: ${resultCNPJ.data.cnpj_limpo || 'N/A'}`);
      console.log(`   Email: ${resultCNPJ.data.email || 'N/A'}`);
      console.log(`   Telefone: ${resultCNPJ.data.telefone || 'N/A'}`);
      console.log(`   Endereço: ${resultCNPJ.data.endereco || 'N/A'}`);
    } else {
      console.log(`❌ CNPJ ${cnpjBuscado} não encontrado na tabela clientes`);
      if (resultCNPJ.error) {
        console.log(`   Erro: ${resultCNPJ.error}`);
      }
    }

  } catch (error: any) {
    console.error('❌ Erro ao buscar cliente:', error.message);
    console.error(error);
  }
}

buscarCliente();


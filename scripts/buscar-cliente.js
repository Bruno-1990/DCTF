/**
 * Script para buscar cliente "Central Cotabil" no banco de dados
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente SUPABASE_URL e SUPABASE_KEY não configuradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function buscarCliente() {
  console.log('🔍 Buscando cliente "Central Cotabil" ou "Central Contábil"...\n');

  try {
    // Buscar por diferentes variações do nome
    const termos = [
      '%Central%Contabil%',
      '%Central%Cotabil%',
      '%CENTRAL%CONTABIL%',
      '%CENTRAL%COTABIL%',
      '%central%contabil%',
      '%central%cotabil%'
    ];

    let clientesEncontrados = [];

    for (const termo of termos) {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, razao_social, nome, cnpj_limpo, email, telefone, endereco, created_at, updated_at')
        .or(`razao_social.ilike.${termo},nome.ilike.${termo}`)
        .limit(50);

      if (error) {
        console.error(`❌ Erro ao buscar com termo "${termo}":`, error.message);
        continue;
      }

      if (data && data.length > 0) {
        clientesEncontrados = [...clientesEncontrados, ...data];
      }
    }

    // Remover duplicatas por ID
    const clientesUnicos = Array.from(
      new Map(clientesEncontrados.map(c => [c.id, c])).values()
    );

    if (clientesUnicos.length === 0) {
      console.log('❌ Nenhum cliente encontrado com "Central Cotabil" ou "Central Contábil"\n');
      console.log('🔍 Buscando clientes que contenham apenas "Central"...\n');

      const { data: dataCentral, error: errorCentral } = await supabase
        .from('clientes')
        .select('id, razao_social, nome, cnpj_limpo, email, telefone, endereco, created_at, updated_at')
        .or('razao_social.ilike.%Central%,nome.ilike.%Central%')
        .limit(20);

      if (errorCentral) {
        console.error('❌ Erro ao buscar:', errorCentral.message);
        return;
      }

      if (dataCentral && dataCentral.length > 0) {
        console.log(`✅ Encontrados ${dataCentral.length} cliente(s) com "Central":\n`);
        dataCentral.forEach((cliente, index) => {
          console.log(`${index + 1}. ID: ${cliente.id}`);
          console.log(`   Razão Social: ${cliente.razao_social || 'N/A'}`);
          console.log(`   Nome: ${cliente.nome || 'N/A'}`);
          console.log(`   CNPJ: ${cliente.cnpj_limpo || 'N/A'}`);
          console.log(`   Email: ${cliente.email || 'N/A'}`);
          console.log(`   Telefone: ${cliente.telefone || 'N/A'}`);
          console.log(`   Endereço: ${cliente.endereco || 'N/A'}`);
          console.log(`   Criado em: ${cliente.created_at || 'N/A'}`);
          console.log('');
        });
      } else {
        console.log('❌ Nenhum cliente encontrado com "Central"');
      }
    } else {
      console.log(`✅ Encontrados ${clientesUnicos.length} cliente(s):\n`);
      clientesUnicos.forEach((cliente, index) => {
        console.log(`${index + 1}. ID: ${cliente.id}`);
        console.log(`   Razão Social: ${cliente.razao_social || 'N/A'}`);
        console.log(`   Nome: ${cliente.nome || 'N/A'}`);
        console.log(`   CNPJ: ${cliente.cnpj_limpo || 'N/A'}`);
        console.log(`   Email: ${cliente.email || 'N/A'}`);
        console.log(`   Telefone: ${cliente.telefone || 'N/A'}`);
        console.log(`   Endereço: ${cliente.endereco || 'N/A'}`);
        console.log(`   Criado em: ${cliente.created_at || 'N/A'}`);
        console.log('');
      });
    }

    // Verificar se o CNPJ 32401481000133 está associado a algum cliente
    const cnpjBuscado = '32401481000133';
    console.log(`\n🔍 Verificando se o CNPJ ${cnpjBuscado} está cadastrado...\n`);

    const { data: clienteCNPJ, error: errorCNPJ } = await supabase
      .from('clientes')
      .select('id, razao_social, nome, cnpj_limpo, email, telefone, endereco, created_at, updated_at')
      .eq('cnpj_limpo', cnpjBuscado)
      .single();

    if (errorCNPJ) {
      if (errorCNPJ.code === 'PGRST116') {
        console.log(`❌ CNPJ ${cnpjBuscado} não encontrado na tabela clientes`);
      } else {
        console.error('❌ Erro ao buscar por CNPJ:', errorCNPJ.message);
      }
    } else if (clienteCNPJ) {
      console.log(`✅ Cliente encontrado pelo CNPJ ${cnpjBuscado}:`);
      console.log(`   ID: ${clienteCNPJ.id}`);
      console.log(`   Razão Social: ${clienteCNPJ.razao_social || 'N/A'}`);
      console.log(`   Nome: ${clienteCNPJ.nome || 'N/A'}`);
      console.log(`   CNPJ: ${clienteCNPJ.cnpj_limpo || 'N/A'}`);
      console.log(`   Email: ${clienteCNPJ.email || 'N/A'}`);
      console.log(`   Telefone: ${clienteCNPJ.telefone || 'N/A'}`);
      console.log(`   Endereço: ${clienteCNPJ.endereco || 'N/A'}`);
    }

  } catch (error) {
    console.error('❌ Erro ao buscar cliente:', error.message);
    console.error(error);
  }
}

buscarCliente();


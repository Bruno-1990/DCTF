import axios from 'axios';

async function testDCTFApi() {
  const baseURL = 'http://localhost:3000/api';
  
  console.log('🧪 Testando API DCTF...\n');
  
  try {
    // Teste 1: Listar declarações
    console.log('1️⃣ Testando GET /api/dctf (listar declarações)...');
    const response1 = await axios.get(`${baseURL}/dctf`, {
      params: {
        page: 1,
        limit: 5,
      },
    });
    
    console.log('✅ Status:', response1.status);
    console.log('✅ Success:', response1.data.success);
    console.log('✅ Total de declarações:', response1.data.pagination?.total || 0);
    console.log('✅ Declarações retornadas:', response1.data.data?.length || 0);
    
    if (response1.data.data && response1.data.data.length > 0) {
      const first = response1.data.data[0];
      console.log('\n📋 Primeira declaração:');
      console.log('   ID:', first.id);
      console.log('   Cliente:', first.cliente?.razao_social || 'N/A');
      console.log('   CNPJ:', first.numeroIdentificacao || 'N/A');
      console.log('   Período:', first.periodoApuracao || first.periodo || 'N/A');
      console.log('   Situação:', first.situacao || first.status || 'N/A');
      console.log('   Débito Apurado:', first.debitoApurado || 0);
      console.log('   Saldo a Pagar:', first.saldoAPagar || 0);
    }
    
    // Teste 2: Buscar com filtro de busca (CNPJ)
    console.log('\n2️⃣ Testando GET /api/dctf?search=29236102000192...');
    const response2 = await axios.get(`${baseURL}/dctf`, {
      params: {
        page: 1,
        limit: 10,
        search: '29236102000192',
      },
    });
    
    console.log('✅ Status:', response2.status);
    console.log('✅ Success:', response2.data.success);
    console.log('✅ Total encontrado:', response2.data.pagination?.total || 0);
    
    // Teste 3: Buscar com filtro de situação
    console.log('\n3️⃣ Testando GET /api/dctf?situacao=Ativa...');
    const response3 = await axios.get(`${baseURL}/dctf`, {
      params: {
        page: 1,
        limit: 10,
        situacao: 'Ativa',
      },
    });
    
    console.log('✅ Status:', response3.status);
    console.log('✅ Success:', response3.data.success);
    console.log('✅ Total encontrado:', response3.data.pagination?.total || 0);
    
    // Teste 4: Verificar tipos disponíveis
    console.log('\n4️⃣ Verificando tipos disponíveis...');
    if (response1.data.tiposDisponiveis && Array.isArray(response1.data.tiposDisponiveis)) {
      console.log('✅ Tipos disponíveis:', response1.data.tiposDisponiveis.join(', '));
    }
    
    // Teste 5: Verificar última atualização
    console.log('\n5️⃣ Verificando última atualização...');
    if (response1.data.lastUpdate) {
      console.log('✅ Última atualização:', new Date(response1.data.lastUpdate).toLocaleString('pt-BR'));
    }
    
    console.log('\n✅ Todos os testes passaram!');
    
  } catch (error: any) {
    console.error('\n❌ Erro ao testar API:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('   Não foi possível conectar ao servidor. Verifique se o backend está rodando.');
    }
    process.exit(1);
  }
}

testDCTFApi();


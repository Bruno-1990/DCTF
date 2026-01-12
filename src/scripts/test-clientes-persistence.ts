/**
 * Script de teste interno para verificar persistência de dados ReceitaWS
 * Simula o import e verifica se os dados estão sendo salvos corretamente
 */

import 'dotenv/config';
import { getConnection } from '../config/mysql';
import { Cliente } from '../models/Cliente';

// Dados de teste simulando resposta da ReceitaWS
const mockReceitaWSData = {
  nome: 'EMPRESA TESTE LTDA',
  fantasia: 'TESTE SOLUCOES',
  cnpj: '12.345.678/0001-90',
  situacao: 'ATIVA',
  tipo: 'MATRIZ',
  porte: 'EMPRESA DE PEQUENO PORTE',
  natureza_juridica: '206-2 - Sociedade Empresária Limitada',
  abertura: '15/03/2020',
  data_situacao: '15/03/2020',
  motivo_situacao: null,
  situacao_especial: null,
  data_situacao_especial: null,
  efr: null,
  atividade_principal: [{ code: '69.20-6-01', text: 'Atividades de contabilidade' }],
  atividades_secundarias: [],
  logradouro: 'RUA TESTE',
  numero: '123',
  complemento: 'SALA 1',
  bairro: 'CENTRO',
  municipio: 'VITORIA',
  uf: 'ES',
  cep: '29000-000',
  email: 'teste@empresa.com.br',
  telefone: '(27) 9999-9999',
  capital_social: '100000.00',
  simples: {
    optante: true,
    data_opcao: '01/01/2021',
    data_exclusao: null,
  },
  simei: {
    optante: false,
    data_opcao: null,
    data_exclusao: null,
  },
  status: 'OK',
  ultima_atualizacao: '2025-12-30T19:00:00.000Z',
  qsa: [
    { nome: 'JOAO SILVA', qual: '49-Sócio-Administrador' },
    { nome: 'MARIA SANTOS', qual: '49-Sócio-Administrador' },
  ],
};

async function testPersistence() {
  console.log('🧪 TESTE DE PERSISTÊNCIA - Dados ReceitaWS\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  const clienteModel = new Cliente();
  const connection = await getConnection();
  let testClienteId: string | null = null;

  try {
    // 1. Limpar dados de teste anteriores (se existirem)
    const cnpjLimpo = '12345678000190';
    console.log('1️⃣ Limpando dados de teste anteriores...');
    const existing = await clienteModel.findBy({ cnpj_limpo: cnpjLimpo });
    if (existing.success && existing.data && existing.data.length > 0) {
      testClienteId = existing.data[0].id;
      console.log(`   ⚠️  Cliente de teste já existe (ID: ${testClienteId}). Será atualizado.\n`);
    } else {
      console.log('   ✅ Nenhum cliente de teste encontrado.\n');
    }

    // 2. Simular import da ReceitaWS
    console.log('2️⃣ Simulando import da ReceitaWS...');
    console.log('   CNPJ:', cnpjLimpo);
    console.log('   Razão Social:', mockReceitaWSData.nome);
    console.log('   Fantasia:', mockReceitaWSData.fantasia);
    console.log('   Simples Optante:', mockReceitaWSData.simples.optante);
    console.log('   Data Abertura:', mockReceitaWSData.abertura);
    console.log('   Telefone:', mockReceitaWSData.telefone);
    console.log('   Sócios:', mockReceitaWSData.qsa.length);
    console.log('');

    // Usar o método importarReceitaWS do modelo
    // Mas primeiro precisamos mockar a resposta da ReceitaWS
    // Vamos fazer um teste direto no banco para verificar os tipos

    // 3. Testar inserção direta no banco com diferentes formatos de data/timestamp
    console.log('3️⃣ Testando inserção direta no banco...\n');

    const testId = testClienteId || require('uuid').v4();
    const agora = new Date();

    // Testar diferentes formatos
    const testCases = [
      {
        name: 'Data como string YYYY-MM-DD',
        abertura: '2020-03-15',
        receita_ws_consulta_em: agora,
      },
      {
        name: 'Data como Date object',
        abertura: new Date('2020-03-15'),
        receita_ws_consulta_em: agora,
      },
      {
        name: 'Timestamp como Date object',
        abertura: '2020-03-15',
        receita_ws_consulta_em: new Date('2025-12-30T19:00:00.000Z'),
      },
    ];

    for (const testCase of testCases) {
      console.log(`   Testando: ${testCase.name}`);
      try {
        // Criar registro de teste
        await connection.execute(
          `INSERT INTO \`clientes\` (id, cnpj_limpo, razao_social, abertura, receita_ws_consulta_em) 
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE abertura = ?, receita_ws_consulta_em = ?`,
          [
            testId,
            cnpjLimpo,
            'TESTE PERSISTENCIA',
            testCase.abertura,
            testCase.receita_ws_consulta_em,
            testCase.abertura,
            testCase.receita_ws_consulta_em,
          ]
        );
        console.log(`   ✅ Sucesso com ${testCase.name}\n`);

        // Verificar o que foi salvo
        const [rows] = await connection.execute(
          `SELECT abertura, receita_ws_consulta_em FROM \`clientes\` WHERE id = ?`,
          [testId]
        );
        const row = (rows as any[])[0];
        console.log(`   📊 Valores salvos:`);
        console.log(`      abertura: ${row.abertura} (tipo: ${typeof row.abertura})`);
        console.log(`      receita_ws_consulta_em: ${row.receita_ws_consulta_em} (tipo: ${typeof row.receita_ws_consulta_em})`);
        console.log('');
      } catch (error: any) {
        console.log(`   ❌ Erro com ${testCase.name}:`);
        console.log(`      ${error.message}\n`);
      }
    }

    // 4. Testar o método real importarReceitaWS (mockando a API)
    console.log('4️⃣ Testando método importarReceitaWS do modelo...\n');

    // Mock do ReceitaWSService
    const originalReceitaWS = (clienteModel as any).receitaWs;
    (clienteModel as any).receitaWs = {
      consultarCNPJ: async () => mockReceitaWSData,
    };

    try {
      const result = await clienteModel.importarReceitaWS(cnpjLimpo, { overwrite: true });
      if (result.success) {
        console.log('   ✅ Import realizado com sucesso!');
        console.log(`   📊 Cliente ID: ${result.data?.id}`);
        console.log(`   📊 Razão Social: ${result.data?.razao_social}`);
        console.log(`   📊 Fantasia: ${(result.data as any)?.fantasia}`);
        console.log(`   📊 Simples Optante: ${(result.data as any)?.simples_optante}`);
        console.log(`   📊 Abertura: ${(result.data as any)?.abertura}`);
        console.log(`   📊 Sócios: ${Array.isArray((result.data as any)?.socios) ? (result.data as any).socios.length : 0}`);
        console.log('');

        // Verificar no banco diretamente
        const [dbRows] = await connection.execute(
          `SELECT 
            abertura, 
            data_situacao, 
            receita_ws_consulta_em, 
            receita_ws_ultima_atualizacao,
            simples_optante,
            fantasia
           FROM \`clientes\` WHERE id = ?`,
          [result.data?.id]
        );
        const dbRow = (dbRows as any[])[0];
        console.log('   📋 Valores no banco de dados:');
        console.log(`      abertura: ${dbRow.abertura}`);
        console.log(`      data_situacao: ${dbRow.data_situacao}`);
        console.log(`      receita_ws_consulta_em: ${dbRow.receita_ws_consulta_em}`);
        console.log(`      receita_ws_ultima_atualizacao: ${dbRow.receita_ws_ultima_atualizacao}`);
        console.log(`      simples_optante: ${dbRow.simples_optante} (tipo: ${typeof dbRow.simples_optante})`);
        console.log(`      fantasia: ${dbRow.fantasia}`);
        console.log('');

        // Verificar sócios
        const [sociosRows] = await connection.execute(
          `SELECT nome, qual FROM \`clientes_socios\` WHERE cliente_id = ?`,
          [result.data?.id]
        );
        console.log(`   👥 Sócios salvos (${(sociosRows as any[]).length}):`);
        (sociosRows as any[]).forEach((s, i) => {
          console.log(`      ${i + 1}. ${s.nome} - ${s.qual || 'N/A'}`);
        });
        console.log('');
      } else {
        console.log('   ❌ Erro no import:');
        console.log(`      ${result.error}\n`);
      }
    } catch (error: any) {
      console.log('   ❌ Erro ao testar import:');
      console.log(`      ${error.message}`);
      console.log(`      Stack: ${error.stack}\n`);
    } finally {
      // Restaurar ReceitaWS original
      (clienteModel as any).receitaWs = originalReceitaWS;
    }

    // 5. Limpeza (opcional - comentado para manter dados para inspeção)
    // console.log('5️⃣ Limpando dados de teste...');
    // await connection.execute(`DELETE FROM \`clientes_socios\` WHERE cliente_id = ?`, [testId]);
    // await connection.execute(`DELETE FROM \`clientes\` WHERE id = ?`, [testId]);
    // console.log('   ✅ Dados de teste removidos.\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ TESTE DE PERSISTÊNCIA CONCLUÍDO');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('💡 Dica: Os dados de teste foram mantidos no banco para inspeção.');
    console.log('   Para remover, execute:');
    console.log(`   DELETE FROM clientes_socios WHERE cliente_id = '${testId}';`);
    console.log(`   DELETE FROM clientes WHERE id = '${testId}';`);

  } catch (error: any) {
    console.error('❌ Erro no teste:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  testPersistence()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Erro:', err);
      process.exit(1);
    });
}

export default testPersistence;




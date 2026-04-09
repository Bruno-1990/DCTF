/**
 * Verificar versão do MySQL e testar sintaxe do upsert
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

const envPath = path.join(__dirname, '.env.temp');
dotenv.config({ path: envPath });

import { executeQuery } from './src/config/mysql';

async function testMySQLVersion() {
  try {
    console.log('🔍 VERIFICANDO VERSÃO DO MYSQL\n');
    
    // 1. Verificar versão
    const versionResult = await executeQuery<any>('SELECT VERSION() as version');
    console.log(`📊 Versão do MySQL: ${versionResult[0].version}\n`);
    
    // 2. Testar sintaxe AS new (moderna)
    console.log('🧪 Teste 1: Sintaxe moderna (AS new)...');
    try {
      const query1 = `
        INSERT INTO dctf_declaracoes 
          (\`id\`, \`cnpj\`, \`periodo_apuracao\`, \`situacao\`, \`updated_at\`)
        VALUES 
          ('test-modern-syntax', '99999999999999', 'TESTE', 'Teste', NOW()) AS new
        ON DUPLICATE KEY UPDATE
          \`situacao\` = new.\`situacao\`,
          \`updated_at\` = new.\`updated_at\`
      `;
      await executeQuery(query1);
      console.log('   ✅ Sintaxe AS new FUNCIONA!\n');
      
      // Limpar teste
      await executeQuery(`DELETE FROM dctf_declaracoes WHERE id = 'test-modern-syntax'`);
    } catch (error: any) {
      console.log(`   ❌ ERRO na sintaxe AS new: ${error.message}\n`);
    }
    
    // 3. Testar sintaxe VALUES() (antiga)
    console.log('🧪 Teste 2: Sintaxe antiga (VALUES())...');
    try {
      const query2 = `
        INSERT INTO dctf_declaracoes 
          (\`id\`, \`cnpj\`, \`periodo_apuracao\`, \`situacao\`, \`updated_at\`)
        VALUES 
          ('test-old-syntax', '88888888888888', 'TESTE', 'Teste', NOW())
        ON DUPLICATE KEY UPDATE
          \`situacao\` = VALUES(\`situacao\`),
          \`updated_at\` = VALUES(\`updated_at\`)
      `;
      await executeQuery(query2);
      console.log('   ✅ Sintaxe VALUES() FUNCIONA!\n');
      
      // Limpar teste
      await executeQuery(`DELETE FROM dctf_declaracoes WHERE id = 'test-old-syntax'`);
    } catch (error: any) {
      console.log(`   ❌ ERRO na sintaxe VALUES(): ${error.message}\n`);
    }
    
    // 4. Testar update real no registro
    console.log('🧪 Teste 3: UPSERT no registro real...');
    const testId = 'dbc065fa-b850-410f-acde-8bf603a9bd41';
    
    // Primeiro, verificar valores atuais
    const before = await executeQuery<any>(
      `SELECT updated_at, data_transmissao FROM dctf_declaracoes WHERE id = ?`,
      [testId]
    );
    
    if (before.length > 0) {
      console.log(`   📄 ANTES: updated_at = ${before[0].updated_at}`);
      console.log(`   📄 ANTES: data_transmissao = ${before[0].data_transmissao}\n`);
      
      // Executar upsert com sintaxe moderna
      const upsertQuery = `
        INSERT INTO dctf_declaracoes 
          (\`id\`, \`cnpj\`, \`periodo_apuracao\`, \`data_transmissao\`, \`situacao\`, \`updated_at\`)
        VALUES 
          (?, '33249391000131', '12/2025', '2026-01-23 13:57:32', 'Ativa Atualizada', NOW()) AS new
        ON DUPLICATE KEY UPDATE
          \`situacao\` = new.\`situacao\`,
          \`data_transmissao\` = new.\`data_transmissao\`,
          \`updated_at\` = new.\`updated_at\`
      `;
      
      await executeQuery(upsertQuery, [testId]);
      console.log('   ✅ UPSERT executado!\n');
      
      // Verificar valores depois
      const after = await executeQuery<any>(
        `SELECT updated_at, data_transmissao, situacao FROM dctf_declaracoes WHERE id = ?`,
        [testId]
      );
      
      console.log(`   📄 DEPOIS: updated_at = ${after[0].updated_at}`);
      console.log(`   📄 DEPOIS: data_transmissao = ${after[0].data_transmissao}`);
      console.log(`   📄 DEPOIS: situacao = ${after[0].situacao}\n`);
      
      if (after[0].situacao === 'Ativa Atualizada') {
        console.log('   ✅ SUCESSO! Registro foi atualizado!\n');
      } else {
        console.log('   ❌ FALHOU! Registro não foi atualizado!\n');
      }
      
      // Restaurar situação original
      await executeQuery(
        `UPDATE dctf_declaracoes SET situacao = 'Ativa' WHERE id = ?`,
        [testId]
      );
    }
    
    console.log('✅ Testes concluídos!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Erro:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testMySQLVersion();

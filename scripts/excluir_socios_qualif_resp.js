/**
 * Script para excluir registros de sócios que contenham "Qualif. Resp." no banco MySQL
 * 
 * Uso: node scripts/excluir_socios_qualif_resp.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function excluirSociosComQualifResp() {
  let connection = null;
  
  try {
    // Ler configurações do .env
    const config = {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'dctf_web',
    };

    console.log('🔍 Conectando ao MySQL...');
    console.log(`   Host: ${config.host}`);
    console.log(`   Database: ${config.database}`);
    console.log(`   User: ${config.user}`);

    // Conectar ao MySQL
    connection = await mysql.createConnection(config);
    console.log('✅ Conectado ao MySQL com sucesso!\n');

    // Buscar registros que contenham "Qualif. Resp." no nome ou qualificação
    console.log('🔍 Buscando registros com "Qualif. Resp." na tabela clientes_socios...');
    
    const [registros] = await connection.execute(`
      SELECT 
        id, 
        cliente_id, 
        nome, 
        cpf, 
        qual, 
        participacao_percentual,
        participacao_valor
      FROM clientes_socios
      WHERE 
        UPPER(nome) LIKE '%QUALIF%RESP%' OR
        UPPER(qual) LIKE '%QUALIF%RESP%' OR
        nome LIKE '%Qualif. Resp%' OR
        qual LIKE '%Qualif. Resp%'
      ORDER BY cliente_id, nome
    `);

    console.log(`📋 Encontrados ${registros.length} registros com "Qualif. Resp.":\n`);

    if (registros.length === 0) {
      console.log('✅ Nenhum registro encontrado. Nada a excluir.');
      return;
    }

    // Mostrar registros encontrados
    console.log('Registros encontrados:');
    console.log('─'.repeat(100));
    registros.forEach((reg, index) => {
      console.log(`${index + 1}. ID: ${reg.id} | Cliente ID: ${reg.cliente_id}`);
      console.log(`   Nome: ${reg.nome || '(vazio)'}`);
      console.log(`   CPF: ${reg.cpf || '(vazio)'}`);
      console.log(`   Qualificação: ${reg.qual || '(vazio)'}`);
      console.log(`   Participação: ${reg.participacao_percentual || '(vazio)'}%`);
      console.log('');
    });
    console.log('─'.repeat(100));

    // Confirmar exclusão
    console.log(`⚠️  ATENÇÃO: ${registros.length} registro(s) será(ão) excluído(s) permanentemente.`);
    console.log('Deseja continuar? (Esta ação não pode ser desfeita)');
    console.log('Para confirmar, execute novamente com o flag --confirm');
    
    // Verificar se foi passado o flag --confirm
    const args = process.argv.slice(2);
    const confirmar = args.includes('--confirm') || args.includes('-y');
    
    if (!confirmar) {
      console.log('\n❌ Execução cancelada. Use --confirm ou -y para confirmar a exclusão.');
      console.log('Exemplo: node scripts/excluir_socios_qualif_resp.js --confirm');
      return;
    }

    // Excluir registros
    console.log('\n🗑️  Excluindo registros...');
    
    const [result] = await connection.execute(`
      DELETE FROM clientes_socios
      WHERE 
        UPPER(nome) LIKE '%QUALIF%RESP%' OR
        UPPER(qual) LIKE '%QUALIF%RESP%' OR
        nome LIKE '%Qualif. Resp%' OR
        qual LIKE '%Qualif. Resp%'
    `);

    console.log(`✅ ${result.affectedRows} registro(s) excluído(s) com sucesso!`);

    // Verificar se ainda há registros
    const [verificacao] = await connection.execute(`
      SELECT COUNT(*) as total
      FROM clientes_socios
      WHERE 
        UPPER(nome) LIKE '%QUALIF%RESP%' OR
        UPPER(qual) LIKE '%QUALIF%RESP%' OR
        nome LIKE '%Qualif. Resp%' OR
        qual LIKE '%Qualif. Resp%'
    `);

    if (verificacao[0].total === 0) {
      console.log('✅ Confirmação: Nenhum registro com "Qualif. Resp." restante no banco.');
    } else {
      console.log(`⚠️  Ainda existem ${verificacao[0].total} registro(s) com "Qualif. Resp."`);
    }

  } catch (error) {
    console.error('❌ Erro ao executar script:', error);
    if (error.code) {
      console.error(`   Código do erro: ${error.code}`);
    }
    if (error.sqlMessage) {
      console.error(`   Mensagem SQL: ${error.sqlMessage}`);
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Conexão com MySQL fechada.');
    }
  }
}

// Executar script
excluirSociosComQualifResp()
  .then(() => {
    console.log('\n✅ Script concluído com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });










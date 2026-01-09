/**
 * Script para verificar se todas as matrizes estão sendo listadas na aba Participação
 * 
 * Uso: node scripts/verificar_matrizes_participacao.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function verificarMatrizes() {
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

    // Buscar total de clientes
    const [totalRows] = await connection.execute('SELECT COUNT(*) as total FROM clientes');
    const totalClientes = totalRows[0].total;
    console.log(`📊 Total de clientes no banco: ${totalClientes}\n`);

    // Buscar todas as matrizes usando o campo tipo_empresa
    const [matrizesRows] = await connection.execute(`
      SELECT 
        id,
        cnpj_limpo,
        razao_social,
        tipo_empresa,
        CASE 
          WHEN LENGTH(cnpj_limpo) = 14 THEN SUBSTRING(cnpj_limpo, 9, 4)
          ELSE NULL
        END as sufixo_filial
      FROM clientes
      WHERE tipo_empresa = 'Matriz'
      ORDER BY razao_social
    `);

    console.log(`📋 Total de matrizes encontradas (tipo_empresa = 'Matriz'): ${matrizesRows.length}\n`);

    // Buscar clientes que NÃO são matrizes (para comparação)
    const [naoMatrizesRows] = await connection.execute(`
      SELECT 
        COUNT(*) as total,
        SUBSTRING(cnpj_limpo, 9, 4) as sufixo,
        COUNT(*) as quantidade
      FROM clientes
      WHERE LENGTH(cnpj_limpo) = 14
        AND SUBSTRING(cnpj_limpo, 9, 4) != '0001'
      GROUP BY SUBSTRING(cnpj_limpo, 9, 4)
      ORDER BY quantidade DESC
      LIMIT 10
    `);

    console.log('📊 Top 10 sufixos de filiais (não matrizes):');
    naoMatrizesRows.forEach((row, index) => {
      console.log(`   ${index + 1}. Sufixo ${row.sufixo}: ${row.quantidade} cliente(s)`);
    });
    console.log('');

    // Verificar se há clientes sem CNPJ válido
    const [semCnpjValido] = await connection.execute(`
      SELECT COUNT(*) as total
      FROM clientes
      WHERE cnpj_limpo IS NULL 
        OR cnpj_limpo = ''
        OR LENGTH(cnpj_limpo) != 14
    `);
    console.log(`⚠️  Clientes sem CNPJ válido (14 dígitos): ${semCnpjValido[0].total}\n`);

    // Verificar clientes com tipo_empresa = 'Matriz' vs detecção por CNPJ
    const [tipoMatrizRows] = await connection.execute(`
      SELECT COUNT(*) as total
      FROM clientes
      WHERE tipo_empresa = 'Matriz'
    `);
    console.log(`📋 Clientes com tipo_empresa = 'Matriz': ${tipoMatrizRows[0].total}`);

    // Verificar matrizes com diferentes sufixos de CNPJ (para informação)
    const [matrizesPorSufixo] = await connection.execute(`
      SELECT 
        SUBSTRING(cnpj_limpo, 9, 4) as sufixo,
        COUNT(*) as quantidade
      FROM clientes
      WHERE tipo_empresa = 'Matriz'
        AND LENGTH(cnpj_limpo) = 14
      GROUP BY SUBSTRING(cnpj_limpo, 9, 4)
      ORDER BY quantidade DESC
      LIMIT 10
    `);

    if (matrizesPorSufixo.length > 0) {
      console.log('\n📊 Distribuição de matrizes por sufixo de CNPJ:');
      matrizesPorSufixo.forEach((row, index) => {
        console.log(`   ${index + 1}. Sufixo ${row.sufixo}: ${row.quantidade} matriz(es)`);
      });
    }

    // Mostrar algumas matrizes como exemplo
    console.log('\n📋 Exemplos de matrizes encontradas (primeiras 10):');
    matrizesRows.slice(0, 10).forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.razao_social || 'Sem nome'}`);
      console.log(`      CNPJ: ${row.cnpj_limpo}, Tipo: ${row.tipo_empresa || 'NULL'}`);
    });

    // Contar filiais
    const [filiaisRows] = await connection.execute(`
      SELECT COUNT(*) as total FROM clientes WHERE tipo_empresa = 'Filial'
    `);
    const totalFiliais = filiaisRows[0].total;
    const totalSemTipo = totalClientes - matrizesRows.length - totalFiliais;
    
    console.log('\n✅ Verificação concluída!');
    console.log(`\n📊 Resumo:`);
    console.log(`   - Total de clientes: ${totalClientes}`);
    console.log(`   - Matrizes (tipo_empresa = 'Matriz'): ${matrizesRows.length}`);
    console.log(`   - Filiais (tipo_empresa = 'Filial'): ${totalFiliais}`);
    console.log(`   - Sem tipo definido (NULL): ${totalSemTipo}`);

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
verificarMatrizes()
  .then(() => {
    console.log('\n✅ Script concluído com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });


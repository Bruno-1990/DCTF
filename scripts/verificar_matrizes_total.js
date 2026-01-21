require('dotenv').config();
const mysql = require('mysql2/promise');

async function verificarMatrizes() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE
    });

    // Total de clientes
    const [totalRows] = await connection.execute('SELECT COUNT(*) as total FROM clientes');
    console.log('📊 Total de clientes no banco:', totalRows[0].total);

    // Total de matrizes
    const [matrizRows] = await connection.execute("SELECT COUNT(*) as total FROM clientes WHERE tipo_empresa = 'Matriz'");
    console.log('📊 Total de matrizes (tipo_empresa = "Matriz"):', matrizRows[0].total);

    // Total de filiais
    const [filialRows] = await connection.execute("SELECT COUNT(*) as total FROM clientes WHERE tipo_empresa = 'Filial'");
    console.log('📊 Total de filiais (tipo_empresa = "Filial"):', filialRows[0].total);

    // Total com tipo_empresa NULL
    const [nullRows] = await connection.execute('SELECT COUNT(*) as total FROM clientes WHERE tipo_empresa IS NULL');
    console.log('📊 Total com tipo_empresa NULL:', nullRows[0].total);

    // Verificar se há matrizes com CNPJ terminando em 0001 mas tipo_empresa não é "Matriz"
    const [matrizes0001] = await connection.execute(`
      SELECT COUNT(*) as total 
      FROM clientes 
      WHERE SUBSTRING(cnpj_limpo, 9, 4) = '0001' 
        AND (tipo_empresa IS NULL OR tipo_empresa != 'Matriz')
    `);
    console.log('📊 Matrizes potenciais (0001) sem tipo_empresa = "Matriz":', matrizes0001[0].total);

    // Listar algumas matrizes para verificar
    const [exemplos] = await connection.execute(`
      SELECT id, razao_social, cnpj_limpo, tipo_empresa 
      FROM clientes 
      WHERE tipo_empresa = 'Matriz' 
      LIMIT 5
    `);
    console.log('\n📋 Exemplos de matrizes:');
    exemplos.forEach((row, i) => {
      console.log(`  ${i + 1}. ${row.razao_social} - CNPJ: ${row.cnpj_limpo} - Tipo: ${row.tipo_empresa}`);
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

verificarMatrizes();










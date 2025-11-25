import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config();

async function checkDCTFData() {
  let connection;
  try {
    connection = await createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'dctf_web',
    });

    console.log('✅ Conectado ao MySQL');

    // Verificar total de declarações
    const [countRows] = await connection.execute(
      'SELECT COUNT(*) as total FROM dctf_declaracoes'
    ) as any;
    console.log(`\n📊 Total de declarações DCTF: ${countRows[0].total}`);

    // Verificar estrutura da tabela primeiro
    const [columns] = await connection.execute(
      'DESCRIBE dctf_declaracoes'
    ) as any;
    console.log('\n📋 Colunas da tabela dctf_declaracoes:');
    columns.forEach((col: any) => {
      console.log(`  - ${col.Field} (${col.Type})`);
    });

    // Buscar algumas declarações de exemplo
    const [sampleRows] = await connection.execute(
      'SELECT * FROM dctf_declaracoes LIMIT 3'
    ) as any;
    
    if (Array.isArray(sampleRows) && sampleRows.length > 0) {
      console.log('\n📋 Exemplos de declarações:');
      sampleRows.forEach((row: any, index: number) => {
        console.log(`\n  ${index + 1}. ID: ${row.id}`);
        console.log(`     Cliente ID: ${row.cliente_id || 'N/A'}`);
        console.log(`     Período: ${row.periodo || 'N/A'}`);
        console.log(`     Status: ${row.status || 'N/A'}`);
        console.log(`     Situação: ${row.situacao || 'N/A'}`);
        console.log(`     Data Declaração: ${row.data_declaracao || 'N/A'}`);
        console.log(`     Criado em: ${row.created_at || 'N/A'}`);
      });
    } else {
      console.log('\n⚠️  Nenhuma declaração encontrada na tabela');
    }

    // Verificar se há clientes relacionados
    const [clientCount] = await connection.execute(
      'SELECT COUNT(DISTINCT cliente_id) as total FROM dctf_declaracoes WHERE cliente_id IS NOT NULL'
    ) as any;
    console.log(`\n👥 Total de clientes únicos com declarações: ${clientCount[0].total}`);

  } catch (error) {
    console.error('❌ Erro ao verificar dados:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n✅ Conexão encerrada');
    }
  }
}

checkDCTFData();


/**
 * Verifica clientes sem endereço de pasta (nome_pasta_rede nulo ou vazio).
 * Uso: npm run verificar:sem-pasta-rede  ou  npx ts-node src/scripts/verificar-clientes-sem-pasta-rede.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

const projectRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(projectRoot, '.env') });

async function main() {
  const { getConnection } = await import('../config/mysql');
  let connection;
  try {
    connection = await getConnection();
  } catch (e) {
    console.error('Erro ao conectar MySQL. Verifique .env (MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE).');
    process.exit(1);
  }

  try {
    const [rows] = await connection.execute(
      `SELECT id, cnpj_limpo, razao_social, nome_pasta_rede
       FROM clientes
       WHERE nome_pasta_rede IS NULL OR TRIM(nome_pasta_rede) = ''
       ORDER BY razao_social`
    );
    const list = rows as { id: string; cnpj_limpo: string; razao_social: string; nome_pasta_rede: string | null }[];
    const total = list.length;

    console.log('\n========================================');
    console.log('CLIENTES SEM ENDEREÇO DE PASTA (Rede)');
    console.log('========================================');
    console.log(`Total: ${total} cliente(s)\n`);

    if (total === 0) {
      console.log('Nenhum cliente sem pasta.\n');
      return;
    }

    console.log('--- Listagem ---\n');
    list.forEach((c, i) => {
      console.log(`${i + 1}. [${c.cnpj_limpo || '-'}] ${c.razao_social || '-'}`);
    });
    console.log('\n========================================\n');
  } finally {
    connection.release();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

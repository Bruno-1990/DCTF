/**
 * Lista empresas (clientes) cadastradas sem regime tributário.
 * Uso: npm run verificar:sem-regime-tributario  ou  npx ts-node src/scripts/verificar-clientes-sem-regime-tributario.ts
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
      `SELECT id, cnpj_limpo, razao_social, regime_tributario
       FROM clientes
       WHERE regime_tributario IS NULL OR TRIM(COALESCE(regime_tributario, '')) = ''
       ORDER BY razao_social`
    );
    const list = rows as { id: string; cnpj_limpo: string; razao_social: string; regime_tributario: string | null }[];
    const total = list.length;

    console.log('\n========================================');
    console.log('EMPRESAS SEM REGIME TRIBUTÁRIO');
    console.log('========================================');
    console.log(`Total: ${total} empresa(s)\n`);

    if (total === 0) {
      console.log('Nenhuma empresa sem regime tributário cadastrado.\n');
      return;
    }

    console.log('--- Listagem ---\n');
    list.forEach((c, i) => {
      const cnpj = c.cnpj_limpo || '-';
      const razao = c.razao_social || '-';
      console.log(`${i + 1}. [${cnpj}] ${razao}`);
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

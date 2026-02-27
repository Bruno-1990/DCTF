/**
 * Verifica se há inserções ou alterações hoje em dctf_declaracoes.
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { executeQuery } from '../config/mysql';

async function main() {
  const hoje = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  console.log('\nData de hoje (servidor):', hoje);
  console.log('Tabela: dctf_declaracoes\n');

  const [inseridos] = await executeQuery<{ total: number }>(
    'SELECT COUNT(*) AS total FROM dctf_declaracoes WHERE DATE(created_at) = ?',
    [hoje]
  );
  const [modificados] = await executeQuery<{ total: number }>(
    `SELECT COUNT(*) AS total FROM dctf_declaracoes 
     WHERE DATE(updated_at) = ? AND DATE(created_at) < ?`,
    [hoje, hoje]
  );

  const nIns = Number(inseridos?.total ?? 0);
  const nMod = Number(modificados?.total ?? 0);

  console.log('Inseridos hoje (created_at):', nIns);
  console.log('Modificados hoje (updated_at, criados antes):', nMod);
  console.log('\nExiste alteração feita hoje?', nIns > 0 || nMod > 0 ? 'Sim' : 'Não');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

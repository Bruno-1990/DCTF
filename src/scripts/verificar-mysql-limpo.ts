/**
 * Verifica se o MySQL está limpo (tabelas dctf_declaracoes e dctf_dados vazias).
 * Uso: npx ts-node src/scripts/verificar-mysql-limpo.ts
 */

import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import { executeQuery } from '../config/mysql';

async function main() {
  console.log('\n=== Verificação MySQL (limpo?) ===\n');

  try {
    const [declaracoes] = await executeQuery<{ total: number }>(
      'SELECT COUNT(*) AS total FROM dctf_declaracoes'
    );
    const [dados] = await executeQuery<{ total: number }>(
      'SELECT COUNT(*) AS total FROM dctf_dados'
    );

    const nDeclaracoes = Number(declaracoes?.total ?? 0);
    const nDados = Number(dados?.total ?? 0);

    console.log('dctf_declaracoes:', nDeclaracoes, 'registros');
    console.log('dctf_dados:      ', nDados, 'registros');
    console.log('');

    if (nDeclaracoes === 0 && nDados === 0) {
      console.log('✅ MySQL está limpo (zero registros nas duas tabelas).');
    } else {
      console.log('❌ MySQL NÃO está limpo:');
      if (nDeclaracoes > 0) console.log(`   - dctf_declaracoes: ${nDeclaracoes} registro(s)`);
      if (nDados > 0) console.log(`   - dctf_dados: ${nDados} registro(s)`);
    }
    console.log('');
  } catch (err: any) {
    console.error('Erro ao consultar MySQL:', err.message);
    process.exit(1);
  }
  process.exit(0);
}

main();

/**
 * Verifica se um CNPJ existe na tabela dctf_declaracoes.
 * Uso: npx ts-node src/scripts/verificar-cnpj-dctf.ts 57887103000132
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { executeQuery } from '../config/mysql';

const cnpj = process.argv[2] || '57887103000132';
const cnpjLimpo = cnpj.replace(/\D/g, '');

async function main() {
  const rows = await executeQuery<{ id: string; cnpj: string; periodo_apuracao: string; data_transmissao: string; created_at: string }>(
    `SELECT id, cnpj, periodo_apuracao, data_transmissao, created_at 
     FROM dctf_declaracoes 
     WHERE cnpj = ? OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-',''),' ','') = ?`,
    [cnpjLimpo, cnpjLimpo]
  );
  console.log('\nCNPJ:', cnpj, '| Limpo:', cnpjLimpo);
  console.log('Registros em dctf_declaracoes:', rows.length);
  if (rows.length > 0) {
    console.log(JSON.stringify(rows, null, 2));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

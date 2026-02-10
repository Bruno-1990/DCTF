/**
 * Remove do MySQL todos os registros do CNPJ 57887103000132 exceto os 5 oficiais (Receita Federal).
 * Execute: npx ts-node scripts/delete-cnpj-oficiais-mysql.ts
 * Requer: .env com MYSQL_* configurado.
 */

import 'dotenv/config';
import { getConnection } from '../src/config/mysql';

const CNPJ = '57887103000132';

// Os 5 registros oficiais (tela Receita Federal): período, origem, tipo, situação, débito, saldo
const OFICIAIS = [
  { periodo: '12/2025', origem: 'MIT', tipo: 'Original', situacao: 'Ativa', debito: 16094.39, saldo: 16094.39 },
  { periodo: '11/2025', origem: 'MIT', tipo: 'Original', situacao: 'Ativa', debito: 2190, saldo: 2190 },
  { periodo: '10/2025', origem: 'REINF CP, REINF RET, MIT', tipo: 'Retificadora', situacao: 'Ativa', debito: 1022, saldo: 1022 },
  { periodo: '09/2025', origem: 'MIT', tipo: 'Original', situacao: 'Ativa', debito: 21004.1, saldo: 21004.1 },
  { periodo: '07/2025', origem: 'REINF RET, MIT', tipo: 'Retificadora', situacao: 'Ativa', debito: 2759.95, saldo: 2759.95 },
];

async function main() {
  console.log('='.repeat(60));
  console.log('MySQL: manter apenas 5 registros oficiais para CNPJ', CNPJ);
  console.log('='.repeat(60));

  const connection = await getConnection();

  try {
    // 1. Contar antes
    const [countBefore] = await connection.execute<{ total: number }[]>(
      'SELECT COUNT(*) AS total FROM dctf_declaracoes WHERE cnpj = ?',
      [CNPJ]
    );
    const totalAntes = (countBefore as any[])[0]?.total ?? 0;
    console.log('\nRegistros antes:', totalAntes);

    // 2. IDs a manter: um por chave oficial (o mais recente por created_at)
    const idsToKeep: (string | number)[] = [];
    for (const of of OFICIAIS) {
      const [rows] = await connection.execute<any[]>(
        `SELECT id FROM dctf_declaracoes
         WHERE cnpj = ?
           AND periodo_apuracao = ?
           AND COALESCE(origem,'') = ?
           AND COALESCE(tipo,'') = ?
           AND COALESCE(situacao,'') = ?
           AND COALESCE(debito_apurado,0) = ?
           AND COALESCE(saldo_a_pagar,0) = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [CNPJ, of.periodo, of.origem, of.tipo, of.situacao, of.debito, of.saldo]
      );
      if (Array.isArray(rows) && rows.length > 0 && rows[0].id) {
        idsToKeep.push(rows[0].id);
      }
    }

    console.log('IDs a manter (1 por oficial):', idsToKeep.length, idsToKeep);

    if (idsToKeep.length === 0) {
      console.log('\nNenhum registro oficial encontrado no MySQL para este CNPJ.');
      console.log('Nada a excluir.');
      return;
    }

    // 3. Deletar todos os demais para este CNPJ
    const placeholders = idsToKeep.map(() => '?').join(',');
    const [result] = await connection.execute(
      `DELETE FROM dctf_declaracoes WHERE cnpj = ? AND id NOT IN (${placeholders})`,
      [CNPJ, ...idsToKeep]
    );
    const deleted = (result as any).affectedRows ?? 0;
    console.log('\nRegistros excluídos:', deleted);

    // 4. Contar depois
    const [countAfter] = await connection.execute<{ total: number }[]>(
      'SELECT COUNT(*) AS total FROM dctf_declaracoes WHERE cnpj = ?',
      [CNPJ]
    );
    const totalDepois = (countAfter as any[])[0]?.total ?? 0;
    console.log('Registros após limpeza:', totalDepois);
    console.log('\nConcluído.');
  } finally {
    connection.release();
  }
}

main().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});

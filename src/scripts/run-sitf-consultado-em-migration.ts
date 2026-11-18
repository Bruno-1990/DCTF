/**
 * Aplica a migration 058 (sitf_downloads.consultado_em).
 *
 * Idempotente: só cria a coluna se ela não existir, e o preenchimento só toca linhas
 * com consultado_em vazio.
 *
 * Uso: npm run migrate:sitf-consultado-em
 */
import * as path from 'path';
import * as dotenv from 'dotenv';

// Antes de importar o pool: config/mysql lê process.env na carga do módulo.
dotenv.config({ path: path.join(process.cwd(), '.env') });

// eslint-disable-next-line import/first
import { mysqlPool } from '../config/mysql';

async function run(): Promise<void> {
  const connection = await mysqlPool.getConnection();
  try {
    const [cols]: any = await connection.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sitf_downloads' AND COLUMN_NAME = 'consultado_em'`,
    );
    if (Number(cols[0].n) === 0) {
      await connection.query(
        "ALTER TABLE sitf_downloads ADD COLUMN consultado_em DATETIME NULL COMMENT 'Quando o relatório foi obtido do SERPRO (a vigência da Situação Fiscal)'",
      );
      console.log('OK: coluna sitf_downloads.consultado_em criada');
    } else {
      console.log('Coluna sitf_downloads.consultado_em já existe');
    }

    const [upd]: any = await connection.query(
      `UPDATE sitf_downloads d
         LEFT JOIN sitf_protocols p ON p.cnpj = d.cnpj AND p.expires_at IS NOT NULL
          SET d.consultado_em = GREATEST(d.created_at, COALESCE(DATE_SUB(p.expires_at, INTERVAL 1 DAY), d.created_at))
        WHERE d.consultado_em IS NULL`,
    );
    console.log(`OK: ${upd.affectedRows} linha(s) preenchida(s) com a data estimada`);

    const [porMes]: any = await connection.query(
      `SELECT DATE_FORMAT(consultado_em, '%Y-%m') AS mes, COUNT(*) AS n
         FROM sitf_downloads GROUP BY mes ORDER BY mes`,
    );
    console.log('\n=== consultas por mês ===');
    for (const l of porMes) console.log(`${l.mes ?? '(vazio)'}: ${l.n}`);
  } finally {
    connection.release();
    await mysqlPool.end();
  }
}

run().catch((e) => {
  console.error('Falha na migration 058:', e);
  process.exit(1);
});

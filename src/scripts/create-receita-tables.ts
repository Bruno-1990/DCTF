/**
 * Script de tabelas Receita Federal (receita_pagamentos) descontinuado.
 * A aba Pagamentos foi removida; as tabelas receita_pagamentos, receita_sincronizacoes
 * e receita_erros_consulta devem ser removidas com a migração 018_drop_receita_pagamentos.sql.
 *
 * Para dropar as tabelas em ambientes que ainda as possuem, execute:
 *   docs/migrations/mysql/018_drop_receita_pagamentos.sql
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function main() {
  console.log('⚠️  Tabelas de receita_pagamentos foram descontinuadas.');
  console.log('   Use a migração 018_drop_receita_pagamentos.sql para removê-las do banco.');
  process.exit(0);
}

main();

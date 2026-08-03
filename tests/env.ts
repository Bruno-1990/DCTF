/**
 * Carrega o .env ANTES de qualquer módulo de teste ser avaliado.
 *
 * POR QUE ISSO EXISTE: `src/config/mysql.ts` lê `process.env` no instante em
 * que é importado (as constantes são de nível de módulo). Sem as variáveis, ele
 * cai nos padrões `user: 'root'` e `password: ''` — e o MySQL responde
 * "Access denied for user 'root'@'localhost' (using password: NO)". Onze suítes
 * morriam assim, na importação, antes de rodar um único teste.
 *
 * A aplicação nunca sofreu disso porque o `src/index.ts` chama `dotenv.config()`
 * antes de tudo. Os testes não têm esse ponto de entrada.
 *
 * Entra em `setupFiles` (e não em `setupFilesAfterEach`) de propósito: só o
 * `setupFiles` roda antes da avaliação do arquivo de teste, que é quando as
 * importações acontecem. No `setupFilesAfterEnv` seria tarde — o pool já teria
 * nascido sem credencial.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

/**
 * TRAVA DE SEGURANÇA — o banco de teste é outro, por padrão.
 *
 * Isto NÃO é zelo teórico: assim que o .env passou a ser carregado, uma rodada
 * de `npm test` cadastrou um "Cliente Teste" de verdade na base de produção
 * (tests/models/Cliente.test.ts chama createCliente com dados válidos). Excluir
 * pasta por pasta não resolve — basta alguém escrever amanhã mais um teste que
 * grave, em qualquer lugar, e a base suja de novo.
 *
 * Aqui a proteção é estrutural: o nome do banco vira `<banco>_TEST`, que não
 * existe. Teste que tente gravar falha na cara — alto e claro — em vez de
 * poluir dado real em silêncio.
 *
 * Para rodar de fato contra um banco (integração), aponte explicitamente:
 *     MYSQL_DATABASE=DCTF_WEB_TEST DCTF_ALLOW_DB=1 npm run test:integration
 */
if (process.env['DCTF_ALLOW_DB'] !== '1') {
  const real = process.env['MYSQL_DATABASE'] || 'dctf_web';
  process.env['MYSQL_DATABASE'] = real.endsWith('_TEST') ? real : `${real}_TEST`;
}

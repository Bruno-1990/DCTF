/**
 * Conexão read-only com o OneClick de PRODUÇÃO (PostgreSQL na VPS).
 * Banco `oneclick`, schema `public`, tabela `public.clientes`.
 * Usado para sincronizar clientes Mensais/Ativos com o DCTF_WEB.
 *
 * A porta do Postgres de prod fica em 127.0.0.1:54322 na VPS (só localhost);
 * o host do DCTF alcança via túnel SSH (ver docs/plano-sync-oneclick-v2.md).
 * Por isso o padrão de host é 127.0.0.1 e a porta 54322.
 */

import { Pool, type PoolConfig } from 'pg';

const host = process.env['ONECLICK_PG_HOST'];
const user = process.env['ONECLICK_PG_USER'];
const database = process.env['ONECLICK_PG_DATABASE'];

let oneClickPool: Pool | null = null;

/**
 * Retorna o pool de conexão com o OneClick (PostgreSQL).
 * Cria o pool sob demanda (lazy) para não falhar se as vars não estiverem configuradas.
 */
export function getOneClickPool(): Pool {
  if (oneClickPool) return oneClickPool;

  if (!host || !user || !database) {
    throw new Error(
      'Variáveis ONECLICK_PG_HOST, ONECLICK_PG_USER e ONECLICK_PG_DATABASE são obrigatórias para conectar ao OneClick (PostgreSQL de produção).',
    );
  }

  const config: PoolConfig = {
    host,
    port: parseInt(process.env['ONECLICK_PG_PORT'] || '54322', 10),
    user,
    password: process.env['ONECLICK_PG_PASSWORD'] || '',
    database,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // schema `public` é o default; nenhum search_path especial é necessário.
  };

  oneClickPool = new Pool(config);
  return oneClickPool;
}

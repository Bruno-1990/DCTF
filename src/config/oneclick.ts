/**
 * Conexão read-only com o banco OneClick (db_intranet)
 * Usado para sincronizar clientes Mensais/Ativos com o DCTF_WEB
 */

import mysql, { Pool, PoolOptions } from 'mysql2/promise';

const host = process.env['ONECLICK_MYSQL_HOST'];
const user = process.env['ONECLICK_MYSQL_USER'];
const password = process.env['ONECLICK_MYSQL_PASSWORD'];
const database = process.env['ONECLICK_MYSQL_DATABASE'];

let oneClickPool: Pool | null = null;

/**
 * Retorna o pool de conexão com o OneClick.
 * Cria o pool sob demanda (lazy) para não falhar se as vars não estiverem configuradas.
 */
export function getOneClickPool(): Pool {
  if (oneClickPool) return oneClickPool;

  if (!host || !user || !database) {
    throw new Error(
      'Variáveis ONECLICK_MYSQL_HOST, ONECLICK_MYSQL_USER e ONECLICK_MYSQL_DATABASE são obrigatórias para conectar ao OneClick.'
    );
  }

  const opts: PoolOptions = {
    host,
    port: parseInt(process.env['ONECLICK_MYSQL_PORT'] || '3306', 10),
    user,
    password: password || '',
    database,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 3,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  };

  oneClickPool = mysql.createPool(opts);
  return oneClickPool;
}

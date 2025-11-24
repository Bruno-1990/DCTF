/**
 * Configuração e conexão com banco de dados MySQL
 */

import mysql, { Pool, PoolConnection, PoolOptions } from 'mysql2/promise';
import config from './index';

// Interface para configuração do MySQL
interface MySQLConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  charset?: string;
  timezone?: string;
  connectionLimit?: number;
}

// Configuração do MySQL a partir de variáveis de ambiente
const mysqlConfig: MySQLConfig = {
  host: process.env['MYSQL_HOST'] || 'localhost',
  port: parseInt(process.env['MYSQL_PORT'] || '3306', 10),
  user: process.env['MYSQL_USER'] || 'root',
  password: process.env['MYSQL_PASSWORD'] || '',
  database: process.env['MYSQL_DATABASE'] || 'dctf_web',
  charset: 'utf8mb4',
  timezone: '+00:00',
  connectionLimit: parseInt(process.env['MYSQL_CONNECTION_LIMIT'] || '10', 10),
};

// Verificar se as variáveis estão definidas e avisar o usuário
if (!mysqlConfig.host || !mysqlConfig.user || !mysqlConfig.database) {
  console.warn('⚠️  MYSQL_HOST, MYSQL_USER ou MYSQL_DATABASE não estão definidas.');
  console.warn('   Configure as variáveis de ambiente para conectar ao MySQL.');
}

// Pool de conexões MySQL
const poolOptions: PoolOptions = {
  host: mysqlConfig.host,
  port: mysqlConfig.port,
  user: mysqlConfig.user,
  password: mysqlConfig.password,
  database: mysqlConfig.database,
  charset: mysqlConfig.charset,
  timezone: mysqlConfig.timezone,
  waitForConnections: true,
  connectionLimit: mysqlConfig.connectionLimit,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

// Criar pool de conexões
export const mysqlPool: Pool = mysql.createPool(poolOptions);

// Função para testar conexão
export const testMySQLConnection = async (): Promise<boolean> => {
  try {
    const connection = await mysqlPool.getConnection();
    await connection.ping();
    connection.release();
    console.log('✅ Conexão com MySQL estabelecida com sucesso');
    return true;
  } catch (error) {
    console.error('❌ Erro ao conectar com MySQL:', error);
    return false;
  }
};

// Função para executar query
export const executeQuery = async <T = any>(
  query: string,
  params?: any[]
): Promise<T[]> => {
  try {
    const [rows] = await mysqlPool.execute(query, params);
    return rows as T[];
  } catch (error) {
    console.error('Erro ao executar query:', error);
    throw error;
  }
};

// Função para executar transação
export const executeTransaction = async <T>(
  callback: (connection: PoolConnection) => Promise<T>
): Promise<T> => {
  const connection = await mysqlPool.getConnection();
  await connection.beginTransaction();

  try {
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Função para obter conexão do pool (para uso direto)
export const getConnection = async (): Promise<PoolConnection> => {
  return await mysqlPool.getConnection();
};

// Fechar pool ao encerrar aplicação
process.on('SIGINT', async () => {
  await mysqlPool.end();
  console.log('🔌 Pool de conexões MySQL fechado');
});

process.on('SIGTERM', async () => {
  await mysqlPool.end();
  console.log('🔌 Pool de conexões MySQL fechado');
});

// Log de configuração (apenas em dev)
if (process.env['NODE_ENV'] === 'development') {
  console.log('🔐 MySQL configurado:');
  console.log('   - Host:', mysqlConfig.host);
  console.log('   - Port:', mysqlConfig.port);
  console.log('   - Database:', mysqlConfig.database);
  console.log('   - User:', mysqlConfig.user);
  console.log('   - Connection Limit:', mysqlConfig.connectionLimit);
}

export default mysqlPool;


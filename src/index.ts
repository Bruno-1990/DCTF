/**
 * Arquivo principal da aplicação DCTF
 * Ponto de entrada do sistema
 */

// Carregar variáveis de ambiente do arquivo .env
import 'dotenv/config';

import Server from './server';
import config from './config';

console.log('🚀 Iniciando aplicação DCTF...');
console.log(`📊 Ambiente: ${config.nodeEnv}`);
console.log(`🔌 Porta: ${config.port}`);

// Inicializar servidor
const server = new Server();

// Iniciar servidor
server.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

export default server;

/**
 * Arquivo principal da aplicação DCTF
 * Ponto de entrada do sistema
 */

// Carregar variáveis de ambiente do arquivo .env
import 'dotenv/config';

import Server from './server';
import config from './config';

// Processar argumentos da linha de comando
const args = process.argv.slice(2);
let customPort: number | undefined;
let customHost: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    customPort = parseInt(args[i + 1], 10);
  }
  if (args[i] === '--host' && args[i + 1]) {
    customHost = args[i + 1];
  }
}

console.log('🚀 Iniciando aplicação DCTF...');
console.log(`📁 Arquivo executado: ${__filename}`);
console.log(`📂 Diretório: ${__dirname}`);
if (__filename.includes('src')) {
  console.log('✅ Usando arquivos FONTE (src/) - Correto para desenvolvimento!');
} else if (__filename.includes('dist')) {
  console.log('⚠️  Usando arquivos COMPILADOS (dist/) - Use npm run dev para desenvolvimento!');
}
console.log(`📊 Ambiente: ${config.nodeEnv}`);
console.log(`🔌 Porta: ${customPort || config.port}${customPort ? ' (customizada via --port)' : ''}`);
if (customHost) {
  console.log(`🌐 Host: ${customHost} (customizado via --host)`);
}

// Inicializar servidor com porta customizada se fornecida
const server = new Server(customPort);

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

/**
 * Configurações principais do projeto DCTF
 * Centraliza todas as configurações de ambiente e constantes
 */

export interface AppConfig {
  port: number;
  nodeEnv: string;
  database: {
    url: string;
    apiKey: string;
  };
  upload: {
    maxFileSize: number;
    allowedTypes: string[];
  };
}

const config: AppConfig = {
  port: parseInt(process.env['PORT'] || '3000', 10),
  nodeEnv: process.env['NODE_ENV'] || 'development',
  database: {
    url: process.env['SUPABASE_URL'] || '',
    apiKey: process.env['SUPABASE_ANON_KEY'] || '',
  },
  upload: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['.xls', '.xlsx', '.csv'],
  },
};

export default config;

/**
 * Configuração do banco de dados Supabase
 */

import { createClient } from '@supabase/supabase-js';
import config from './index';

// Interface para configuração do Supabase
interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

// Configuração do Supabase
const supabaseConfig: SupabaseConfig = {
  url: config.database.url || 'https://placeholder.supabase.co',
  anonKey: config.database.apiKey || 'placeholder-key',
  serviceRoleKey: process.env['SUPABASE_SERVICE_ROLE_KEY'],
};

// Verificar se as variáveis estão definidas e avisar o usuário
if (!config.database.url || (!config.database.apiKey && !supabaseConfig.serviceRoleKey)) {
  console.warn('⚠️  SUPABASE_URL e SUPABASE_ANON_KEY (ou SUPABASE_SERVICE_ROLE_KEY) não estão definidas.');
  console.warn('   Configure as variáveis de ambiente para conectar ao Supabase.');
  console.warn('   Consulte docs/SUPABASE_SETUP.md para instruções.');
}

// Cliente Supabase para operações públicas
export const supabase = createClient(
  supabaseConfig.url,
  supabaseConfig.anonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  }
);

// Cliente Supabase para operações administrativas (com service role)
export const supabaseAdmin = supabaseConfig.serviceRoleKey
  ? createClient(
      supabaseConfig.url,
      supabaseConfig.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  : null;

// Log de qual cliente está sendo usado (apenas em dev)
if (process.env['NODE_ENV'] === 'development') {
  console.log('🔐 Supabase configurado:');
  console.log('   - anon key:', supabaseConfig.anonKey ? '✅ Definida' : '❌ Não definida');
  console.log('   - service_role key:', supabaseConfig.serviceRoleKey ? '✅ Definida' : '❌ Não definida');
  console.log('   - usando:', supabaseAdmin ? 'service_role (admin)' : 'anon (public)');
}

// Função para testar conexão
export const testConnection = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('_test_connection')
      .select('*')
      .limit(1);
    
    if (error && error.code !== 'PGRST116') {
      console.error('Erro na conexão com Supabase:', error);
      return false;
    }
    
    console.log('✅ Conexão com Supabase estabelecida com sucesso');
    return true;
  } catch (error) {
    console.error('❌ Erro ao conectar com Supabase:', error);
    return false;
  }
};

export default supabase;

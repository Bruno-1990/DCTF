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

// Verificar se as variáveis estão definidas
// Se não estiverem, Supabase está desabilitado (aplicação usa MySQL)
const SUPABASE_ENABLED = config.database.url && (config.database.apiKey || supabaseConfig.serviceRoleKey);

if (!SUPABASE_ENABLED) {
  console.log('ℹ️  Supabase desabilitado - aplicação usando MySQL');
}

// Cliente Supabase para operações públicas (criado apenas se habilitado)
export const supabase = SUPABASE_ENABLED
  ? createClient(
      supabaseConfig.url,
      supabaseConfig.anonKey,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
        },
      }
    )
  : null;

// Cliente Supabase para operações administrativas (criado apenas se habilitado)
export const supabaseAdmin = (SUPABASE_ENABLED && supabaseConfig.serviceRoleKey)
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
  if (SUPABASE_ENABLED) {
    console.log('🔐 Supabase configurado:');
    console.log('   - anon key:', supabaseConfig.anonKey ? '✅ Definida' : '❌ Não definida');
    console.log('   - service_role key:', supabaseConfig.serviceRoleKey ? '✅ Definida' : '❌ Não definida');
    console.log('   - usando:', supabaseAdmin ? 'service_role (admin)' : 'anon (public)');
  } else {
    console.log('✅ Aplicação usando MySQL (Supabase desabilitado)');
  }
}

// Função para testar conexão (apenas se Supabase estiver habilitado)
export const testConnection = async (): Promise<boolean> => {
  if (!SUPABASE_ENABLED || !supabase) {
    console.log('ℹ️  Supabase desabilitado - teste de conexão ignorado');
    return false;
  }
  
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

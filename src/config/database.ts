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
  url: config.database.url,
  anonKey: config.database.apiKey,
  serviceRoleKey: process.env['SUPABASE_SERVICE_ROLE_KEY'],
};

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

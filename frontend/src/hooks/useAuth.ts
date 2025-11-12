import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import type { User } from '@supabase/supabase-js';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const client = supabase;

  useEffect(() => {
    if (!client) {
      setLoading(false);
      setError('Supabase não configurado para autenticação.');
      return;
    }

    // Verificar se há uma sessão ativa
    const getSession = async () => {
      try {
        const { data: { session } } = await client.auth.getSession();
        setUser(session?.user ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao verificar sessão');
      } finally {
        setLoading(false);
      }
    };

    getSession();

    // Escutar mudanças na autenticação
    const { data: { subscription } } = client.auth.onAuthStateChange(
      async (_, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [client]);

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      setError(null);

      if (!client) {
        throw new Error('Supabase não configurado para autenticação.');
      }
      
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      setUser(data.user);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao fazer login';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      setLoading(true);
      setError(null);

      if (!client) {
        throw new Error('Supabase não configurado para autenticação.');
      }
      
      const { data, error } = await client.auth.signUp({
        email,
        password,
      });

      if (error) throw error;
      
      setUser(data.user);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar conta';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!client) {
        throw new Error('Supabase não configurado para autenticação.');
      }
      
      const { error } = await client.auth.signOut();
      if (error) throw error;
      
      setUser(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao fazer logout';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      setLoading(true);
      setError(null);

      if (!client) {
        throw new Error('Supabase não configurado para autenticação.');
      }
      
      const { error } = await client.auth.resetPasswordForEmail(email);
      if (error) throw error;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao resetar senha';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    user,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    resetPassword,
    clearError: () => setError(null),
  };
};

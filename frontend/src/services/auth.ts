import { supabase } from '../config/supabase';
import type { User } from '@supabase/supabase-js';

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase não configurado para autenticação.');
  }
  return supabase;
}

export const authService = {
  async signIn(email: string, password: string): Promise<{ user: User | null; session: any }> {
    const client = ensureSupabase();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  },

  async signUp(email: string, password: string): Promise<{ user: User | null; session: any }> {
    const client = ensureSupabase();
    const { data, error } = await client.auth.signUp({
      email,
      password,
    });

    if (error) throw error;
    return data;
  },

  async signOut(): Promise<void> {
    const client = ensureSupabase();
    const { error } = await client.auth.signOut();
    if (error) throw error;
  },

  async resetPassword(email: string): Promise<void> {
    const client = ensureSupabase();
    const { error } = await client.auth.resetPasswordForEmail(email);
    if (error) throw error;
  },

  async getCurrentUser(): Promise<User | null> {
    const client = ensureSupabase();
    const { data: { user } } = await client.auth.getUser();
    return user;
  },

  async getSession(): Promise<any> {
    const client = ensureSupabase();
    const { data: { session } } = await client.auth.getSession();
    return session;
  },

  onAuthStateChange(callback: (event: string, session: any) => void) {
    const client = ensureSupabase();
    return client.auth.onAuthStateChange(callback);
  },
};












/**
 * Script para migrar todos os imports de Supabase para MySQL
 * Execute este script para substituir automaticamente os imports
 */

import 'dotenv/config';
import { createSupabaseAdapter } from '../services/SupabaseAdapter';

// Exportar adapter para uso global
export const supabase = createSupabaseAdapter();
export const supabaseAdmin = createSupabaseAdapter(); // Mesmo adapter para admin

console.log('✅ Adapter MySQL configurado. Use este módulo em vez de config/database');


































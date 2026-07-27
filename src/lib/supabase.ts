import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * IMPORTANTE: este cliente liga-se ao MESMO projeto Supabase do Sherlock
 * Deal (wkjcaoqdvhykrfacsylr) — nunca a um projeto novo. O MatchDeal só lê
 * dados já existentes (entities, memberships) e escreve nas tabelas novas
 * `matchdeal_*` criadas pelas migrações em supabase/migrations. Ver
 * docs/ARCHITECTURE.md.
 *
 * As credenciais reais (URL + anon key) vêm de app.json > expo.extra,
 * substituídas em build/CI — nunca hardcoded aqui.
 */
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl as string;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string;

if (!supabaseUrl || supabaseUrl.includes('PLACEHOLDER')) {
  console.warn(
    '[MatchDeal] Supabase URL/anon key ainda não configuradas — ver app.json > expo.extra.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

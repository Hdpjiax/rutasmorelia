import 'react-native-url-polyfill/auto';
import {AppState} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createClient, processLock, type SupabaseClient} from '@supabase/supabase-js';
import {env, isSupabaseConfigured} from '../config/env';

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        lock: processLock,
      },
    })
  : null;

if (supabase) {
  AppState.addEventListener('change', state => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
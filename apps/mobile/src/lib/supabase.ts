import {AppState} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createClient, processLock} from '@supabase/supabase-js';
import {env, isSupabaseConfigured} from '../config/env';

export const supabase = isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabasePublishableKey, {
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

export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  routesBaseUrl: process.env.EXPO_PUBLIC_ROUTES_BASE_URL ?? '',
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
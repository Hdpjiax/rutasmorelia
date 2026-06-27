export const env = {
  supabaseUrl: '',
  supabasePublishableKey: '',
};

export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabasePublishableKey,
);

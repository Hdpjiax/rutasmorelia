// La clave publicable de Supabase puede incluirse en el cliente. Nunca coloques
// aquí una clave secreta o service_role.
export const env = {
  supabaseUrl: 'https://vmsjcqesmlkagcjqpsso.supabase.co',
  supabasePublishableKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtc2pjcWVzbWxrYWdjanFwc3NvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTQ0NzksImV4cCI6MjA5ODEzMDQ3OX0.MgQqYWq8isUPTojJ36JtXm3KwSwD23qxTKuEeIoIeu4',
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabasePublishableKey);

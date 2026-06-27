import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vmsjcqesmlkagcjqpsso.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtc2pjcWVzbWxrYWdjanFwc3NvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTQ0NzksImV4cCI6MjA5ODEzMDQ3OX0.MgQqYWq8isUPTojJ36JtXm3KwSwD23qxTKuEeIoIeu4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

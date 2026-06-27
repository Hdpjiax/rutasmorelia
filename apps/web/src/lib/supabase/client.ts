import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Support both key naming conventions (local publishable key and Vercel's default anon key)
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (typeof window !== "undefined") {
    console.log("[Supabase Config Diagnostic]:", {
      NEXT_PUBLIC_SUPABASE_URL: url ? "LOADED" : "MISSING",
      NEXT_PUBLIC_SUPABASE_KEY: key ? "LOADED" : "MISSING",
    });
  }

  return Boolean(url && key);
}

export function getSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) return null;
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
    browserClient = createBrowserClient(url, key);
  }
  return browserClient;
}

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (typeof window !== "undefined") {
    console.log("[Supabase Config Diagnostic]:", {
      NEXT_PUBLIC_SUPABASE_URL: url ? "LOADED" : "MISSING",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key ? "LOADED" : "MISSING",
    });
  }

  return Boolean(url && key);
}

export function getSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) return null;
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
  }
  return browserClient;
}

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const destination = new URL("/", url.origin);
  if (!code) {
    destination.searchParams.set("auth", "missing_code");
    return NextResponse.redirect(destination);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    destination.searchParams.set("auth", "not_configured");
    return NextResponse.redirect(destination);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) destination.searchParams.set("auth", "error");
  return NextResponse.redirect(destination);
}

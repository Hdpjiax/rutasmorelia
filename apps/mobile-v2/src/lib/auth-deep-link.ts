import type {SupabaseClient} from '@supabase/supabase-js';

export type AuthDeepLinkResult =
  | {ok: true; method: 'code' | 'tokens'}
  | {ok: false; reason: 'invalid_url' | 'missing_credentials' | 'session_error'; message: string};

export async function handleAuthDeepLink(
  client: SupabaseClient,
  url: string,
): Promise<AuthDeepLinkResult> {
  try {
    const urlObj = new URL(url);
    const code = urlObj.searchParams.get('code');
    if (code) {
      const {error} = await client.auth.exchangeCodeForSession(code);
      if (error) {
        return {ok: false, reason: 'session_error', message: 'No pudimos completar el inicio de sesión.'};
      }
      return {ok: true, method: 'code'};
    }

    if (urlObj.hash) {
      const params = new URLSearchParams(urlObj.hash.substring(1));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        const {error} = await client.auth.setSession({access_token, refresh_token});
        if (error) {
          return {ok: false, reason: 'session_error', message: 'No pudimos guardar tu sesión.'};
        }
        return {ok: true, method: 'tokens'};
      }
    }

    return {ok: false, reason: 'missing_credentials', message: 'El enlace de autenticación no es válido.'};
  } catch {
    return {ok: false, reason: 'invalid_url', message: 'No pudimos leer el enlace de autenticación.'};
  }
}

export const AUTH_CALLBACK_URL = 'rutasmorelia://auth/callback';
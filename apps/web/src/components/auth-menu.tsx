"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { GoogleLogoIcon, SignOutIcon, UserCircleIcon } from "@phosphor-icons/react";
import type { User } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

const emailSchema = z.object({ email: z.email("Escribe un correo válido.") });
type EmailValues = z.infer<typeof emailSchema>;

type AuthMenuProps = { onMessage: (message: string) => void };

export function AuthMenu({ onMessage }: AuthMenuProps) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const configured = isSupabaseConfigured();
  const { register, handleSubmit, formState: { errors } } = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
  });

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [open]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function signInWithProvider(provider: "google") {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return onMessage("Configura Supabase para iniciar sesión.");
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) onMessage("No pudimos abrir el inicio de sesión.");
    setLoading(false);
  }

  async function signInAsGuest() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return onMessage("Configura Supabase para continuar como invitado.");
    setLoading(true);
    const { error } = await supabase.auth.signInAnonymously();
    onMessage(error ? "No pudimos crear la sesión de invitado." : "Ya puedes guardar búsquedas en este dispositivo.");
    setLoading(false);
    if (!error) setOpen(false);
  }

  async function sendMagicLink({ email }: EmailValues) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return onMessage("Configura Supabase para iniciar sesión.");
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    onMessage(error ? "No pudimos enviar el enlace." : "Revisa tu correo para continuar.");
    setLoading(false);
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase?.auth.signOut();
    onMessage("Sesión cerrada.");
    setOpen(false);
  }

  return (
    <div className="account-control" ref={containerRef}>
      <button
        className="icon-button"
        type="button"
        aria-label={user ? "Abrir cuenta" : "Iniciar sesión"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <UserCircleIcon size={23} weight={user ? "fill" : "regular"} />
      </button>
      {open && (
        <section className="account-menu" aria-label="Cuenta">
          {user ? (
            <>
              <strong>{user.is_anonymous ? "Sesión de invitado" : user.email}</strong>
              <p>{user.is_anonymous ? "Tus favoritos se conservarán mientras mantengas esta sesión." : "Tu cuenta está conectada."}</p>
              <button className="secondary-button" type="button" onClick={signOut}>
                <SignOutIcon size={18} /> Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <strong>Guarda tus viajes</strong>
              <p>Inicia sesión para sincronizar favoritos, casa, trabajo e historial.</p>
              {!configured && <div className="inline-notice">Supabase aún no está conectado en este entorno.</div>}
              <div className="provider-actions">
                <button className="secondary-button" type="button" disabled={loading} onClick={() => signInWithProvider("google")} style={{ width: "100%" }}><GoogleLogoIcon size={18} /> Google</button>
              </div>
              <form className="email-auth" onSubmit={handleSubmit(sendMagicLink)}>
                <label htmlFor="auth-email">Correo electrónico</label>
                <input id="auth-email" type="email" autoComplete="email" placeholder="nombre@correo.com" {...register("email")} />
                {errors.email && <span className="field-error">{errors.email.message}</span>}
                <button className="secondary-button" type="submit" disabled={loading}>Enviar enlace</button>
              </form>
              <button className="text-button" type="button" disabled={loading} onClick={signInAsGuest}>Continuar como invitado</button>
            </>
          )}
        </section>
      )}
    </div>
  );
}

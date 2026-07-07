import type {User} from '@supabase/supabase-js';
import {AppleLogo, GoogleLogo, UserCircle, X} from 'phosphor-react-native';
import {useEffect, useState} from 'react';
import {Linking, Modal, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AUTH_CALLBACK_URL} from '../../lib/auth-deep-link';
import {supabase} from '../../lib/supabase';
import {useUiStore} from '../../stores/ui.store';
import {useTheme} from '../../theme/ThemeProvider';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function AccountPanel({visible, onClose}: Props) {
  const insets = useSafeAreaInsets();
  const {theme} = useTheme();
  const setMessage = useUiStore(s => s.setMessage);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    client.auth.getUser().then(({data}) => setUser(data.user));
    const {data} = client.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!visible) setNotice('');
  }, [visible]);

  async function signInAsGuest() {
    if (!supabase) return setNotice('Conecta Supabase para iniciar sesión.');
    setLoading(true);
    const {error} = await supabase.auth.signInAnonymously();
    const msg = error ? 'No pudimos crear la sesión.' : 'Sesión de invitado activa.';
    setNotice(msg);
    if (!error) setMessage(msg, 'success');
    setLoading(false);
  }

  async function sendMagicLink() {
    if (!supabase || !email.includes('@')) return setNotice('Escribe un correo válido.');
    setLoading(true);
    const {error} = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {emailRedirectTo: AUTH_CALLBACK_URL},
    });
    const msg = error ? 'No pudimos enviar el enlace.' : 'Revisa tu correo para continuar.';
    setNotice(msg);
    if (!error) setMessage(msg, 'success');
    setLoading(false);
  }

  async function signInWithProvider(provider: 'google' | 'apple') {
    if (!supabase) return setNotice('Conecta Supabase para iniciar sesión.');
    setLoading(true);
    const {data, error} = await supabase.auth.signInWithOAuth({
      provider,
      options: {redirectTo: AUTH_CALLBACK_URL, skipBrowserRedirect: true},
    });
    setLoading(false);
    if (error || !data.url) return setNotice('No pudimos abrir el proveedor.');
    await Linking.openURL(data.url);
  }

  async function signOut() {
    await supabase?.auth.signOut();
    setNotice('Sesión cerrada.');
    setMessage('Sesión cerrada', 'info');
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.bgElevated,
            borderColor: theme.surfaceBorder,
            paddingBottom: insets.bottom + 20,
          },
        ]}>
        <View style={styles.handleRow}>
          <Text style={[styles.title, {color: theme.text}]}>{user ? 'Tu cuenta' : 'Inicia sesión'}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar">
            <X size={22} color={theme.textMuted} />
          </Pressable>
        </View>

        <View style={[styles.avatar, {backgroundColor: theme.accentMuted}]}>
          <UserCircle size={36} color={theme.accent} weight="fill" />
        </View>

        <Text style={[styles.subtitle, {color: theme.textMuted}]}>
          {user
            ? user.is_anonymous
              ? 'Sesión de invitado — sincroniza favoritos iniciando sesión.'
              : user.email
            : 'Sincroniza favoritos, casa y trabajo entre dispositivos.'}
        </Text>

        {notice ? (
          <Text style={[styles.notice, {backgroundColor: theme.accentMuted, color: theme.accent}]}>{notice}</Text>
        ) : null}

        {user && !user.is_anonymous ? (
          <Pressable
            onPress={() => void signOut()}
            style={[styles.secondaryBtn, {borderColor: theme.surfaceBorder, backgroundColor: theme.surface}]}>
            <Text style={[styles.btnLabel, {color: theme.text}]}>Cerrar sesión</Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.providers}>
              <Pressable
                disabled={loading}
                onPress={() => void signInWithProvider('google')}
                style={[styles.providerBtn, {borderColor: theme.surfaceBorder, backgroundColor: theme.surface}]}>
                <GoogleLogo size={20} color={theme.text} />
                <Text style={[styles.btnLabel, {color: theme.text}]}>Google</Text>
              </Pressable>
              <Pressable
                disabled={loading}
                onPress={() => void signInWithProvider('apple')}
                style={[styles.providerBtn, {borderColor: theme.surfaceBorder, backgroundColor: theme.surface}]}>
                <AppleLogo size={20} color={theme.text} />
                <Text style={[styles.btnLabel, {color: theme.text}]}>Apple</Text>
              </Pressable>
            </View>

            <TextInput
              accessibilityLabel="Correo electrónico"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="nombre@correo.com"
              placeholderTextColor={theme.textMuted}
              style={[styles.input, {borderColor: theme.surfaceBorder, backgroundColor: theme.surface, color: theme.text}]}
            />

            <Pressable
              disabled={loading}
              onPress={() => void sendMagicLink()}
              style={[styles.primaryBtn, {backgroundColor: theme.accent}]}>
              <Text style={styles.primaryLabel}>Enviar enlace mágico</Text>
            </Pressable>

            <Pressable disabled={loading} onPress={() => void signInAsGuest()} style={styles.guestBtn}>
              <Text style={[styles.guestLabel, {color: theme.accent}]}>Continuar como invitado</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)'},
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  handleRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  title: {fontSize: 22, fontWeight: '800'},
  avatar: {width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center'},
  subtitle: {fontSize: 14, lineHeight: 20},
  notice: {padding: 10, borderRadius: 10, fontSize: 13},
  providers: {flexDirection: 'row', gap: 10},
  providerBtn: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 15},
  primaryBtn: {minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
  primaryLabel: {color: '#FFF', fontSize: 15, fontWeight: '700'},
  guestBtn: {minHeight: 44, alignItems: 'center', justifyContent: 'center'},
  guestLabel: {fontSize: 14, fontWeight: '700'},
  btnLabel: {fontSize: 14, fontWeight: '700'},
});
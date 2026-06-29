import {useEffect, useState} from 'react';
import {Linking, Pressable, StyleSheet, Text, TextInput, useColorScheme, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {User} from '@supabase/supabase-js';
import {AppleLogo, ArrowLeft, GoogleLogo, UserCircle} from 'phosphor-react-native';
import type {RootStackParamList} from '../../App';
import {supabase} from '../lib/supabase';
import {dark, light} from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Account'>;

export function AccountScreen({navigation}: Props) {
  const colors = useColorScheme() === 'dark' ? dark : light;
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    client.auth.getUser().then(({data}) => setUser(data.user));
    const {data} = client.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  async function signInAsGuest() {
    if (!supabase) return setMessage('Conecta Supabase para iniciar sesión.');
    setLoading(true);
    const {error} = await supabase.auth.signInAnonymously();
    setMessage(error ? 'No pudimos crear la sesión.' : 'Sesión de invitado activa.');
    setLoading(false);
  }

  async function sendMagicLink() {
    if (!supabase || !email.includes('@')) return setMessage('Escribe un correo válido.');
    setLoading(true);
    const {error} = await supabase.auth.signInWithOtp({
      email: email.trim(), options: {emailRedirectTo: 'simum://auth/callback'},
    });
    setMessage(error ? 'No pudimos enviar el enlace.' : 'Revisa tu correo para continuar.');
    setLoading(false);
  }

  async function signInWithProvider(provider: 'google' | 'apple') {
    if (!supabase) return setMessage('Conecta Supabase para iniciar sesión.');
    const {data, error} = await supabase.auth.signInWithOAuth({
      provider,
      options: {redirectTo: 'simum://auth/callback', skipBrowserRedirect: true},
    });
    if (error || !data.url) return setMessage('No pudimos abrir el proveedor.');
    await Linking.openURL(data.url);
  }

  return (
    <View style={[styles.root, {backgroundColor: colors.bg}]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver al mapa" onPress={() => navigation.goBack()} style={[styles.backButton, {borderColor: colors.line}]}>
        <ArrowLeft size={22} color={colors.ink} />
      </Pressable>
      <View style={styles.content}>
        <View style={[styles.avatar, {backgroundColor: colors.primarySoft}]}><UserCircle size={38} color={colors.primary} weight="fill" /></View>
        <Text accessibilityRole="header" style={[styles.title, {color: colors.ink}]}>{user ? 'Tu cuenta' : 'Guarda tus viajes'}</Text>
        <Text style={[styles.description, {color: colors.muted}]}>{user ? (user.is_anonymous ? 'Estás usando una sesión de invitado.' : user.email) : 'Sincroniza favoritos, casa, trabajo e historial entre dispositivos.'}</Text>
        {message ? <Text accessibilityLiveRegion="polite" style={[styles.notice, {backgroundColor: colors.primarySoft, color: colors.primary}]}>{message}</Text> : null}
        {user ? (
          <Pressable accessibilityRole="button" onPress={() => supabase?.auth.signOut()} style={[styles.secondaryButton, {backgroundColor: colors.surface, borderColor: colors.line}]}><Text style={[styles.buttonLabel, {color: colors.ink}]}>Cerrar sesión</Text></Pressable>
        ) : (
          <>
            <View style={styles.providers}>
              <Pressable accessibilityRole="button" disabled={loading} onPress={() => signInWithProvider('google')} style={[styles.secondaryButton, {backgroundColor: colors.surface, borderColor: colors.line}]}><GoogleLogo size={20} color={colors.ink} /><Text style={[styles.buttonLabel, {color: colors.ink}]}>Google</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={loading} onPress={() => signInWithProvider('apple')} style={[styles.secondaryButton, {backgroundColor: colors.surface, borderColor: colors.line}]}><AppleLogo size={20} color={colors.ink} /><Text style={[styles.buttonLabel, {color: colors.ink}]}>Apple</Text></Pressable>
            </View>
            <TextInput accessibilityLabel="Correo electrónico" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="nombre@correo.com" placeholderTextColor={colors.muted} style={[styles.input, {backgroundColor: colors.surface, borderColor: colors.line, color: colors.ink}]} />
            <Pressable accessibilityRole="button" disabled={loading} onPress={sendMagicLink} style={[styles.primaryButton, {backgroundColor: colors.primary}]}><Text style={styles.primaryLabel}>Enviar enlace por correo</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={loading} onPress={signInAsGuest} style={styles.guestButton}><Text style={[styles.guestLabel, {color: colors.primary}]}>Continuar como invitado</Text></Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, paddingTop: 54, paddingHorizontal: 20}, backButton: {width: 44, height: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
  content: {flex: 1, justifyContent: 'center', paddingBottom: 80}, avatar: {width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 20},
  title: {fontSize: 28, fontWeight: '700', letterSpacing: -0.8}, description: {fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 20, maxWidth: 360}, notice: {padding: 11, borderRadius: 10, fontSize: 13, marginBottom: 12},
  providers: {flexDirection: 'row', gap: 10}, secondaryButton: {minHeight: 48, flex: 1, borderWidth: 1, borderRadius: 12, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center'}, buttonLabel: {fontSize: 14, fontWeight: '700'},
  input: {height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, marginTop: 10}, primaryButton: {minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10}, primaryLabel: {color: '#FFFFFF', fontSize: 15, fontWeight: '700'},
  guestButton: {minHeight: 48, alignItems: 'center', justifyContent: 'center'}, guestLabel: {fontSize: 14, fontWeight: '700'},
});

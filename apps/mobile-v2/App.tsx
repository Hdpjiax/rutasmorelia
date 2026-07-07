import 'react-native-gesture-handler';
import {useEffect} from 'react';
import * as SplashScreen from 'expo-splash-screen';
import {Linking} from 'react-native';
import {handleAuthDeepLink} from './src/lib/auth-deep-link';
import {supabase} from './src/lib/supabase';
import {ThemeProvider} from './src/theme/ThemeProvider';
import {useUiStore} from './src/stores/ui.store';
import {HomeScreen} from './src/screens/HomeScreen';

SplashScreen.preventAutoHideAsync();

function AuthDeepLinkListener() {
  const setMessage = useUiStore(s => s.setMessage);

  useEffect(() => {
    if (!supabase) return;

    async function handleUrl(url: string | null) {
      if (!url || !url.includes('auth/callback')) return;
      const result = await handleAuthDeepLink(supabase!, url);
      setMessage(result.ok ? 'Sesión iniciada correctamente' : result.message, result.ok ? 'success' : 'error');
    }

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({url}) => void handleUrl(url));
    return () => sub.remove();
  }, [setMessage]);

  return null;
}

export default function App() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider>
      <AuthDeepLinkListener />
      <HomeScreen />
    </ThemeProvider>
  );
}
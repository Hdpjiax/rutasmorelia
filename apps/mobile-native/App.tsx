import 'react-native-url-polyfill/auto';
import {useEffect} from 'react';
import {Linking, StatusBar, useColorScheme} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {supabase} from './src/lib/supabase';
import {AccountScreen} from './src/screens/AccountScreen';
import {MapScreen} from './src/screens/MapScreen';

export type RootStackParamList = {
  Map: undefined;
  Account: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function AuthLinkHandler() {
  useEffect(() => {
    if (!supabase) return;
    const handleUrl = async ({url}: {url: string}) => {
      const code = new URL(url).searchParams.get('code');
      if (code) await supabase.auth.exchangeCodeForSession(code);
    };
    const subscription = Linking.addEventListener('url', handleUrl);
    void Linking.getInitialURL().then(url => {
      if (url) void handleUrl({url});
    });
    return () => subscription.remove();
  }, []);
  return null;
}

export default function App() {
  const dark = useColorScheme() === 'dark';
  return (
    <SafeAreaProvider>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <NavigationContainer>
        <AuthLinkHandler />
        <Stack.Navigator screenOptions={{headerShown: false}}>
          <Stack.Screen name="Map" component={MapScreen} />
          <Stack.Screen name="Account" component={AccountScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

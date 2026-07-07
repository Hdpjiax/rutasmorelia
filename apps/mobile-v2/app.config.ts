import type {ExpoConfig, ConfigContext} from 'expo/config';

export default ({config}: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Rutas Morelia',
  slug: 'rutas-morelia-v2',
  version: '1.0.0',
  scheme: 'rutasmorelia',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  plugins: [
    '@maplibre/maplibre-react-native',
    'expo-dev-client',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Rutas Morelia usa tu ubicación para mostrar paradas cercanas y planificar viajes.',
      },
    ],
  ],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'org.viamorelia.rutasmorelia',
  },
  android: {
    package: 'org.viamorelia.rutasmorelia',
    adaptiveIcon: {
      backgroundColor: '#070B12',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
  },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
});
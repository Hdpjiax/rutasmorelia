import type {CameraRef} from '@maplibre/maplibre-react-native';
import {StatusBar} from 'expo-status-bar';
import {useEffect, useRef} from 'react';
import {StyleSheet, View} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {FloatingActionBar} from '../components/layout/FloatingActionBar';
import {TransitMap} from '../components/map/TransitMap';
import {MainBottomSheet} from '../components/sheets/MainBottomSheet';
import {useJourney} from '../hooks/useJourney';
import {useRouteCatalog} from '../hooks/useRouteCatalog';
import {useFavoritesStore} from '../stores/favorites.store';
import {useTransitStore} from '../stores/transit.store';
import {useTheme} from '../theme/ThemeProvider';

export function HomeScreen() {
  const cameraRef = useRef<CameraRef>(null);
  const {scheme, theme} = useTheme();
  const hydrateFavorites = useFavoritesStore(s => s.hydrate);
  const swapEndpoints = useTransitStore(s => s.swapEndpoints);

  useRouteCatalog();
  const {planTrip, selectSuggestion, locate, dismissSearch} = useJourney(cameraRef);

  useEffect(() => {
    void hydrateFavorites();
    void locate();
  }, [hydrateFavorites, locate]);

  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <View style={[styles.fill, {backgroundColor: theme.bg}]}>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <TransitMap cameraRef={cameraRef} />
          <MainBottomSheet
            onSelectSuggestion={(suggestion, target) => void selectSuggestion(suggestion, target)}
            onPlan={() => void planTrip()}
            onSwap={() => {
              swapEndpoints();
              dismissSearch();
            }}
          />
          <FloatingActionBar onLocate={() => void locate()} onSwap={() => swapEndpoints()} />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
});
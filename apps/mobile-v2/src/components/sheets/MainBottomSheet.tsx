import BottomSheet, {BottomSheetScrollView} from '@gorhom/bottom-sheet';
import {useCallback, useEffect, useMemo, useRef} from 'react';
import {StyleSheet, Text} from 'react-native';
import type {Suggestion} from '@rutas-morelia/transit-core';
import {AppTabBar} from '../navigation/AppTabBar';
import {useTransitStore} from '../../stores/transit.store';
import {useUiStore} from '../../stores/ui.store';
import {useTheme} from '../../theme/ThemeProvider';
import {FavoritesExplorer} from './FavoritesExplorer';
import {JourneyResultsPanel} from './JourneyResultsPanel';
import {RoutesExplorer} from './RoutesExplorer';
import {SearchPanel} from './SearchPanel';
import {TripPlanner} from './TripPlanner';

type Props = {
  onSelectSuggestion: (suggestion: Suggestion, target: 'origin' | 'destination') => void;
  onPlan: () => void;
  onSwap: () => void;
};

export function MainBottomSheet({onSelectSuggestion, onPlan, onSwap}: Props) {
  const sheetRef = useRef<BottomSheet>(null);
  const {theme} = useTheme();
  const appTab = useTransitStore(s => s.appTab);
  const setAppTab = useTransitStore(s => s.setAppTab);
  const sheetMode = useTransitStore(s => s.sheetMode);
  const activeInput = useTransitStore(s => s.activeInput);
  const activeRouteId = useTransitStore(s => s.activeRouteId);
  const activeJourneyOption = useTransitStore(s => s.activeJourneyOption);
  const setSheetSnapIndex = useUiStore(s => s.setSheetSnapIndex);

  const snapPoints = useMemo(() => ['12%', '42%', '78%'], []);

  const title = useMemo(() => {
    if (sheetMode === 'journey') return 'Opciones de viaje';
    if (appTab === 'routes') return 'Explorar rutas';
    if (appTab === 'favorites') return 'Mis favoritos';
    return 'Planifica tu viaje';
  }, [appTab, sheetMode]);

  const routeViewKey = `${activeRouteId ?? ''}:${activeJourneyOption?.route_id ?? ''}:${activeJourneyOption?.second_route_id ?? ''}`;
  const lastRouteViewKeyRef = useRef<string | null>(null);
  const lastActiveInputRef = useRef<typeof activeInput>(null);
  const lastAppTabRef = useRef(appTab);

  useEffect(() => {
    if (activeInput) {
      if (lastActiveInputRef.current !== activeInput) {
        sheetRef.current?.snapToIndex(2);
      }
      lastActiveInputRef.current = activeInput;
      return;
    }
    lastActiveInputRef.current = null;

    if (routeViewKey !== '::' && routeViewKey !== lastRouteViewKeyRef.current) {
      sheetRef.current?.snapToIndex(0);
      lastRouteViewKeyRef.current = routeViewKey;
      return;
    }

    if (appTab !== lastAppTabRef.current) {
      lastAppTabRef.current = appTab;
      if (appTab !== 'trip') sheetRef.current?.snapToIndex(1);
      else if (routeViewKey === '::') sheetRef.current?.snapToIndex(0);
    }
  }, [activeInput, appTab, routeViewKey]);

  const onSheetChange = useCallback(
    (index: number) => {
      setSheetSnapIndex(index);
    },
    [setSheetSnapIndex],
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      onChange={onSheetChange}
      enablePanDownToClose={false}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      handleIndicatorStyle={{backgroundColor: theme.textMuted, width: 40, opacity: 0.35}}
      backgroundStyle={{
        backgroundColor: theme.bgElevated,
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderWidth: 1,
        borderColor: theme.surfaceBorder,
      }}
      style={styles.sheet}>
      <BottomSheetScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, {color: theme.text}]}>{title}</Text>

        <AppTabBar active={appTab} onChange={setAppTab} />

        {appTab === 'trip' ? (
          <>
            <TripPlanner onPlan={onPlan} onSwap={onSwap} />
            <SearchPanel onSelectSuggestion={onSelectSuggestion} />
            {sheetMode === 'journey' ? <JourneyResultsPanel /> : null}
          </>
        ) : null}

        {appTab === 'routes' ? <RoutesExplorer /> : null}
        {appTab === 'favorites' ? <FavoritesExplorer /> : null}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 16, elevation: 12},
  content: {paddingBottom: 28, gap: 12},
  title: {paddingHorizontal: 16, fontSize: 18, fontWeight: '800'},
});
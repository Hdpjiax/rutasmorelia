import BottomSheet, {BottomSheetScrollView} from '@gorhom/bottom-sheet';
import {useCallback, useMemo, useRef} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {Suggestion} from '@rutas-morelia/transit-core';
import {useTransitStore} from '../../stores/transit.store';
import {useUiStore} from '../../stores/ui.store';
import {useTheme} from '../../theme/ThemeProvider';
import {FavoritesPanel} from './FavoritesPanel';
import {JourneyResultsPanel} from './JourneyResultsPanel';
import {RouteDetailPanel} from './RouteDetailPanel';
import {SearchPanel} from './SearchPanel';

type Props = {
  onSelectSuggestion: (suggestion: Suggestion, target: 'origin' | 'destination') => void;
  onPlan: () => void;
  onSwap: () => void;
};

export function MainBottomSheet({onSelectSuggestion, onPlan, onSwap}: Props) {
  const sheetRef = useRef<BottomSheet>(null);
  const {theme} = useTheme();
  const sheetMode = useTransitStore(s => s.sheetMode);
  const setSheetMode = useTransitStore(s => s.setSheetMode);
  const message = useUiStore(s => s.message);
  const toastKind = useUiStore(s => s.toastKind);

  const snapPoints = useMemo(() => ['22%', '48%', '86%'], []);

  const title = useMemo(() => {
    switch (sheetMode) {
      case 'search':
        return 'Buscar viaje';
      case 'journey':
        return 'Opciones de viaje';
      case 'favorites':
        return 'Favoritos';
      default:
        return 'Rutas Morelia';
    }
  }, [sheetMode]);

  const onSheetChange = useCallback(
    (index: number) => {
      if (index === 0 && sheetMode === 'search') setSheetMode('collapsed');
    },
    [setSheetMode, sheetMode],
  );

  const toastColor =
    toastKind === 'error' ? theme.danger : toastKind === 'success' ? theme.success : theme.accent;

  return (
    <BottomSheet
      ref={sheetRef}
      index={1}
      snapPoints={snapPoints}
      onChange={onSheetChange}
      handleIndicatorStyle={{backgroundColor: theme.textMuted, width: 42}}
      backgroundStyle={{backgroundColor: theme.bgElevated, borderTopLeftRadius: 22, borderTopRightRadius: 22}}
      style={styles.sheet}>
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, {color: theme.text}]}>{title}</Text>
        {message ? (
          <View style={[styles.toast, {backgroundColor: `${toastColor}22`, borderColor: toastColor}]}>
            <Text style={{color: theme.text, fontSize: 13}}>{message}</Text>
          </View>
        ) : null}
        {sheetMode === 'search' ? (
          <SearchPanel onSelectSuggestion={onSelectSuggestion} onPlan={onPlan} onSwap={onSwap} />
        ) : null}
        {sheetMode === 'journey' ? <JourneyResultsPanel /> : null}
        {sheetMode === 'favorites' ? <FavoritesPanel /> : null}
        {sheetMode === 'collapsed' || sheetMode === 'routes' ? <RouteDetailPanel /> : null}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, elevation: 12},
  content: {paddingBottom: 28},
  title: {fontSize: 20, fontWeight: '800', paddingHorizontal: 16, marginBottom: 10},
  toast: {marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderRadius: 10, padding: 10},
});
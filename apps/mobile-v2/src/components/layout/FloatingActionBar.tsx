import {ArrowsLeftRight, Crosshair, MagnifyingGlass, Star} from 'phosphor-react-native';
import {StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useHaptics} from '../../hooks/useHaptics';
import {useTransitStore} from '../../stores/transit.store';
import {useTheme} from '../../theme/ThemeProvider';
import {IconButton} from '../ui/IconButton';

type Props = {
  onLocate: () => void;
  onSwap: () => void;
};

export function FloatingActionBar({onLocate, onSwap}: Props) {
  const insets = useSafeAreaInsets();
  const {theme} = useTheme();
  const {light} = useHaptics();
  const sheetMode = useTransitStore(s => s.sheetMode);
  const setSheetMode = useTransitStore(s => s.setSheetMode);
  const setActiveInput = useTransitStore(s => s.setActiveInput);
  const swapEndpoints = useTransitStore(s => s.swapEndpoints);

  return (
    <View style={[styles.bar, {bottom: insets.bottom + 112, right: 16}]}>
      <IconButton onPress={() => { light(); setSheetMode('search'); setActiveInput('destination'); }}>
        <MagnifyingGlass size={22} color={theme.accent} weight="bold" />
      </IconButton>
      <IconButton onPress={onLocate}>
        <Crosshair size={22} color={theme.accentAlt} weight="bold" />
      </IconButton>
      <IconButton
        onPress={() => {
          light();
          setSheetMode('favorites');
        }}
        active={sheetMode === 'favorites'}>
        <Star size={22} color={theme.accent} weight={sheetMode === 'favorites' ? 'fill' : 'bold'} />
      </IconButton>
      <IconButton
        onPress={() => {
          swapEndpoints();
          onSwap();
        }}>
        <ArrowsLeftRight size={20} color={theme.textMuted} weight="bold" />
      </IconButton>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {position: 'absolute', gap: 10},
});
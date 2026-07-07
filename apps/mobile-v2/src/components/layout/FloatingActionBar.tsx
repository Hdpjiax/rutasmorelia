import {Crosshair} from 'phosphor-react-native';
import {StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useUiStore} from '../../stores/ui.store';
import {useTheme} from '../../theme/ThemeProvider';
import {IconButton} from '../ui/IconButton';

type Props = {
  onLocate: () => void;
};

const SHEET_BOTTOM_OFFSET = [96, 220, 420] as const;

export function FloatingActionBar({onLocate}: Props) {
  const insets = useSafeAreaInsets();
  const {theme} = useTheme();
  const sheetSnapIndex = useUiStore(s => s.sheetSnapIndex);
  const sheetOffset = SHEET_BOTTOM_OFFSET[sheetSnapIndex] ?? SHEET_BOTTOM_OFFSET[0];

  return (
    <View style={[styles.bar, {bottom: insets.bottom + sheetOffset, right: 16}]}>
      <IconButton onPress={onLocate} style={{backgroundColor: theme.glass, borderColor: theme.surfaceBorder}}>
        <Crosshair size={24} color={theme.accent} weight="bold" />
      </IconButton>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {position: 'absolute'},
});
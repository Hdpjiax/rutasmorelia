import {UserCircle} from 'phosphor-react-native';
import {StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../../theme/ThemeProvider';
import {BrandMark} from '../ui/BrandMark';
import {IconButton} from '../ui/IconButton';

type Props = {
  onAccountPress: () => void;
};

export function MapFloatingChrome({onAccountPress}: Props) {
  const insets = useSafeAreaInsets();
  const {theme} = useTheme();

  return (
    <View style={[styles.wrap, {top: insets.top + 8}]} pointerEvents="box-none">
      <View style={[styles.brandPill, {backgroundColor: theme.glass, borderColor: theme.surfaceBorder}]}>
        <BrandMark size={26} />
        <Text style={[styles.brand, {color: theme.text}]}>Via Morelia</Text>
      </View>
      <IconButton
        onPress={onAccountPress}
        accessibilityLabel="Cuenta"
        style={{backgroundColor: theme.glass, borderColor: theme.surfaceBorder}}>
        <UserCircle size={24} color={theme.accent} weight="fill" />
      </IconButton>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  brand: {fontSize: 16, fontWeight: '800', letterSpacing: -0.3},
});
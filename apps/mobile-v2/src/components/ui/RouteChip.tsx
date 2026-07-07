import {Pressable, StyleSheet, Text} from 'react-native';
import {contrastColor, type RouteItem} from '@rutas-morelia/transit-core';
import Animated, {FadeIn} from 'react-native-reanimated';
import {useHaptics} from '../../hooks/useHaptics';
import {useTheme} from '../../theme/ThemeProvider';

type Props = {
  route: RouteItem;
  selected?: boolean;
  onPress: () => void;
};

export function RouteChip({route, selected, onPress}: Props) {
  const {theme} = useTheme();
  const {selection} = useHaptics();
  const labelColor = contrastColor(route.color);

  return (
    <Animated.View entering={FadeIn.duration(180)}>
      <Pressable
        onPress={() => {
          selection();
          onPress();
        }}
        style={[
          styles.chip,
          {
            backgroundColor: selected ? route.color : theme.bgElevated,
            borderColor: selected ? route.color : theme.surfaceBorder,
          },
        ]}>
        <Text style={[styles.number, {color: selected ? labelColor : theme.accent}]}>{route.number}</Text>
        <Text style={[styles.name, {color: selected ? labelColor : theme.text}]} numberOfLines={1}>
          {route.name}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 140,
  },
  number: {fontWeight: '800', fontSize: 13},
  name: {fontWeight: '500', fontSize: 13, flexShrink: 1},
});
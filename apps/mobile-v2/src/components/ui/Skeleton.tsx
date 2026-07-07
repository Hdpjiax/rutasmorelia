import {useEffect} from 'react';
import {StyleSheet, View, type ViewStyle} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {useTheme} from '../../theme/ThemeProvider';

export function Skeleton({height = 16, width, style}: {height?: number; width?: number; style?: ViewStyle}) {
  const {theme} = useTheme();
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.85, {duration: 900, easing: Easing.inOut(Easing.ease)}), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({opacity: opacity.value}));

  return (
    <Animated.View style={animatedStyle}>
      <View
        style={[
          styles.block,
          {
            height,
            width: width ?? '100%',
            backgroundColor: theme.accentMuted,
            borderRadius: theme.radius.sm,
          },
          style,
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  block: {
    overflow: 'hidden',
  },
});
import {Pressable, StyleSheet, type PressableProps} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';
import {useTheme} from '../../theme/ThemeProvider';
import {useHaptics} from '../../hooks/useHaptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = PressableProps & {
  size?: number;
  active?: boolean;
};

export function IconButton({size = 44, active, style, onPress, children, ...rest}: Props) {
  const {theme} = useTheme();
  const scale = useSharedValue(1);
  const {light} = useHaptics();

  const animatedStyle = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));

  return (
    <AnimatedPressable
      style={[
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: theme.radius.md,
          backgroundColor: active ? theme.accentMuted : theme.surface,
          borderColor: active ? theme.accent : theme.surfaceBorder,
        },
        animatedStyle,
        style,
      ]}
      onPressIn={() => {
        scale.value = withSpring(0.92, {damping: 16, stiffness: 280});
      }}
      onPressOut={() => {
        scale.value = withSpring(1, {damping: 14, stiffness: 260});
      }}
      onPress={event => {
        light();
        onPress?.(event);
      }}
      {...rest}>
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
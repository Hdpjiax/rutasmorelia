import {useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

type Props = {
  color: string;
  size?: number;
};

export function PulsingMarker({color, size = 14}: Props) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1.8, {duration: 1200, easing: Easing.out(Easing.ease)}), -1, false);
  }, [pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{scale: pulse.value}],
    opacity: 1.2 - pulse.value * 0.45,
  }));

  return (
    <View style={[styles.wrap, {width: size * 2.4, height: size * 2.4}]}>
      <Animated.View style={[styles.ring, {borderColor: color, width: size * 2, height: size * 2, borderRadius: size}, ringStyle]} />
      <View style={[styles.dot, {backgroundColor: color, width: size, height: size, borderRadius: size / 2}]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {alignItems: 'center', justifyContent: 'center'},
  ring: {position: 'absolute', borderWidth: 2},
  dot: {borderWidth: 2, borderColor: '#FFFFFF'},
});
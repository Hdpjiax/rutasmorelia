import {useEffect, useRef} from 'react';
import {Animated, View} from 'react-native';

type PulsingMarkerProps = {
  color: string;
  variant?: 'default' | 'location';
};

export function PulsingMarker({color, variant = 'default'}: PulsingMarkerProps) {
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const pulse3 = useRef(new Animated.Value(0)).current;
  const pulse4 = useRef(new Animated.Value(0)).current;
  const locationPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const startLoop = (value: Animated.Value, duration = 2600) => {
      value.setValue(0);
      Animated.loop(Animated.timing(value, {toValue: 1, duration, useNativeDriver: true})).start();
    };

    if (variant === 'location') {
      startLoop(locationPulse, 2000);
      return () => locationPulse.stopAnimation();
    }

    const t1 = setTimeout(() => startLoop(pulse1), 0);
    const t2 = setTimeout(() => startLoop(pulse2), 650);
    const t3 = setTimeout(() => startLoop(pulse3), 1300);
    const t4 = setTimeout(() => startLoop(pulse4), 1950);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      pulse1.stopAnimation();
      pulse2.stopAnimation();
      pulse3.stopAnimation();
      pulse4.stopAnimation();
    };
  }, [locationPulse, pulse1, pulse2, pulse3, pulse4, variant]);

  const getRingStyle = (value: Animated.Value, maxScale: number) => ({
    position: 'absolute' as const,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color,
    transform: [
      {
        scale: value.interpolate({inputRange: [0, 1], outputRange: [0.2, maxScale]}),
      },
    ],
    opacity: value.interpolate({
      inputRange: [0, 0.15, 0.8, 1],
      outputRange: [0, 0.45, 0.12, 0],
    }),
  });

  if (variant === 'location') {
    return (
      <View style={{alignItems: 'center', justifyContent: 'center', width: 56, height: 56}}>
        <Animated.View
          style={{
            position: 'absolute',
            width: 26,
            height: 26,
            borderRadius: 13,
            borderWidth: 4,
            borderColor: color,
            transform: [
              {
                scale: locationPulse.interpolate({inputRange: [0, 1], outputRange: [1, 2.8]}),
              },
            ],
            opacity: locationPulse.interpolate({inputRange: [0, 1], outputRange: [0.8, 0]}),
          }}
        />
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: color,
            borderWidth: 4,
            borderColor: '#ffffff',
            shadowColor: color,
            shadowOffset: {width: 0, height: 0},
            shadowOpacity: 0.8,
            shadowRadius: 10,
            elevation: 8,
          }}
        />
      </View>
    );
  }

  return (
    <View style={{alignItems: 'center', justifyContent: 'center', width: 64, height: 64}}>
      <Animated.View style={getRingStyle(pulse1, 1.3)} />
      <Animated.View style={getRingStyle(pulse2, 1.8)} />
      <Animated.View style={getRingStyle(pulse3, 2.4)} />
      <Animated.View style={getRingStyle(pulse4, 3.2)} />
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: color,
          borderWidth: 3,
          borderColor: '#ffffff',
          shadowColor: '#000000',
          shadowOffset: {width: 0, height: 2},
          shadowOpacity: 0.4,
          shadowRadius: 3,
          elevation: 6,
        }}
      />
    </View>
  );
}
import {StyleSheet, View} from 'react-native';

type Props = {
  color: string;
  size?: number;
};

/** Static pin for MapLibre Marker — avoids Reanimated/ViewAnnotation reactTag races on Android. */
export function MapEndpointMarker({color, size = 12}: Props) {
  return (
    <View collapsable={false} style={[styles.wrap, {width: size * 2.2, height: size * 2.2}]}>
      <View
        style={[
          styles.ring,
          {borderColor: color, width: size * 1.8, height: size * 1.8, borderRadius: size * 0.9},
        ]}
      />
      <View
        style={[
          styles.dot,
          {backgroundColor: color, width: size, height: size, borderRadius: size / 2},
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {alignItems: 'center', justifyContent: 'center'},
  ring: {position: 'absolute', borderWidth: 2, opacity: 0.35},
  dot: {borderWidth: 2, borderColor: '#FFFFFF'},
});
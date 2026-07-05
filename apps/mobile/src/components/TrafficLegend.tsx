import {StyleSheet, Text, View} from 'react-native';
import type {AppColorScheme} from '../lib/color-scheme';
import {dark, light} from '../theme';

type TrafficLegendProps = {
  colorScheme: AppColorScheme;
  bottom: number;
};

export function TrafficLegend({colorScheme, bottom}: TrafficLegendProps) {
  const colors = colorScheme === 'dark' ? dark : light;

  return (
    <View style={[styles.trafficLegend, {backgroundColor: colors.bg, borderColor: colors.line, bottom}]}>
      <Text style={[styles.legendTitle, {color: colors.ink}]}>Tránsito en tiempo real</Text>
      <View style={styles.legendRow}>
        <View style={[styles.legendIndicator, {backgroundColor: '#ef4444'}]} />
        <Text style={[styles.legendLabel, {color: colors.muted}]}>Mucho tráfico</Text>
      </View>
      <View style={styles.legendRow}>
        <View style={[styles.legendIndicator, {backgroundColor: '#f97316'}]} />
        <Text style={[styles.legendLabel, {color: colors.muted}]}>Tráfico moderado</Text>
      </View>
      <View style={styles.legendRow}>
        <View style={[styles.legendIndicator, {backgroundColor: '#10b981'}]} />
        <Text style={[styles.legendLabel, {color: colors.muted}]}>Poco tráfico</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  trafficLegend: {
    position: 'absolute',
    left: 12,
    zIndex: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    minWidth: 140,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 3},
    elevation: 3,
  },
  legendTitle: {fontSize: 11, fontWeight: '700', marginBottom: 6},
  legendRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8},
  legendIndicator: {width: 14, height: 4, borderRadius: 2},
  legendLabel: {fontSize: 10, fontWeight: '500'},
});
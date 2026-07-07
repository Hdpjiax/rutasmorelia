import {ArrowsDownUp, MapPin, NavigationArrow} from 'phosphor-react-native';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {DEFAULT_ORIGIN_LABEL} from '@rutas-morelia/transit-core';
import {useTransitStore} from '../../stores/transit.store';
import {useTheme} from '../../theme/ThemeProvider';

type Props = {
  onPlan: () => void;
  onSwap: () => void;
};

export function TripPlanner({onPlan, onSwap}: Props) {
  const {theme} = useTheme();
  const originLabel = useTransitStore(s => s.originLabel);
  const destinationLabel = useTransitStore(s => s.destinationLabel);
  const activeInput = useTransitStore(s => s.activeInput);
  const journeyLoading = useTransitStore(s => s.journeyLoading);
  const setOrigin = useTransitStore(s => s.setOrigin);
  const setDestination = useTransitStore(s => s.setDestination);
  const setActiveInput = useTransitStore(s => s.setActiveInput);

  const focusInput = (input: 'origin' | 'destination') => setActiveInput(input);

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, {backgroundColor: theme.glass, borderColor: theme.surfaceBorder}]}>
        <View style={styles.timeline}>
          <View style={[styles.dot, {backgroundColor: theme.accentAlt}]} />
          <View style={[styles.line, {backgroundColor: theme.surfaceBorder}]} />
          <View style={[styles.dot, {backgroundColor: theme.accent}]} />
        </View>

        <View style={styles.fields}>
          <View
            style={[
              styles.field,
              {
                backgroundColor: activeInput === 'origin' ? theme.accentMuted : theme.bgElevated,
                borderColor: activeInput === 'origin' ? theme.accent : theme.surfaceBorder,
              },
            ]}>
            <NavigationArrow size={18} color={theme.accentAlt} weight="fill" />
            <View style={styles.fieldText}>
              <Text style={[styles.label, {color: theme.textMuted}]}>Origen</Text>
              <TextInput
                value={originLabel}
                onChangeText={text => setOrigin(text)}
                onFocus={() => focusInput('origin')}
                placeholder="Tu ubicación en Morelia"
                placeholderTextColor={theme.textMuted}
                style={[styles.input, {color: theme.text}]}
              />
            </View>
          </View>

          <View
            style={[
              styles.field,
              {
                backgroundColor: activeInput === 'destination' ? theme.accentMuted : theme.bgElevated,
                borderColor: activeInput === 'destination' ? theme.accent : theme.surfaceBorder,
              },
            ]}>
            <MapPin size={18} color={theme.accent} weight="fill" />
            <View style={styles.fieldText}>
              <Text style={[styles.label, {color: theme.textMuted}]}>Destino</Text>
              <TextInput
                value={destinationLabel}
                onChangeText={text => setDestination(text)}
                onFocus={() => focusInput('destination')}
                placeholder="¿A dónde vas en Morelia?"
                placeholderTextColor={theme.textMuted}
                style={[styles.input, {color: theme.text}]}
              />
            </View>
          </View>
        </View>

        <Pressable
          onPress={onSwap}
          style={[styles.swapBtn, {backgroundColor: theme.bgElevated, borderColor: theme.surfaceBorder}]}>
          <ArrowsDownUp size={18} color={theme.accent} weight="bold" />
        </Pressable>
      </View>

      <Pressable
        onPress={onPlan}
        disabled={journeyLoading}
        style={[styles.cta, {backgroundColor: theme.accent, opacity: journeyLoading ? 0.7 : 1}]}>
        <Text style={[styles.ctaText, {color: theme.textInverse}]}>
          {journeyLoading ? 'Calculando ruta…' : 'Planear viaje en Morelia'}
        </Text>
      </Pressable>

      {originLabel === DEFAULT_ORIGIN_LABEL ? (
        <Text style={[styles.hint, {color: theme.textMuted}]}>
          Usa el botón de ubicación flotante para fijar tu origen actual.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 10, paddingHorizontal: 16},
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  timeline: {alignItems: 'center', paddingTop: 18, paddingBottom: 18, gap: 4},
  dot: {width: 11, height: 11, borderRadius: 6},
  line: {width: 2, flex: 1, minHeight: 36, borderRadius: 1},
  fields: {flex: 1, gap: 10},
  field: {flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12},
  fieldText: {flex: 1, gap: 2},
  label: {fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5},
  input: {fontSize: 15, fontWeight: '600', padding: 0},
  swapBtn: {
    alignSelf: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: {borderRadius: 14, paddingVertical: 15, alignItems: 'center'},
  ctaText: {fontWeight: '800', fontSize: 15},
  hint: {fontSize: 12, lineHeight: 17, paddingHorizontal: 2},
});
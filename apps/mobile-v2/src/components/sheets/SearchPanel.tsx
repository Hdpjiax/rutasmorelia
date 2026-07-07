import {ArrowsLeftRight, MapPin, NavigationArrow} from 'phosphor-react-native';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import Animated, {FadeInDown} from 'react-native-reanimated';
import {DEFAULT_ORIGIN_LABEL, type Suggestion} from '@rutas-morelia/transit-core';
import {usePlaceSearch} from '../../hooks/usePlaceSearch';
import {useTransitStore} from '../../stores/transit.store';
import {useTheme} from '../../theme/ThemeProvider';
import {EmptyState} from '../ui/EmptyState';
import {Skeleton} from '../ui/Skeleton';

type Props = {
  onSelectSuggestion: (suggestion: Suggestion, target: 'origin' | 'destination') => void;
  onPlan: () => void;
  onSwap: () => void;
};

export function SearchPanel({onSelectSuggestion, onPlan, onSwap}: Props) {
  const {theme} = useTheme();
  const originLabel = useTransitStore(s => s.originLabel);
  const destinationLabel = useTransitStore(s => s.destinationLabel);
  const activeInput = useTransitStore(s => s.activeInput);
  const setOrigin = useTransitStore(s => s.setOrigin);
  const setDestination = useTransitStore(s => s.setDestination);
  const setActiveInput = useTransitStore(s => s.setActiveInput);
  const journeyLoading = useTransitStore(s => s.journeyLoading);
  const {displayedSuggestions, loading} = usePlaceSearch();

  return (
    <View style={styles.wrap}>
      <View style={styles.fields}>
        <View style={[styles.fieldRow, {borderColor: activeInput === 'origin' ? theme.accent : theme.surfaceBorder}]}>
          <NavigationArrow size={16} color={theme.accentAlt} weight="fill" />
          <TextInput
            value={originLabel}
            onChangeText={text => setOrigin(text)}
            onFocus={() => setActiveInput('origin')}
            placeholder={DEFAULT_ORIGIN_LABEL}
            placeholderTextColor={theme.textMuted}
            style={[styles.input, {color: theme.text}]}
          />
        </View>
        <Pressable onPress={onSwap} style={styles.swap}>
          <ArrowsLeftRight size={16} color={theme.textMuted} />
        </Pressable>
        <View style={[styles.fieldRow, {borderColor: activeInput === 'destination' ? theme.accent : theme.surfaceBorder}]}>
          <MapPin size={16} color={theme.accent} weight="fill" />
          <TextInput
            value={destinationLabel}
            onChangeText={text => setDestination(text)}
            onFocus={() => setActiveInput('destination')}
            placeholder="¿A dónde vas?"
            placeholderTextColor={theme.textMuted}
            style={[styles.input, {color: theme.text}]}
          />
        </View>
      </View>

      <Pressable
        onPress={onPlan}
        disabled={journeyLoading}
        style={[styles.cta, {backgroundColor: theme.accent, opacity: journeyLoading ? 0.6 : 1}]}>
        <Text style={[styles.ctaText, {color: theme.textInverse}]}>{journeyLoading ? 'Calculando…' : 'Planear viaje'}</Text>
      </Pressable>

      <View style={styles.suggestions}>
        {loading ? (
          <>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </>
        ) : displayedSuggestions.length === 0 ? (
          <EmptyState title="Sin sugerencias" subtitle="Escribe al menos 2 caracteres o revisa tus favoritos" />
        ) : (
          displayedSuggestions.map((item, index) => (
            <Animated.View key={`${item.entity_type}-${item.entity_id}`} entering={FadeInDown.delay(index * 40).duration(220)}>
              <Pressable
                onPress={() => onSelectSuggestion(item, activeInput ?? 'destination')}
                style={[styles.suggestion, {borderColor: theme.surfaceBorder}]}>
                <Text style={{color: theme.text, fontWeight: '600'}} numberOfLines={1}>
                  {item.label}
                </Text>
                {item.subtitle ? (
                  <Text style={{color: theme.textMuted, fontSize: theme.typography.caption}} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                ) : null}
              </Pressable>
            </Animated.View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 12, paddingHorizontal: 16, paddingBottom: 8},
  fields: {gap: 8},
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: {flex: 1, fontSize: 15, padding: 0},
  swap: {alignSelf: 'center', padding: 4},
  cta: {borderRadius: 14, paddingVertical: 14, alignItems: 'center'},
  ctaText: {fontWeight: '700', fontSize: 15},
  suggestions: {gap: 8, marginTop: 4},
  suggestion: {borderWidth: 1, borderRadius: 12, padding: 12, gap: 2},
});
import {Star} from 'phosphor-react-native';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Animated, {FadeInDown} from 'react-native-reanimated';
import {findFavoriteBySuggestion, type Suggestion} from '@rutas-morelia/transit-core';
import {usePlaceSearch} from '../../hooks/usePlaceSearch';
import {useFavoritesStore} from '../../stores/favorites.store';
import {useTransitStore} from '../../stores/transit.store';
import {useUiStore} from '../../stores/ui.store';
import {useTheme} from '../../theme/ThemeProvider';
import {EmptyState} from '../ui/EmptyState';
import {Skeleton} from '../ui/Skeleton';

type Props = {
  onSelectSuggestion: (suggestion: Suggestion, target: 'origin' | 'destination') => void;
};

export function SearchPanel({onSelectSuggestion}: Props) {
  const {theme} = useTheme();
  const activeInput = useTransitStore(s => s.activeInput);
  const favorites = useFavoritesStore(s => s.favorites);
  const togglePlace = useFavoritesStore(s => s.togglePlace);
  const setMessage = useUiStore(s => s.setMessage);
  const {displayedSuggestions, loading} = usePlaceSearch();

  if (!activeInput) return null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, {color: theme.textMuted}]}>
        {activeInput === 'origin' ? 'Lugares en Morelia' : 'Destinos en Morelia'}
      </Text>
      <View style={styles.suggestions}>
        {loading ? (
          <>
            <Skeleton height={52} />
            <Skeleton height={52} />
          </>
        ) : displayedSuggestions.length === 0 ? (
          <EmptyState title="Sin resultados" subtitle="Escribe al menos 2 caracteres. Solo buscamos en Morelia." />
        ) : (
          displayedSuggestions.map((item, index) => {
            const isFav = !!findFavoriteBySuggestion(favorites, item);
            const canFavorite = item.latitude != null && item.longitude != null && item.entity_type !== 'route';
            return (
              <Animated.View key={`${item.entity_type}-${item.entity_id}`} entering={FadeInDown.delay(index * 35).duration(220)}>
                <Pressable
                  onPress={() => onSelectSuggestion(item, activeInput)}
                  style={[styles.suggestion, {backgroundColor: theme.surface, borderColor: theme.surfaceBorder}]}>
                  <View style={{flex: 1}}>
                    <Text style={{color: theme.text, fontWeight: '700'}} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {item.subtitle ? (
                      <Text style={{color: theme.textMuted, fontSize: theme.typography.caption}} numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  {canFavorite ? (
                    <Pressable
                      onPress={() => {
                        void togglePlace(item.label, {
                          latitude: item.latitude!,
                          longitude: item.longitude!,
                        }).then(() => {
                          setMessage(
                            isFav ? 'Lugar quitado de favoritos' : 'Lugar guardado en favoritos',
                            'success',
                          );
                        });
                      }}
                      hitSlop={8}
                      style={styles.star}>
                      <Star size={20} color={theme.accent} weight={isFav ? 'fill' : 'regular'} />
                    </Pressable>
                  ) : null}
                </Pressable>
              </Animated.View>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 8, paddingHorizontal: 16},
  heading: {fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5},
  suggestions: {gap: 8},
  suggestion: {flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12},
  star: {padding: 4},
});
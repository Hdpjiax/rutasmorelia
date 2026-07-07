import {Bus, MapPin} from 'phosphor-react-native';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {favoriteCoords, type FavoriteItem} from '@rutas-morelia/transit-core';
import {useFavoritesStore} from '../../stores/favorites.store';
import {useTransitStore} from '../../stores/transit.store';
import {useTheme} from '../../theme/ThemeProvider';
import {EmptyState} from '../ui/EmptyState';
import {Skeleton} from '../ui/Skeleton';

export function FavoritesPanel() {
  const {theme} = useTheme();
  const favorites = useFavoritesStore(s => s.favorites);
  const loading = useFavoritesStore(s => s.loading);
  const routes = useTransitStore(s => s.routes);
  const setActiveRouteId = useTransitStore(s => s.setActiveRouteId);
  const setDestination = useTransitStore(s => s.setDestination);
  const setSheetMode = useTransitStore(s => s.setSheetMode);

  const routeFavorites = favorites.filter(f => f.route_id != null);
  const placeFavorites = favorites.filter(f => f.place_id || f.latitude != null || f.custom_name);

  const onPlacePress = (favorite: FavoriteItem) => {
    const coords = favoriteCoords(favorite);
    const label = favorite.custom_name || favorite.place?.name || favorite.name || 'Favorito';
    if (!coords) return;
    setDestination(label, coords);
    setSheetMode('search');
  };

  const onRoutePress = (favorite: FavoriteItem) => {
    const routeId = String(favorite.route?.code || favorite.route_id || '');
    if (routeId) {
      setActiveRouteId(routeId);
      setSheetMode('routes');
    }
  };

  if (loading) {
    return (
      <View style={{gap: 8, paddingHorizontal: 16}}>
        <Skeleton height={48} />
        <Skeleton height={48} />
      </View>
    );
  }

  if (!favorites.length) {
    return <EmptyState title="Sin favoritos" subtitle="Guarda rutas o lugares desde búsqueda o detalle de ruta" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      {placeFavorites.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, {color: theme.textMuted}]}>Lugares</Text>
          {placeFavorites.map(fav => (
            <Pressable
              key={String(fav.id)}
              onPress={() => onPlacePress(fav)}
              style={[styles.row, {borderColor: theme.surfaceBorder}]}>
              <MapPin size={18} color={theme.accent} weight="fill" />
              <Text style={{color: theme.text, flex: 1}} numberOfLines={1}>
                {fav.custom_name || fav.place?.name || fav.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {routeFavorites.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, {color: theme.textMuted}]}>Rutas</Text>
          {routeFavorites.map(fav => {
            const route = routes.find(r => r.id === String(fav.route_id) || r.id === String(fav.route?.code));
            return (
              <Pressable
                key={String(fav.id)}
                onPress={() => onRoutePress(fav)}
                style={[styles.row, {borderColor: theme.surfaceBorder}]}>
                <Bus size={18} color={theme.accentAlt} weight="bold" />
                <Text style={{color: theme.text, flex: 1}} numberOfLines={1}>
                  {route?.name ?? `Ruta ${fav.route_id}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {paddingHorizontal: 16, paddingBottom: 16, gap: 16},
  section: {gap: 8},
  sectionTitle: {fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12},
});
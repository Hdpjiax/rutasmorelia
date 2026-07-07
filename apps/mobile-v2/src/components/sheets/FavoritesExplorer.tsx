import {Bus, MapPin, Star, Trash} from 'phosphor-react-native';
import {useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {favoriteCoords, type FavoriteItem} from '@rutas-morelia/transit-core';
import {resolveFavoriteRouteCatalogId} from '../../services/favorites.service';
import {useFavoritesStore} from '../../stores/favorites.store';
import {useTransitStore} from '../../stores/transit.store';
import {useTheme} from '../../theme/ThemeProvider';
import {EmptyState} from '../ui/EmptyState';
import {Skeleton} from '../ui/Skeleton';

type FavTab = 'places' | 'routes';

export function FavoritesExplorer() {
  const {theme} = useTheme();
  const [tab, setTab] = useState<FavTab>('places');
  const favorites = useFavoritesStore(s => s.favorites);
  const loading = useFavoritesStore(s => s.loading);
  const toggleRoute = useFavoritesStore(s => s.toggleRoute);
  const togglePlace = useFavoritesStore(s => s.togglePlace);
  const routes = useTransitStore(s => s.routes);
  const activateRoute = useTransitStore(s => s.activateRoute);
  const setDestination = useTransitStore(s => s.setDestination);
  const setAppTab = useTransitStore(s => s.setAppTab);
  const setActiveInput = useTransitStore(s => s.setActiveInput);

  const routeFavorites = useMemo(() => favorites.filter(f => f.route_id != null), [favorites]);
  const placeFavorites = useMemo(
    () => favorites.filter(f => !f.route_id && (f.place_id || f.latitude != null || f.custom_name)),
    [favorites],
  );

  const onPlacePress = (favorite: FavoriteItem) => {
    const coords = favoriteCoords(favorite);
    const label = favorite.custom_name || favorite.place?.name || favorite.name || 'Favorito';
    if (!coords) return;
    setDestination(label, coords);
    setAppTab('trip');
    setActiveInput(null);
  };

  const onRoutePress = (favorite: FavoriteItem) => {
    const routeId = resolveFavoriteRouteCatalogId(favorite, routes);
    if (routeId) activateRoute(routeId, routes);
  };

  const removePlace = (favorite: FavoriteItem) => {
    const coords = favoriteCoords(favorite);
    const label = favorite.custom_name || favorite.place?.name || favorite.name || '';
    if (coords) void togglePlace(label, coords);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <Skeleton height={56} />
        <Skeleton height={56} />
      </View>
    );
  }

  if (!favorites.length) {
    return (
      <EmptyState
        title="Aún no tienes favoritos"
        subtitle="Guarda lugares desde la búsqueda o rutas con la estrella en el catálogo"
      />
    );
  }

  const items = tab === 'routes' ? routeFavorites : placeFavorites;

  return (
    <View style={styles.wrap}>
      <View style={[styles.tabs, {backgroundColor: theme.surface, borderColor: theme.surfaceBorder}]}>
        <Pressable
          onPress={() => setTab('places')}
          style={[styles.tab, tab === 'places' && {backgroundColor: theme.accentMuted}]}>
          <MapPin size={16} color={tab === 'places' ? theme.accent : theme.textMuted} weight="fill" />
          <Text style={{color: tab === 'places' ? theme.accent : theme.textMuted, fontWeight: '700'}}>
            Lugares ({placeFavorites.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('routes')}
          style={[styles.tab, tab === 'routes' && {backgroundColor: theme.accentMuted}]}>
          <Bus size={16} color={tab === 'routes' ? theme.accent : theme.textMuted} weight="bold" />
          <Text style={{color: tab === 'routes' ? theme.accent : theme.textMuted, fontWeight: '700'}}>
            Rutas ({routeFavorites.length})
          </Text>
        </Pressable>
      </View>

      {items.length === 0 ? (
        <EmptyState
          title={tab === 'routes' ? 'Sin rutas favoritas' : 'Sin lugares favoritos'}
          subtitle={tab === 'routes' ? 'Marca rutas en la pestaña Rutas' : 'Guarda calles o lugares al buscar'}
        />
      ) : (
        <View style={styles.list}>
          {items.map(fav => {
            if (tab === 'routes') {
              const catalogId = resolveFavoriteRouteCatalogId(fav, routes);
              const route = catalogId ? routes.find(r => r.id === catalogId) : undefined;
              const routeId = catalogId ?? String(fav.route_id);
              return (
                <Pressable
                  key={String(fav.id)}
                  onPress={() => onRoutePress(fav)}
                  style={[styles.card, {backgroundColor: theme.surface, borderColor: theme.surfaceBorder}]}>
                  <View style={[styles.iconWrap, {backgroundColor: theme.accentMuted}]}>
                    <Bus size={20} color={theme.accent} weight="bold" />
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={{color: theme.text, fontWeight: '700'}} numberOfLines={1}>
                      {route?.name ?? `Ruta ${routeId}`}
                    </Text>
                    <Text style={{color: theme.textMuted, fontSize: 12}}>
                      {route ? `${route.number} · ${route.detail}` : 'Ruta guardada'}
                    </Text>
                  </View>
                  <Pressable onPress={() => void toggleRoute(routeId)} hitSlop={8}>
                    <Star size={22} color={theme.accent} weight="fill" />
                  </Pressable>
                </Pressable>
              );
            }

            const label = fav.custom_name || fav.place?.name || fav.name || 'Lugar';
            return (
              <Pressable
                key={String(fav.id)}
                onPress={() => onPlacePress(fav)}
                style={[styles.card, {backgroundColor: theme.surface, borderColor: theme.surfaceBorder}]}>
                <View style={[styles.iconWrap, {backgroundColor: theme.accentMuted}]}>
                  <MapPin size={20} color={theme.accentAlt} weight="fill" />
                </View>
                <View style={{flex: 1}}>
                  <Text style={{color: theme.text, fontWeight: '700'}} numberOfLines={1}>
                    {label}
                  </Text>
                  <Text style={{color: theme.textMuted, fontSize: 12}}>Toca para usar como destino</Text>
                </View>
                <Pressable onPress={() => removePlace(fav)} hitSlop={8}>
                  <Trash size={20} color={theme.textMuted} />
                </Pressable>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 12, flex: 1, minHeight: 240},
  tabs: {flexDirection: 'row', marginHorizontal: 16, padding: 4, borderRadius: 14, borderWidth: 1, gap: 4},
  tab: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10},
  list: {gap: 8, paddingHorizontal: 16, paddingBottom: 24},
  card: {flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1},
  iconWrap: {width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
  loading: {gap: 8, paddingHorizontal: 16},
});
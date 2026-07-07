import {MagnifyingGlass} from 'phosphor-react-native';
import {useMemo} from 'react';
import {StyleSheet, Text, TextInput, View} from 'react-native';
import {
  filterRoutesByTransport,
  scoreRoutesByQuery,
  sortRoutesForDisplay,
  type RouteItem,
} from '@rutas-morelia/transit-core';
import {useFavoritesStore} from '../../stores/favorites.store';
import {useTransitStore} from '../../stores/transit.store';
import {useTheme} from '../../theme/ThemeProvider';
import {FilterChipRow} from '../ui/FilterChipRow';
import {EmptyState} from '../ui/EmptyState';
import {RouteListItem} from '../ui/RouteListItem';
import {Skeleton} from '../ui/Skeleton';

export function RoutesExplorer() {
  const {theme} = useTheme();
  const routes = useTransitStore(s => s.routes);
  const routesLoading = useTransitStore(s => s.routesLoading);
  const routesError = useTransitStore(s => s.routesError);
  const activeRouteId = useTransitStore(s => s.activeRouteId);
  const transportFilter = useTransitStore(s => s.transportFilter);
  const routeSearchQuery = useTransitStore(s => s.routeSearchQuery);
  const setTransportFilter = useTransitStore(s => s.setTransportFilter);
  const setRouteSearchQuery = useTransitStore(s => s.setRouteSearchQuery);
  const activateRoute = useTransitStore(s => s.activateRoute);
  const favorites = useFavoritesStore(s => s.favorites);

  const favoriteRouteIds = useMemo(
    () => favorites.filter(f => f.route_id != null).map(f => String(f.route_id)),
    [favorites],
  );

  const displayedRoutes = useMemo(() => {
    const base = routeSearchQuery.trim()
      ? scoreRoutesByQuery(routes, routeSearchQuery.trim(), 0.2)
      : sortRoutesForDisplay(routes);
    return filterRoutesByTransport(base, transportFilter, favoriteRouteIds);
  }, [favoriteRouteIds, routeSearchQuery, routes, transportFilter]);

  return (
    <View style={styles.wrap}>
      <View style={[styles.search, {backgroundColor: theme.surface, borderColor: theme.surfaceBorder}]}>
        <MagnifyingGlass size={18} color={theme.textMuted} />
        <TextInput
          value={routeSearchQuery}
          onChangeText={setRouteSearchQuery}
          placeholder="Buscar ruta por nombre o número…"
          placeholderTextColor={theme.textMuted}
          style={[styles.searchInput, {color: theme.text}]}
        />
      </View>

      <FilterChipRow value={transportFilter} onChange={setTransportFilter} />

      {routesError ? (
        <Text style={[styles.error, {color: theme.warning}]}>{routesError}</Text>
      ) : null}

      {routesLoading ? (
        <View style={styles.loading}>
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : displayedRoutes.length === 0 ? (
        <EmptyState
          title="Sin rutas"
          subtitle={transportFilter === 'fav' ? 'Marca rutas con la estrella para verlas aquí' : 'Prueba otro filtro o búsqueda'}
        />
      ) : (
        <>
          <Text style={[styles.count, {color: theme.textMuted}]}>
            {displayedRoutes.length} de {routes.length} rutas en Morelia
          </Text>
          <View style={styles.list}>
            {displayedRoutes.map((item: RouteItem) => (
              <RouteListItem
                key={item.id}
                route={item}
                selected={item.id === activeRouteId}
                onPress={() => activateRoute(item.id, routes)}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 12},
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  searchInput: {flex: 1, fontSize: 15, padding: 0},
  error: {paddingHorizontal: 16, fontSize: 13},
  loading: {gap: 8, paddingHorizontal: 16},
  count: {paddingHorizontal: 16, fontSize: 12, fontWeight: '600'},
  list: {gap: 8, paddingHorizontal: 16, paddingBottom: 24},
});
import {Star} from 'phosphor-react-native';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {isRouteFavorited} from '@rutas-morelia/transit-core';
import {useFavoritesStore} from '../../stores/favorites.store';
import {useTransitStore} from '../../stores/transit.store';
import {useUiStore} from '../../stores/ui.store';
import {useTheme} from '../../theme/ThemeProvider';
import {RouteChip} from '../ui/RouteChip';
import {Skeleton} from '../ui/Skeleton';

export function RouteDetailPanel() {
  const {theme} = useTheme();
  const routes = useTransitStore(s => s.routes);
  const routesLoading = useTransitStore(s => s.routesLoading);
  const activeRouteId = useTransitStore(s => s.activeRouteId);
  const setActiveRouteId = useTransitStore(s => s.setActiveRouteId);
  const geometryLoading = useUiStore(s => s.routeGeometryLoading);
  const favorites = useFavoritesStore(s => s.favorites);
  const toggleRoute = useFavoritesStore(s => s.toggleRoute);

  const active = routes.find(route => route.id === activeRouteId);

  return (
    <View style={styles.wrap}>
      {routesLoading ? (
        <View style={styles.loading}>
          <Skeleton height={52} />
          <Skeleton height={52} />
        </View>
      ) : (
        <>
          {active ? (
            <View style={[styles.header, {borderColor: theme.surfaceBorder}]}>
              <View style={{flex: 1}}>
                <Text style={{color: theme.text, fontSize: theme.typography.title, fontWeight: '700'}}>{active.name}</Text>
                <Text style={{color: theme.textMuted, marginTop: 2}}>
                  {active.number} · {active.detail}
                </Text>
              </View>
              <Pressable onPress={() => void toggleRoute(active.id)} hitSlop={8}>
                <Star
                  size={24}
                  color={theme.accent}
                  weight={isRouteFavorited(favorites, active.id) ? 'fill' : 'regular'}
                />
              </Pressable>
            </View>
          ) : null}
          {geometryLoading ? <Text style={{color: theme.textMuted, paddingHorizontal: 16}}>Cargando recorrido…</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {routes.map(route => (
              <RouteChip
                key={route.id}
                route={route}
                selected={route.id === activeRouteId}
                onPress={() => setActiveRouteId(route.id)}
              />
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 10, paddingBottom: 8},
  loading: {gap: 8, paddingHorizontal: 16},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  rail: {gap: 8, paddingHorizontal: 16, paddingVertical: 4},
});
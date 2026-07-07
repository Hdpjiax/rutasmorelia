import {Star} from 'phosphor-react-native';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {contrastColor, type RouteItem} from '@rutas-morelia/transit-core';
import {isRouteFavoritedInCatalog} from '../../services/favorites.service';
import {useFavoritesStore} from '../../stores/favorites.store';
import {useTransitStore} from '../../stores/transit.store';
import {useUiStore} from '../../stores/ui.store';
import {useTheme} from '../../theme/ThemeProvider';

type Props = {
  route: RouteItem;
  selected?: boolean;
  onPress: () => void;
};

export function RouteListItem({route, selected, onPress}: Props) {
  const {theme} = useTheme();
  const favorites = useFavoritesStore(s => s.favorites);
  const routes = useTransitStore(s => s.routes);
  const toggleRoute = useFavoritesStore(s => s.toggleRoute);
  const setMessage = useUiStore(s => s.setMessage);
  const isFav = isRouteFavoritedInCatalog(favorites, route, routes);
  const badgeColor = route.color || theme.accent;

  const onToggleFav = () => {
    void toggleRoute(route.id).then(() => {
      setMessage(isFav ? 'Ruta quitada de favoritos' : 'Ruta guardada en favoritos', 'success');
    });
  };

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        {
          backgroundColor: selected ? theme.accentMuted : theme.surface,
          borderColor: selected ? theme.accent : theme.surfaceBorder,
        },
      ]}>
      <View style={[styles.badge, {backgroundColor: badgeColor}]}>
        <Text style={[styles.badgeText, {color: contrastColor(badgeColor)}]}>{route.number}</Text>
      </View>
      <View style={styles.body}>
        <Text style={[styles.name, {color: theme.text}]} numberOfLines={1}>
          {route.name}
        </Text>
        <Text style={[styles.meta, {color: theme.textMuted}]}>
          {route.detail} · Toca para ver en mapa
        </Text>
      </View>
      <Pressable
        onPress={onToggleFav}
        hitSlop={10}
        style={[styles.starBtn, {backgroundColor: isFav ? theme.accentMuted : 'transparent'}]}>
        <Star size={20} color={theme.accent} weight={isFav ? 'fill' : 'regular'} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {fontWeight: '800', fontSize: 13},
  body: {flex: 1, gap: 2},
  name: {fontSize: 15, fontWeight: '700'},
  meta: {fontSize: 12},
  starBtn: {padding: 8, borderRadius: 999},
});
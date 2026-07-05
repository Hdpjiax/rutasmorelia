import {
  adjustRouteColorForDarkTheme,
  filterJourneyOptions,
  formatJourneyDetail,
  isRouteFavorited,
} from '@rutas-morelia/transit-core';
import {useMemo} from 'react';
import type {AppColorScheme} from '../lib/color-scheme';
import type {DrawerItem, FavoriteItem, JourneyOption, RouteItem} from '../types/transit';

type UseDrawerItemsOptions = {
  visibleRoutes: RouteItem[];
  journeyOptions: JourneyOption[];
  journeyTab: 'direct' | 'transfer';
  showOnlyFavorites: boolean;
  favorites: FavoriteItem[];
  colorScheme: AppColorScheme;
};

export function useDrawerItems({
  visibleRoutes,
  journeyOptions,
  journeyTab,
  showOnlyFavorites,
  favorites,
  colorScheme,
}: UseDrawerItemsOptions) {
  return useMemo<DrawerItem[]>(() => {
    let baseRoutes = visibleRoutes;
    if (showOnlyFavorites) {
      baseRoutes = visibleRoutes.filter(r => isRouteFavorited(favorites, r.id));
    }

    if (journeyOptions.length > 0 && !showOnlyFavorites) {
      return filterJourneyOptions(journeyOptions, journeyTab).map((option, index) => ({
        kind: 'route' as const,
        id: String(option.route_code || option.route_id),
        number: option.route_code ? option.route_code.split('_')[1] || option.route_code[0] : 'R',
        name: option.route_name,
        detail: formatJourneyDetail(option),
        time: `${option.estimatedMinutes} min`,
        secondaryTime: `$${option.fare || '11.00'}`,
        color:
          colorScheme === 'dark'
            ? adjustRouteColorForDarkTheme(option.route_color || '#FFA500')
            : option.route_color || '#FFA500',
        listKey: `${option.route_id}-${index}`,
      }));
    }

    return baseRoutes.map(route => ({
      ...route,
      kind: 'route' as const,
      color: colorScheme === 'dark' ? adjustRouteColorForDarkTheme(route.color) : route.color,
    }));
  }, [colorScheme, favorites, journeyOptions, journeyTab, showOnlyFavorites, visibleRoutes]);
}
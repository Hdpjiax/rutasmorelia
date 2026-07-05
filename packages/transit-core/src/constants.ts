import type {Coordinates} from './types';

export const MORELIA_CENTER: Coordinates = {latitude: 19.7027, longitude: -101.1944};

export const MORELIA_PHOTON_ANCHOR = {lat: 19.702, lon: -101.194} as const;

export const PUBLISHED_ROUTES_BASE_URL = 'https://www.viamorelia.org/routes';

export const OPENFREEMAP_STYLE_URLS = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

export const PERIPHERAL_ROAD_NAMES = [
  'Periférico Paseo de la República',
  'Circuito Periférico Paseo de la República',
  'Libramiento Paseo de la República',
] as const;

export const LOCAL_FAVORITES_KEY = 'local_favorites';

export const ROUTES_CACHE_KEY = '@viamorelia/routes-v4';

export const GEOMETRY_CACHE_PREFIX = '@viamorelia/geometry-v1-';
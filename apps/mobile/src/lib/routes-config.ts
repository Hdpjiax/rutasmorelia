import {Platform} from 'react-native';
import {
  buildLocalDevUrl,
  isLocalDevUrl,
  PUBLISHED_ROUTES_BASE_URL,
  ROUTES_CACHE_KEY,
} from '@rutas-morelia/transit-core';

export {PUBLISHED_ROUTES_BASE_URL, ROUTES_CACHE_KEY};

const platform = Platform.OS === 'android' ? 'android' : 'default';

export const LOCAL_ROUTES_BASE_URL = buildLocalDevUrl(3000, 'routes', platform);
export const LOCAL_API_BASE_URL = buildLocalDevUrl(4000, '', platform);

export function isLocalBaseUrl(base: string): boolean {
  return isLocalDevUrl(base);
}

/** En producción va directo al CDN publicado; en dev prueba el servidor local primero. */
export function getRouteFetchBases(): string[] {
  if (__DEV__) {
    return [LOCAL_ROUTES_BASE_URL, PUBLISHED_ROUTES_BASE_URL];
  }
  return [PUBLISHED_ROUTES_BASE_URL];
}
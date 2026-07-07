import {Platform} from 'react-native';
import {
  buildLocalDevUrl,
  isLocalDevUrl,
  PUBLISHED_ROUTES_BASE_URL,
} from '@rutas-morelia/transit-core';
import {env} from '../config/env';

const platform = Platform.OS === 'android' ? 'android' : 'default';

export const LOCAL_ROUTES_BASE_URL = buildLocalDevUrl(3000, 'routes', platform);

export function getPublishedRoutesBaseUrl(): string {
  return env.routesBaseUrl || PUBLISHED_ROUTES_BASE_URL;
}

export function isLocalBaseUrl(base: string): boolean {
  return isLocalDevUrl(base);
}

export function getRouteFetchBases(): string[] {
  const published = getPublishedRoutesBaseUrl();
  if (__DEV__ && env.routesBaseUrl) {
    return [env.routesBaseUrl, published];
  }
  return [published];
}

export function buildGeojsonUrl(base: string, geometryId: string): string {
  return `${base}/${encodeURIComponent(geometryId)}.geojson`;
}
import {MORELIA_CENTER, MORELIA_METRO_RADIUS_KM} from './constants';
import type {FeatureCollection} from 'geojson';
import type {Coordinates, RouteGeometry} from './types';

export function distanceKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function distanceMeters(a: Coordinates, b: Coordinates): number {
  return Math.round(distanceKm(a, b) * 1000);
}

export function lngLatToCoords(lngLat: [number, number]): Coordinates {
  return {longitude: lngLat[0], latitude: lngLat[1]};
}

export function isWithinMoreliaMetro(
  coords: Coordinates,
  radiusKm = MORELIA_METRO_RADIUS_KM,
): boolean {
  return distanceKm(coords, MORELIA_CENTER) <= radiusKm;
}

export function getGeometryBounds(geometry: RouteGeometry): [number, number, number, number] | null {
  const coordinates = geometry.type === 'MultiLineString' ? geometry.coordinates.flat() : geometry.coordinates;
  if (!coordinates.length) return null;

  let minLng = coordinates[0][0];
  let maxLng = minLng;
  let minLat = coordinates[0][1];
  let maxLat = minLat;
  for (const [lng, lat] of coordinates) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [minLng, minLat, maxLng, maxLat];
}

export function findClosestPointOnLine(
  geojson: FeatureCollection | null,
  target: Coordinates | null,
): [number, number] | null {
  if (!geojson || !target || !geojson.features) return null;
  let minDistance = Infinity;
  let closestCoord: [number, number] | null = null;

  const lat1 = target.latitude;
  const lon1 = target.longitude;

  const getDistanceSq = (p: [number, number]) => {
    const dLat = p[1] - lat1;
    const dLon = p[0] - lon1;
    return dLat * dLat + dLon * dLon;
  };

  for (const feature of geojson.features) {
    const geometry = feature.geometry;
    if (geometry?.type === 'LineString') {
      for (const p of geometry.coordinates) {
        const dist = getDistanceSq(p as [number, number]);
        if (dist < minDistance) {
          minDistance = dist;
          closestCoord = p as [number, number];
        }
      }
    } else if (geometry?.type === 'MultiLineString') {
      for (const line of geometry.coordinates) {
        for (const p of line) {
          const dist = getDistanceSq(p as [number, number]);
          if (dist < minDistance) {
            minDistance = dist;
            closestCoord = p as [number, number];
          }
        }
      }
    }
  }

  return closestCoord;
}

export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 12742 * Math.asin(Math.sqrt(a));
}
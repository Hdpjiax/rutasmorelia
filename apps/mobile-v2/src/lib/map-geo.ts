import type {Coordinates} from '@rutas-morelia/transit-core';
import type {Feature, FeatureCollection, LineString, MultiLineString} from 'geojson';

function isFiniteCoord(coord: number[]): coord is [number, number] {
  return coord.length >= 2 && Number.isFinite(coord[0]) && Number.isFinite(coord[1]);
}

function cleanLine(coords: number[][]): [number, number][] {
  return coords.filter(isFiniteCoord);
}

function cleanMultiLine(lines: number[][][]): [number, number][][] {
  return lines.map(cleanLine).filter(line => line.length >= 2);
}

export function isValidLngLat(lngLat: [number, number] | null | undefined): lngLat is [number, number] {
  if (!lngLat) return false;
  const [lng, lat] = lngLat;
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Keep only drawable line features (≥2 points per segment). */
export function sanitizeRouteLineGeojson(geojson: FeatureCollection | null): FeatureCollection | null {
  if (!geojson?.features?.length) return null;

  const features: Feature<LineString | MultiLineString>[] = [];

  for (const feature of geojson.features) {
    const geometry = feature.geometry;
    if (geometry?.type === 'LineString') {
      const coordinates = cleanLine(geometry.coordinates);
      if (coordinates.length < 2) continue;
      features.push({
        ...feature,
        geometry: {type: 'LineString', coordinates},
      });
      continue;
    }
    if (geometry?.type === 'MultiLineString') {
      const coordinates = cleanMultiLine(geometry.coordinates);
      if (!coordinates.length) continue;
      features.push({
        ...feature,
        geometry: {type: 'MultiLineString', coordinates},
      });
    }
  }

  return features.length ? {type: 'FeatureCollection', features} : null;
}

export function buildWalkingPathsGeojson(
  origin: Coordinates | null,
  destination: Coordinates | null,
  boarding: [number, number] | null,
  alighting: [number, number] | null,
): FeatureCollection | null {
  if (!origin || !destination || !boarding || !alighting) return null;
  if (!isValidLngLat(boarding) || !isValidLngLat(alighting)) return null;

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {kind: 'walk-to-boarding'},
        geometry: {
          type: 'LineString',
          coordinates: [
            [origin.longitude, origin.latitude],
            boarding,
          ],
        },
      },
      {
        type: 'Feature',
        properties: {kind: 'walk-to-destination'},
        geometry: {
          type: 'LineString',
          coordinates: [
            alighting,
            [destination.longitude, destination.latitude],
          ],
        },
      },
    ],
  };
}
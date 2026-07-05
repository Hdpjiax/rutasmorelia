import {MORELIA_PHOTON_ANCHOR} from './constants';
import type {Coordinates, Suggestion} from './types';

type LocationField =
  | string
  | {type?: string; coordinates?: [number, number]}
  | null
  | undefined;

export function parseLocationField(location: LocationField): Coordinates | null {
  if (!location) return null;
  if (typeof location === 'string') {
    const match = location.match(/POINT\(([^ ]+) ([^ ]+)\)/);
    if (!match) return null;
    return {latitude: parseFloat(match[2]), longitude: parseFloat(match[1])};
  }
  if (Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
    return {latitude: location.coordinates[1], longitude: location.coordinates[0]};
  }
  return null;
}

export function buildPhotonSearchUrl(query: string, limit = 10): string {
  return `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=${MORELIA_PHOTON_ANCHOR.lat}&lon=${MORELIA_PHOTON_ANCHOR.lon}&limit=${limit}`;
}

export function mapPhotonFeatures(features: unknown[]): Suggestion[] {
  if (!Array.isArray(features)) return [];
  return features.map((feature, index) => {
    const f = feature as {
      properties: Record<string, string | number | undefined>;
      geometry: {coordinates: [number, number]};
    };
    const p = f.properties;
    const name = String(p.name || '');
    const street = String(p.street || '');
    const housenumber = String(p.housenumber || '');
    const city = String(p.city || 'Morelia');
    const state = String(p.state || 'Michoacán');

    let label = name;
    if (housenumber && !label.includes(housenumber)) {
      label = `${label} ${housenumber}`;
    }

    const subtitleParts: string[] = [];
    if (street && street !== name) subtitleParts.push(street);
    subtitleParts.push(city, state);

    return {
      entity_type: 'place',
      entity_id: `photon-${p.osm_type}-${p.osm_id ?? index}`,
      label,
      subtitle: subtitleParts.join(', ').trim(),
      latitude: Number(f.geometry.coordinates[1]),
      longitude: Number(f.geometry.coordinates[0]),
    };
  });
}
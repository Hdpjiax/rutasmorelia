import {MORELIA_PHOTON_ANCHOR} from './constants';
import type {Coordinates, Suggestion} from './types';

type LocationField =
  | string
  | {type?: string; coordinates?: [number, number] | number[]; geometry?: {coordinates?: number[]}}
  | null
  | undefined;

const WKB_POINT = 1;
const WKB_SRID_FLAG = 0x20000000;

function parseEwkbPointHex(hex: string): Coordinates | null {
  const clean = hex.trim();
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length < 42 || clean.length % 2 !== 0) {
    return null;
  }

  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const littleEndian = bytes[0] === 1;
  const typeWithFlags = view.getUint32(1, littleEndian);
  const geometryType = typeWithFlags & 0xff;
  if (geometryType !== WKB_POINT) return null;

  let offset = 5;
  if ((typeWithFlags & WKB_SRID_FLAG) !== 0) offset += 4;

  if (bytes.length < offset + 16) return null;

  const lon = view.getFloat64(offset, littleEndian);
  const lat = view.getFloat64(offset + 8, littleEndian);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return {latitude: lat, longitude: lon};
}

export function parseLocationField(location: LocationField): Coordinates | null {
  if (!location) return null;
  if (typeof location === 'string') {
    const wktMatch = location.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
    if (wktMatch) {
      return {latitude: parseFloat(wktMatch[2]), longitude: parseFloat(wktMatch[1])};
    }
    return parseEwkbPointHex(location);
  }
  if (typeof location === 'object') {
    const raw = location.coordinates ?? location.geometry?.coordinates;
    if (Array.isArray(raw) && raw.length >= 2) {
      const lon = Number(raw[0]);
      const lat = Number(raw[1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return {latitude: lat, longitude: lon};
      }
    }
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

    let label = name || street || housenumber;
    if (street && housenumber) {
      label = name || `${street} ${housenumber}`;
    } else if (housenumber && label && !label.includes(housenumber)) {
      label = `${label} ${housenumber}`;
    }
    if (!label.trim()) {
      label = [street, city].filter(Boolean).join(', ') || 'Lugar en Morelia';
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
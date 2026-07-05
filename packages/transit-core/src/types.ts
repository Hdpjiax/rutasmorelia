import type {FeatureCollection, LineString, MultiLineString} from 'geojson';

export type Coordinates = {latitude: number; longitude: number};

export type Suggestion = {
  entity_type: string;
  entity_id: number | string;
  label: string;
  subtitle: string | null;
  latitude: number | null;
  longitude: number | null;
  saved_place_id?: number;
};

/** Alias unificado para autocompletado y selección de lugares (web + mobile). */
export type PlaceSuggestion = Suggestion;

export type RouteItem = {
  id: string;
  geometryId?: string;
  number: string;
  name: string;
  detail: string;
  time: string;
  color: string;
  transportType?: string;
};

export type RouteGeometry = LineString | MultiLineString;

export type CachedGeometry = {
  geojson: FeatureCollection;
  bounds: [number, number, number, number];
};

export type DrawerItem = RouteItem & {
  kind?: 'route' | 'stop';
  secondaryTime?: string;
  listKey?: string;
};

export type JourneyOption = {
  route_id: number | string;
  route_code?: string;
  route_name: string;
  route_color?: string;
  second_route_id?: number | string;
  second_route_code?: string;
  second_route_name?: string;
  second_route_color?: string;
  origin_walk_meters?: number;
  destination_walk_meters?: number;
  transfer_walk_meters?: number;
  boarding_stop_name?: string;
  alighting_stop_name?: string;
  transfers?: number;
  estimatedMinutes?: number;
  fare?: string;
};

export type FavoriteItem = {
  id: string | number;
  route_id?: number | string | null;
  place_id?: number | string | null;
  stop_id?: number | string | null;
  custom_name?: string | null;
  name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_local?: boolean;
  place?: {
    id: string | number;
    name: string;
    location?: {type: string; coordinates: number[]} | string | null;
  } | null;
  route?: {
    id: string | number;
    code: string;
  } | null;
};

export type MapStyleLayer = {
  id?: string;
  type?: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
};

export type MapStyleJson = {
  layers?: MapStyleLayer[];
  [key: string]: unknown;
};

export type DarkMapPalette = {
  bg: string;
  ink: string;
};

export type RouteIndexEntry = {
  id: string | number;
  name: string;
  color?: string;
  transportType?: string;
};

export const EMPTY_GEOJSON: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};
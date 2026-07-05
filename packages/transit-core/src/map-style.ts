import {OPENFREEMAP_STYLE_URLS, PERIPHERAL_ROAD_NAMES} from './constants';
import type {DarkMapPalette, MapStyleJson, MapStyleLayer} from './types';

export const DEFAULT_DARK_PALETTE: DarkMapPalette = {
  bg: '#2B303B',
  ink: '#C8CDD6',
};

function isRoadLineLayer(layer: MapStyleLayer): boolean {
  const id = (layer.id || '').toLowerCase();
  const isRoadLine =
    layer.type === 'line' &&
    (id.includes('road') ||
      id.includes('highway') ||
      id.includes('motorway') ||
      id.includes('street') ||
      id.includes('bridge') ||
      id.includes('tunnel') ||
      id.includes('transportation'));
  const isRail = id.includes('rail') || id.includes('train');
  return isRoadLine && !isRail;
}

function customizeDarkLayer(layer: MapStyleLayer, palette: DarkMapPalette): void {
  const id = (layer.id || '').toLowerCase();

  if (layer.type === 'background') {
    if (!layer.paint) layer.paint = {};
    layer.paint['background-color'] = palette.bg;
    return;
  }

  if (id.includes('water')) {
    if (!layer.paint) layer.paint = {};
    if (layer.type === 'fill') {
      layer.paint['fill-color'] = palette.bg;
      layer.paint['fill-opacity'] = 0.95;
    } else if (layer.type === 'line') {
      layer.paint['line-color'] = palette.bg;
    }
    return;
  }

  if (
    layer.type === 'fill' &&
    (id.includes('landuse') || id.includes('park') || id.includes('landcover') || id.includes('building'))
  ) {
    if (!layer.paint) layer.paint = {};
    layer.paint['fill-color'] = id.includes('building') ? '#323845' : '#30353F';
    layer.paint['fill-opacity'] = id.includes('building') ? 0.35 : 0.55;
    return;
  }

  if (isRoadLineLayer(layer)) {
    const isCasing = id.includes('case') || id.includes('casing') || id.includes('outline');
    if (!layer.paint) layer.paint = {};
    layer.paint['line-color'] = isCasing ? '#252932' : '#4A5160';
    layer.paint['line-opacity'] = isCasing ? 0.55 : 0.82;
    return;
  }

  const isLabel = layer.type === 'symbol' && layer.layout && layer.layout['text-field'];
  if (isLabel) {
    if (!layer.paint) layer.paint = {};
    layer.paint['text-color'] = palette.ink;
    layer.paint['text-halo-color'] = palette.bg;
    layer.paint['text-halo-width'] = 1.2;
    layer.paint['text-opacity'] = 0.75;
  }
}

function customizeLightLayer(layer: MapStyleLayer): void {
  if (!isRoadLineLayer(layer)) return;
  const id = (layer.id || '').toLowerCase();
  const isCasing = id.includes('case') || id.includes('casing') || id.includes('outline');
  if (!layer.paint) layer.paint = {};
  layer.paint['line-color'] = [
    'case',
    ['in', ['coalesce', ['get', 'name'], ''], ['literal', [...PERIPHERAL_ROAD_NAMES]]],
    isCasing ? '#c97846' : '#e9ad82',
    isCasing ? '#cbd0d8' : '#ffffff',
  ];
  layer.paint['line-opacity'] = isCasing ? 0.72 : 1.0;
}

export function customizeMapStyle(
  styleJson: MapStyleJson,
  colorScheme: 'light' | 'dark',
  darkPalette: DarkMapPalette = DEFAULT_DARK_PALETTE,
): MapStyleJson {
  if (!Array.isArray(styleJson.layers)) return styleJson;
  const palette = darkPalette;
  styleJson.layers.forEach(layer => {
    if (colorScheme === 'dark') customizeDarkLayer(layer, palette);
    else customizeLightLayer(layer);
  });
  return styleJson;
}

export function getMapStyleUrl(colorScheme: 'light' | 'dark'): string {
  return colorScheme === 'dark' ? OPENFREEMAP_STYLE_URLS.dark : OPENFREEMAP_STYLE_URLS.light;
}
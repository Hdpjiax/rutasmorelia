import {customizeMapStyle, getMapStyleUrl} from '@rutas-morelia/transit-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useEffect, useState} from 'react';
import {useColorScheme} from 'react-native';
import {resolveColorScheme, type AppColorScheme} from '../lib/color-scheme';
import type {MapStyleJson} from '../types/transit';

const DARK_GRAY_PALETTE = {bg: '#2A2E36', ink: '#B0B8C4'};

/** Liberty para alinear rutas; en oscuro se aplica capa gris opaca sobre el mismo tileset. */
export function useMapStyle() {
  const colorScheme = resolveColorScheme(useColorScheme());
  const [mapStyle, setMapStyle] = useState<MapStyleJson | string>(getMapStyleUrl(colorScheme));

  useEffect(() => {
    let active = true;
    const url = getMapStyleUrl(colorScheme);

    if (colorScheme === 'light') {
      setMapStyle(url);
      return;
    }

    const cacheKey = `custom_map_style_v7_liberty_dark`;

    async function loadDarkStyle() {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && active) {
          setMapStyle(JSON.parse(cached) as MapStyleJson);
        }
      } catch (err) {
        if (__DEV__) console.warn('[ViaMorelia] Failed to read dark style cache:', err);
      }

      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('style fetch failed');
        const styleJson = (await response.json()) as MapStyleJson;
        const customized = customizeMapStyle(styleJson, 'dark', DARK_GRAY_PALETTE);
        if (active) {
          setMapStyle(customized);
          await AsyncStorage.setItem(cacheKey, JSON.stringify(customized));
        }
      } catch (err) {
        if (__DEV__) console.warn('[ViaMorelia] Dark style fetch failed, using URL:', err);
        if (active) setMapStyle(url);
      }
    }

    void loadDarkStyle();
    return () => {
      active = false;
    };
  }, [colorScheme]);

  return {
    colorScheme: colorScheme as AppColorScheme,
    mapStyle,
    mapStyleUrl: getMapStyleUrl(colorScheme),
  };
}
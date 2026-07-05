import {customizeMapStyle, getMapStyleUrl} from '@rutas-morelia/transit-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useEffect, useState} from 'react';
import {useColorScheme} from 'react-native';
import {resolveColorScheme, type AppColorScheme} from '../lib/color-scheme';
import {dark} from '../theme';
import type {MapStyleJson} from '../types/transit';

export function useMapStyle() {
  const colorScheme = resolveColorScheme(useColorScheme());
  const [customMapStyle, setCustomMapStyle] = useState<MapStyleJson | string | null>(null);

  useEffect(() => {
    let active = true;
    const cacheKey = `custom_map_style_v3_${colorScheme}`;
    const url = getMapStyleUrl(colorScheme);

    async function loadStyle() {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && active) {
          setCustomMapStyle(JSON.parse(cached) as MapStyleJson);
        }
      } catch (err) {
        if (__DEV__) console.warn('[ViaMorelia] Failed to read style from cache:', err);
      }

      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('style fetch failed');
        const styleJson = (await response.json()) as MapStyleJson;
        const customized = customizeMapStyle(styleJson, colorScheme, {bg: dark.bg, ink: dark.ink});
        if (active) {
          setCustomMapStyle(customized);
          await AsyncStorage.setItem(cacheKey, JSON.stringify(customized));
        }
      } catch (err) {
        if (__DEV__) {
          console.warn('[ViaMorelia] Failed to fetch or customize style from network, using URL fallback:', err);
        }
        if (active) setCustomMapStyle(url);
      }
    }

    void loadStyle();
    return () => {
      active = false;
    };
  }, [colorScheme]);

  return {
    colorScheme: colorScheme as AppColorScheme,
    customMapStyle,
    mapStyleUrl: getMapStyleUrl(colorScheme),
  };
}
import {customizeMapStyle, getMapStyleUrl} from '@rutas-morelia/transit-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useEffect, useState} from 'react';
import {useColorScheme} from 'react-native';
import {resolveColorScheme, type AppColorScheme} from '../lib/color-scheme';
import type {MapStyleJson} from '../types/transit';

const DARK_GRAY_PALETTE = {bg: '#2A2E36', ink: '#B0B8C4'};

/** Liberty para alinear rutas; personaliza edificios y paleta según tema. */
export function useMapStyle() {
  const colorScheme = resolveColorScheme(useColorScheme());
  const [mapStyle, setMapStyle] = useState<MapStyleJson | string>(getMapStyleUrl(colorScheme));

  useEffect(() => {
    let active = true;
    const url = getMapStyleUrl(colorScheme);
    const cacheKey = `custom_map_style_v8_liberty_${colorScheme}`;

    async function loadStyle() {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && active) {
          setMapStyle(JSON.parse(cached) as MapStyleJson);
        }
      } catch (err) {
        if (__DEV__) console.warn('[ViaMorelia] Failed to read style cache:', err);
      }

      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('style fetch failed');
        const styleJson = (await response.json()) as MapStyleJson;
        const customized = customizeMapStyle(
          styleJson,
          colorScheme,
          colorScheme === 'dark' ? DARK_GRAY_PALETTE : undefined,
        );
        if (active) {
          setMapStyle(customized);
          await AsyncStorage.setItem(cacheKey, JSON.stringify(customized));
        }
      } catch (err) {
        if (__DEV__) console.warn('[ViaMorelia] Style fetch failed, using URL:', err);
        if (active) setMapStyle(url);
      }
    }

    void loadStyle();
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
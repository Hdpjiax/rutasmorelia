import {customizeMapStyle, getMapStyleUrl, type MapStyleJson} from '@rutas-morelia/transit-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useEffect, useState} from 'react';
import {useTheme} from '../theme/ThemeProvider';

export function useMapStyle() {
  const {scheme} = useTheme();
  const [mapStyle, setMapStyle] = useState<MapStyleJson | string>(getMapStyleUrl(scheme));

  useEffect(() => {
    let active = true;
    const url = getMapStyleUrl(scheme);
    const cacheKey = 'rm_v2_map_style_web_light_v1';

    async function loadStyle() {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && active) setMapStyle(JSON.parse(cached) as MapStyleJson);
      } catch {
        // ignore cache read
      }

      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('style fetch failed');
        const styleJson = (await response.json()) as MapStyleJson;
        const customized = customizeMapStyle(styleJson, 'light');
        if (active) {
          setMapStyle(customized);
          await AsyncStorage.setItem(cacheKey, JSON.stringify(customized));
        }
      } catch {
        if (active) setMapStyle(url);
      }
    }

    void loadStyle();
    return () => {
      active = false;
    };
  }, [scheme]);

  return {mapStyle, scheme};
}
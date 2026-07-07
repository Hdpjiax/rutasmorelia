import {customizeMapStyle, getMapStyleUrl, type MapStyleJson} from '@rutas-morelia/transit-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useEffect, useState} from 'react';
import {useTheme} from '../theme/ThemeProvider';

const NIGHT_PALETTE = {bg: '#070B12', ink: '#8FA3BC'};

export function useMapStyle() {
  const {scheme} = useTheme();
  const [mapStyle, setMapStyle] = useState<MapStyleJson | string>(getMapStyleUrl(scheme));

  useEffect(() => {
    let active = true;
    const url = getMapStyleUrl(scheme);
    const cacheKey = `rm_v2_map_style_${scheme}`;

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
        const customized = customizeMapStyle(styleJson, scheme, scheme === 'dark' ? NIGHT_PALETTE : undefined);
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
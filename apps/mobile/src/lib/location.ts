import {MORELIA_CENTER} from '@rutas-morelia/transit-core';
import Geolocation from '@react-native-community/geolocation';
import type {GeolocationResponse} from '@react-native-community/geolocation';

export {MORELIA_CENTER};

export function getAccurateNativePosition(
  maxWaitMs = 6000,
  requiredAccuracyM = 80,
): Promise<GeolocationResponse> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      position => {
        if (position.coords.accuracy <= requiredAccuracyM) {
          resolve(position);
          return;
        }
        Geolocation.getCurrentPosition(
          fallback => resolve(fallback),
          err => reject(err),
          {enableHighAccuracy: false, timeout: 3000, maximumAge: 10000},
        );
      },
      error => {
        if (__DEV__) {
          console.warn('[ViaMorelia] High accuracy location lookup failed, trying standard accuracy:', error);
        }
        Geolocation.getCurrentPosition(
          pos => resolve(pos),
          err => reject(err),
          {enableHighAccuracy: false, timeout: 3000, maximumAge: 10000},
        );
      },
      {enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 10000},
    );
  });
}
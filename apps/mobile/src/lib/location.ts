import {MORELIA_CENTER} from '@rutas-morelia/transit-core';
import Geolocation from '@react-native-community/geolocation';
import type {GeolocationError, GeolocationResponse} from '@react-native-community/geolocation';

export {MORELIA_CENTER};

export function getAccurateNativePosition(
  maxWaitMs = 5000,
  requiredAccuracyM = 150,
  onUpdate?: (position: GeolocationResponse) => void,
): Promise<GeolocationResponse> {
  return new Promise((resolve, reject) => {
    let best: GeolocationResponse | null = null;
    let settled = false;
    let watchId: number | undefined;

    const publish = (position: GeolocationResponse) => {
      if (!best || position.coords.accuracy < best.coords.accuracy) {
        best = position;
        onUpdate?.(position);
      }
    };

    const finish = (
      position: GeolocationResponse | null | undefined,
      error?: GeolocationError,
      acceptBest = false,
    ) => {
      if (settled) return;
      settled = true;
      if (watchId != null) Geolocation.clearWatch(watchId);
      clearTimeout(timer);

      const candidate = position ?? best;
      if (candidate && (acceptBest || candidate.coords.accuracy <= requiredAccuracyM)) {
        resolve(candidate);
        return;
      }
      reject(error || new Error('La señal GPS no tiene suficiente precisión'));
    };

    Geolocation.getCurrentPosition(
      position => {
        publish(position);
        if (position.coords.accuracy <= requiredAccuracyM) finish(position, undefined, true);
      },
      () => {},
      {enableHighAccuracy: false, timeout: 2500, maximumAge: 60_000},
    );

    const timer = setTimeout(() => finish(best, undefined, true), maxWaitMs);

    watchId = Geolocation.watchPosition(
      position => {
        publish(position);
        if (position.coords.accuracy <= requiredAccuracyM) finish(position, undefined, true);
      },
      error => {
        if (best) finish(best, undefined, true);
        else finish(undefined, error);
      },
      {enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 10_000},
    );
  });
}
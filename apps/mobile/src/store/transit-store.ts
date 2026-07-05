import type {Coordinates} from '@rutas-morelia/transit-core';
import {create} from 'zustand';

export type {Coordinates};

type TransitState = {
  originLabel: string;
  destinationLabel: string;
  origin: Coordinates | null;
  destination: Coordinates | null;
  activeRouteId: string;
  setOrigin: (label: string, coordinates?: Coordinates | null) => void;
  setDestination: (label: string, coordinates?: Coordinates | null) => void;
  setActiveRouteId: (id: string) => void;
};

export const useTransitStore = create<TransitState>(set => ({
  originLabel: 'Mi ubicación',
  destinationLabel: '',
  origin: null,
  destination: null,
  activeRouteId: '',
  setOrigin: (originLabel, origin = null) => set({originLabel, origin}),
  setDestination: (destinationLabel, destination = null) => set({destinationLabel, destination}),
  setActiveRouteId: activeRouteId => set({activeRouteId}),
}));
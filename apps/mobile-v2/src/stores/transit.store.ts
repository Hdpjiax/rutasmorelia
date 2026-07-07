import {DEFAULT_ORIGIN_LABEL, type Coordinates, type JourneyOption, type RouteItem} from '@rutas-morelia/transit-core';
import {create} from 'zustand';
import {effectiveRouteCatalog, resolveRouteCatalogId} from '../services/route-catalog-id';

export type SheetMode = 'collapsed' | 'search' | 'routes' | 'journey' | 'favorites';

type TransitState = {
  routes: RouteItem[];
  routesLoading: boolean;
  activeRouteId: string | null;
  originLabel: string;
  destinationLabel: string;
  origin: Coordinates | null;
  destination: Coordinates | null;
  journeyOptions: JourneyOption[];
  journeyTab: 'direct' | 'transfer';
  journeyLoading: boolean;
  sheetMode: SheetMode;
  activeInput: 'origin' | 'destination' | null;
  setRoutes: (routes: RouteItem[]) => void;
  setRoutesLoading: (loading: boolean) => void;
  setActiveRouteId: (id: string | null) => void;
  activateRoute: (ref: string | number | null | undefined, catalog: RouteItem[]) => void;
  setOrigin: (label: string, coords?: Coordinates | null) => void;
  setDestination: (label: string, coords?: Coordinates | null) => void;
  setJourneyOptions: (options: JourneyOption[]) => void;
  setJourneyTab: (tab: 'direct' | 'transfer') => void;
  setJourneyLoading: (loading: boolean) => void;
  setSheetMode: (mode: SheetMode) => void;
  setActiveInput: (input: 'origin' | 'destination' | null) => void;
  swapEndpoints: () => void;
  resetJourney: () => void;
};

export const useTransitStore = create<TransitState>((set, get) => ({
  routes: [],
  routesLoading: true,
  activeRouteId: null,
  originLabel: DEFAULT_ORIGIN_LABEL,
  destinationLabel: '',
  origin: null,
  destination: null,
  journeyOptions: [],
  journeyTab: 'direct',
  journeyLoading: false,
  sheetMode: 'collapsed',
  activeInput: null,
  setRoutes: routes => set({routes}),
  setRoutesLoading: routesLoading => set({routesLoading}),
  setActiveRouteId: activeRouteId => set({activeRouteId}),
  activateRoute: (ref, catalog) => {
    const id = resolveRouteCatalogId(ref, effectiveRouteCatalog(catalog));
    if (id) set({activeRouteId: id});
  },
  setOrigin: (originLabel, coords) =>
    set(coords === undefined ? {originLabel} : {originLabel, origin: coords}),
  setDestination: (destinationLabel, coords) =>
    set(coords === undefined ? {destinationLabel} : {destinationLabel, destination: coords}),
  setJourneyOptions: journeyOptions => set({journeyOptions}),
  setJourneyTab: journeyTab => set({journeyTab}),
  setJourneyLoading: journeyLoading => set({journeyLoading}),
  setSheetMode: sheetMode => set({sheetMode}),
  setActiveInput: activeInput => set({activeInput}),
  swapEndpoints: () => {
    const {originLabel, destinationLabel, origin, destination} = get();
    set({
      originLabel: destinationLabel || DEFAULT_ORIGIN_LABEL,
      destinationLabel: originLabel === DEFAULT_ORIGIN_LABEL ? '' : originLabel,
      origin: destination,
      destination: origin,
    });
  },
  resetJourney: () => set({journeyOptions: [], journeyTab: 'direct', journeyLoading: false}),
}));
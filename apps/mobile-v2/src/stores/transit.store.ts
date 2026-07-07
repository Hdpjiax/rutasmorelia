import {
  DEFAULT_ORIGIN_LABEL,
  filterJourneyOptions,
  isSameJourneyOption,
  type Coordinates,
  type JourneyOption,
  type RouteItem,
  type TransportFilter,
} from '@rutas-morelia/transit-core';
import {create} from 'zustand';
import {effectiveRouteCatalog, resolveRouteCatalogId} from '../services/route-catalog-id';

export type AppTab = 'trip' | 'routes' | 'favorites';
export type SheetMode = 'collapsed' | 'search' | 'routes' | 'journey' | 'favorites';

type TransitState = {
  routes: RouteItem[];
  routesLoading: boolean;
  routesError: string | null;
  activeRouteId: string | null;
  activeJourneyOption: JourneyOption | null;
  appTab: AppTab;
  transportFilter: TransportFilter;
  routeSearchQuery: string;
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
  setRoutesError: (error: string | null) => void;
  setActiveRouteId: (id: string | null) => void;
  setAppTab: (tab: AppTab) => void;
  setTransportFilter: (filter: TransportFilter) => void;
  setRouteSearchQuery: (query: string) => void;
  activateRoute: (ref: string | number | null | undefined, catalog: RouteItem[]) => void;
  selectJourneyOption: (option: JourneyOption | null) => void;
  setOrigin: (label: string, coords?: Coordinates | null) => void;
  setDestination: (label: string, coords?: Coordinates | null) => void;
  setJourneyOptions: (options: JourneyOption[]) => void;
  setJourneyTab: (tab: 'direct' | 'transfer') => void;
  setJourneyLoading: (loading: boolean) => void;
  setSheetMode: (mode: SheetMode) => void;
  setActiveInput: (input: 'origin' | 'destination' | null) => void;
  swapEndpoints: () => void;
  resetJourney: () => void;
  clearMapRoutes: () => void;
};

export const useTransitStore = create<TransitState>((set, get) => ({
  routes: [],
  routesLoading: true,
  routesError: null,
  activeRouteId: null,
  activeJourneyOption: null,
  appTab: 'trip',
  transportFilter: 'all',
  routeSearchQuery: '',
  originLabel: DEFAULT_ORIGIN_LABEL,
  destinationLabel: '',
  origin: null,
  destination: null,
  journeyOptions: [],
  journeyTab: 'direct',
  journeyLoading: false,
  sheetMode: 'search',
  activeInput: null,
  setRoutes: routes => set({routes}),
  setRoutesLoading: routesLoading => set({routesLoading}),
  setRoutesError: routesError => set({routesError}),
  setActiveRouteId: activeRouteId => set({activeRouteId}),
  setAppTab: appTab =>
    set({
      appTab,
      sheetMode: appTab === 'trip' ? 'search' : appTab === 'routes' ? 'routes' : 'favorites',
    }),
  setTransportFilter: transportFilter => set({transportFilter}),
  setRouteSearchQuery: routeSearchQuery => set({routeSearchQuery}),
  activateRoute: (ref, catalog) => {
    const id = resolveRouteCatalogId(ref, effectiveRouteCatalog(catalog));
    if (id) {
      set({
        activeRouteId: id,
        activeJourneyOption: null,
        journeyOptions: [],
        sheetMode: 'routes',
      });
    }
  },
  selectJourneyOption: option => set({activeJourneyOption: option, activeRouteId: null}),
  setOrigin: (originLabel, coords) =>
    set(coords === undefined ? {originLabel} : {originLabel, origin: coords}),
  setDestination: (destinationLabel, coords) =>
    set(coords === undefined ? {destinationLabel} : {destinationLabel, destination: coords}),
  setJourneyOptions: journeyOptions => set({journeyOptions}),
  setJourneyTab: journeyTab => {
    const {journeyOptions, activeJourneyOption} = get();
    const pool = filterJourneyOptions(journeyOptions, journeyTab);
    const keepCurrent = activeJourneyOption && pool.some(option => isSameJourneyOption(option, activeJourneyOption));
    set({
      journeyTab,
      activeJourneyOption: keepCurrent ? activeJourneyOption : pool[0] ?? null,
    });
  },
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
  resetJourney: () =>
    set({
      journeyOptions: [],
      journeyTab: 'direct',
      journeyLoading: false,
      activeJourneyOption: null,
    }),
  clearMapRoutes: () => set({activeRouteId: null, activeJourneyOption: null, journeyOptions: []}),
}));
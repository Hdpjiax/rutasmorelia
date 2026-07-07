import {selectInitialJourneyOption, type Coordinates} from '@rutas-morelia/transit-core';
import type {FeatureCollection} from 'geojson';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {cleanup, render, screen, waitFor} from '@testing-library/react-native';
import React, {createRef} from 'react';
import {Text} from 'react-native';
import type {CameraRef} from '@maplibre/maplibre-react-native';
import {RouteLayers} from '../src/components/map/RouteLayers';
import {TransitMap} from '../src/components/map/TransitMap';
import {useJourneyRoutesGeometry} from '../src/hooks/useJourneyRoutesGeometry';
import {useRouteGeometry} from '../src/hooks/useRouteGeometry';
import {computeGeometryBounds, writeCachedGeometry} from '../src/services/geometry.service';
import {planJourney} from '../src/services/journey.service';
import {effectiveRouteCatalog} from '../src/services/route-catalog-id';
import {asyncStorageAdapter} from '../src/services/storage/async-storage.adapter';
import {FALLBACK_ROUTES} from '../src/services/routes.service';
import {useTransitStore} from '../src/stores/transit.store';
import {useUiStore} from '../src/stores/ui.store';
import {ThemeProvider} from '../src/theme/ThemeProvider';

const origin: Coordinates = {latitude: 19.7027, longitude: -101.1944};
const destination: Coordinates = {latitude: 19.71, longitude: -101.18};

const fixtureGeojson: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {color: '#FFC800'},
      geometry: {
        type: 'LineString',
        coordinates: [
          [-101.2, 19.7],
          [-101.19, 19.71],
        ],
      },
    },
  ],
};

function JourneyGeometryProbe({camera}: {camera: React.RefObject<CameraRef | null>}) {
  const {activeGeojson} = useJourneyRoutesGeometry(camera);
  return <RouteLayers geojson={activeGeojson} casingColor="#1A2230" />;
}

function CatalogGeometryProbe({camera}: {camera: React.RefObject<CameraRef | null>}) {
  const {geojson, error} = useRouteGeometry(camera);
  return (
    <>
      <RouteLayers geojson={geojson} casingColor="#1A2230" />
      {error ? <Text testID="geometry-error">{error}</Text> : null}
    </>
  );
}

async function seedGeometryCache() {
  const bounds = computeGeometryBounds(fixtureGeojson);
  if (!bounds) throw new Error('Fixture geojson must produce bounds');
  const cached = {rawGeojson: fixtureGeojson, bounds};
  for (const route of FALLBACK_ROUTES) {
    const geometryId = route.geometryId ?? route.id;
    await writeCachedGeometry(asyncStorageAdapter, geometryId, cached);
  }
}

function resetStores() {
  useTransitStore.setState({
    routes: FALLBACK_ROUTES,
    activeRouteId: null,
    origin: null,
    destination: null,
    journeyOptions: [],
    journeyLoading: false,
  });
  useUiStore.setState({routeGeometryLoading: false, message: null, toastKind: 'info', sheetSnapIndex: 0});
}

describe('TransitMap geometry flow (shipped hook + components)', () => {
  beforeEach(async () => {
    cleanup();
    (AsyncStorage as unknown as {__reset: () => void}).__reset?.();
    await seedGeometryCache();
    resetStores();
  });

  afterEach(() => {
    cleanup();
  });

  it('planJourney → selectJourneyOption → useRouteGeometry loads geojson into RouteLayers', async () => {
    const catalog = effectiveRouteCatalog([]);
    const {options} = await planJourney(null, origin, destination, catalog);
    const initialOption = selectInitialJourneyOption(options);
    expect(initialOption).toBeTruthy();

    useTransitStore.getState().setRoutes(catalog);
    useTransitStore.getState().setOrigin('Origen', origin);
    useTransitStore.getState().setDestination('Destino', destination);
    useTransitStore.getState().setJourneyOptions(options);
    useTransitStore.getState().selectJourneyOption(initialOption);
    expect(useTransitStore.getState().activeJourneyOption).toBeTruthy();

    const camera = createRef<CameraRef | null>();
    await render(
      <ThemeProvider>
        <JourneyGeometryProbe camera={camera} />
      </ThemeProvider>,
    );

    await waitFor(
      () => {
        const source = screen.getByTestId('geojson-source');
        expect(Number(source.props.accessibilityLabel)).toBeGreaterThan(0);
        expect(useUiStore.getState().routeGeometryLoading).toBe(false);
      },
      {timeout: 15000},
    );
  }, 20000);

  it('TransitMap renders RouteLayers with geojson after route activation', async () => {
    useTransitStore.getState().activateRoute('A78', FALLBACK_ROUTES);
    expect(useTransitStore.getState().activeRouteId).toBe('78');

    const camera = createRef<CameraRef | null>();
    await render(
      <ThemeProvider>
        <TransitMap cameraRef={camera} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('map-view')).toBeTruthy();

    await waitFor(
      () => {
        const sources = screen.getAllByTestId('geojson-source');
        expect(sources.some(source => Number(source.props.accessibilityLabel) > 0)).toBe(true);
      },
      {timeout: 15000},
    );
  }, 20000);
});
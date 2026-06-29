/* global jest */

jest.mock('@react-native-async-storage/async-storage', () => {
  const storage = new Map();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(key => Promise.resolve(storage.get(key) ?? null)),
      setItem: jest.fn((key, value) => {
        storage.set(key, value);
        return Promise.resolve();
      }),
      removeItem: jest.fn(key => {
        storage.delete(key);
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        storage.clear();
        return Promise.resolve();
      }),
    },
  };
});

jest.mock('@react-native-community/geolocation', () => ({
  getCurrentPosition: jest.fn(),
  requestAuthorization: jest.fn(),
  setRNConfiguration: jest.fn(),
  stopObserving: jest.fn(),
}));

jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react');
  const {View} = require('react-native');
  const MockView = ({children, ...props}) => React.createElement(View, props, children);
  const Camera = React.forwardRef((_props, ref) => {
    React.useImperativeHandle(ref, () => ({fitBounds: jest.fn()}));
    return null;
  });

  return {
    Camera,
    GeoJSONSource: MockView,
    Layer: MockView,
    Map: MockView,
  };
});

jest.mock('./src/lib/supabase', () => ({supabase: null}));

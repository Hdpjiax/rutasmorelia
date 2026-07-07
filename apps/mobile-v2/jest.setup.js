jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: jest.fn(() => 'dark'),
}));

jest.mock('./src/hooks/useMapStyle', () => ({
  useMapStyle: () => ({scheme: 'dark', mapStyle: 'https://tiles.openfreemap.org/styles/dark'}),
}));
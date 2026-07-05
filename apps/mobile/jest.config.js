module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@rutas-morelia/transit-core$': '<rootDir>/node_modules/@rutas-morelia/transit-core/dist/index.js',
  },
  transformIgnorePatterns: [
    'packages/transit-core/dist',
    'node_modules/@rutas-morelia/transit-core/dist',
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-async-storage|@react-navigation|@maplibre|react-native-url-polyfill|phosphor-react-native|react-native-svg)/)',
  ],
};

/** @type {import('jest').Config} */
const sharedMappers = {
  '^@maplibre/maplibre-react-native$': '<rootDir>/__mocks__/@maplibre/maplibre-react-native.tsx',
  '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/@react-native-async-storage/async-storage.ts',
  '^react-native-reanimated$': '<rootDir>/__mocks__/react-native-reanimated.ts',
};

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['**/__tests__/**/*.test.ts'],
      moduleFileExtensions: ['ts', 'tsx', 'js'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {tsconfig: 'tsconfig.json'}],
      },
      moduleNameMapper: {
        '^react-native$': '<rootDir>/__mocks__/react-native-unit.ts',
      },
    },
    {
      displayName: 'components',
      preset: 'jest-expo',
      testEnvironment: 'node',
      testMatch: ['**/__tests__/**/*.test.tsx'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@gorhom/bottom-sheet|@maplibre/.*|phosphor-react-native)',
      ],
      moduleNameMapper: sharedMappers,
    },
  ],
};
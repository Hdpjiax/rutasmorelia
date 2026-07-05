import type {ColorSchemeName} from 'react-native';

export type AppColorScheme = 'light' | 'dark';

export function resolveColorScheme(scheme: ColorSchemeName): AppColorScheme {
  return scheme === 'dark' ? 'dark' : 'light';
}
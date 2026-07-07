import {createContext, useContext, useMemo, type ReactNode} from 'react';
import {useColorScheme} from 'react-native';
import {getTheme, type ColorScheme, type ThemeTokens} from './tokens';

type ThemeContextValue = {
  scheme: ColorScheme;
  theme: ThemeTokens;
};

const ThemeContext = createContext<ThemeContextValue>({
  scheme: 'dark',
  theme: getTheme('dark'),
});

export function ThemeProvider({children}: {children: ReactNode}) {
  const systemScheme = useColorScheme();
  const scheme: ColorScheme = systemScheme === 'light' ? 'light' : 'dark';
  const value = useMemo(() => ({scheme, theme: getTheme(scheme)}), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
import {createContext, useContext, useMemo, type ReactNode} from 'react';
import {getTheme, type ColorScheme, type ThemeTokens} from './tokens';

type ThemeContextValue = {
  scheme: ColorScheme;
  theme: ThemeTokens;
};

const ThemeContext = createContext<ThemeContextValue>({
  scheme: 'light',
  theme: getTheme('light'),
});

export function ThemeProvider({children}: {children: ReactNode}) {
  const value = useMemo(() => ({scheme: 'light' as ColorScheme, theme: getTheme('light')}), []);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
export type ColorScheme = 'light' | 'dark';

export type ThemeTokens = {
  bg: string;
  bgElevated: string;
  surface: string;
  surfaceBorder: string;
  text: string;
  textMuted: string;
  textInverse: string;
  accent: string;
  accentAlt: string;
  accentMuted: string;
  routeCasing: string;
  danger: string;
  success: string;
  warning: string;
  shadow: string;
  mapOverlay: string;
  glass: string;
  auroraStart: string;
  auroraEnd: string;
  radius: {sm: number; md: number; lg: number; xl: number; pill: number};
  spacing: {xs: number; sm: number; md: number; lg: number; xl: number; xxl: number};
  motion: {fast: number; normal: number; slow: number};
  typography: {
    caption: number;
    body: number;
    subtitle: number;
    title: number;
    hero: number;
  };
};

const shared = {
  radius: {sm: 10, md: 14, lg: 18, xl: 26, pill: 999},
  spacing: {xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32},
  motion: {fast: 160, normal: 260, slow: 400},
  typography: {caption: 12, body: 15, subtitle: 17, title: 22, hero: 30},
};

/** Map-first — fondo claro alineado con el estilo web blanco/gris. */
export const lightTheme: ThemeTokens = {
  ...shared,
  bg: '#F8FAFC',
  bgElevated: '#FFFFFF',
  surface: 'rgba(255, 255, 255, 0.9)',
  surfaceBorder: 'rgba(148, 163, 184, 0.28)',
  text: '#111827',
  textMuted: '#64748B',
  textInverse: '#FFFFFF',
  accent: '#0891B2',
  accentAlt: '#0D9488',
  accentMuted: 'rgba(8, 145, 178, 0.1)',
  routeCasing: '#111827',
  danger: '#E11D48',
  success: '#059669',
  warning: '#D97706',
  shadow: 'rgba(15, 23, 42, 0.08)',
  mapOverlay: 'transparent',
  glass: 'rgba(255, 255, 255, 0.88)',
  auroraStart: '#F1F5F9',
  auroraEnd: '#E2E8F0',
};

export const darkTheme: ThemeTokens = {
  ...lightTheme,
};

export function getTheme(_scheme: ColorScheme): ThemeTokens {
  return lightTheme;
}
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
  radius: {sm: 8, md: 12, lg: 16, xl: 24, pill: 999},
  spacing: {xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32},
  motion: {fast: 150, normal: 280, slow: 420},
  typography: {caption: 11, body: 14, subtitle: 16, title: 20, hero: 28},
};

export const darkTheme: ThemeTokens = {
  ...shared,
  bg: '#070B12',
  bgElevated: '#0E1420',
  surface: 'rgba(14, 20, 32, 0.88)',
  surfaceBorder: 'rgba(0, 229, 255, 0.14)',
  text: '#E8EDF5',
  textMuted: '#6B7D96',
  textInverse: '#070B12',
  accent: '#00E5FF',
  accentAlt: '#00FF9C',
  accentMuted: 'rgba(0, 229, 255, 0.18)',
  routeCasing: '#1A2230',
  danger: '#FF4466',
  success: '#00FF9C',
  warning: '#FFB020',
  shadow: 'rgba(0, 0, 0, 0.45)',
  mapOverlay: 'rgba(7, 11, 18, 0.35)',
};

export const lightTheme: ThemeTokens = {
  ...shared,
  bg: '#EEF2F7',
  bgElevated: '#FFFFFF',
  surface: 'rgba(255, 255, 255, 0.92)',
  surfaceBorder: 'rgba(0, 140, 170, 0.18)',
  text: '#0D1520',
  textMuted: '#5A6B7D',
  textInverse: '#FFFFFF',
  accent: '#0097B2',
  accentAlt: '#00A86B',
  accentMuted: 'rgba(0, 151, 178, 0.12)',
  routeCasing: '#D8DEE8',
  danger: '#E0344F',
  success: '#00A86B',
  warning: '#D48806',
  shadow: 'rgba(13, 21, 32, 0.12)',
  mapOverlay: 'rgba(238, 242, 247, 0.4)',
};

export function getTheme(scheme: ColorScheme): ThemeTokens {
  return scheme === 'dark' ? darkTheme : lightTheme;
}
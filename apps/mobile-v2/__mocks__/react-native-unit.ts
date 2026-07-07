export const Platform = {
  OS: 'android',
  select: (options: Record<string, unknown>) => options.android ?? options.default,
};
export const StyleSheet = {create: (styles: unknown) => styles};
export const View = 'View';
export const Text = 'Text';
export const Pressable = 'Pressable';
export const ScrollView = 'ScrollView';
export const Keyboard = {dismiss: jest.fn()};
export const useColorScheme = jest.fn(() => 'dark');
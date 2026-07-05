export const ANDROID_EMULATOR_HOST = '10.0.2.2';
export const LOCALHOST = 'localhost';

export type DevPlatform = 'android' | 'ios' | 'default';

export function getLocalDevHost(platform: DevPlatform = 'default'): string {
  return platform === 'android' ? ANDROID_EMULATOR_HOST : LOCALHOST;
}

export function buildLocalDevUrl(
  port: number,
  path = '',
  platform: DevPlatform = 'default',
): string {
  const host = getLocalDevHost(platform);
  const normalizedPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';
  return `http://${host}:${port}${normalizedPath}`;
}

export function isLocalDevUrl(url: string): boolean {
  return url.includes(ANDROID_EMULATOR_HOST) || url.includes(LOCALHOST);
}
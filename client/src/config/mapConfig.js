import { Platform } from 'react-native';

export const MAPTILER_STYLE_ID = 'dataviz-v4-light';
export const DEFAULT_MAP_CENTER = [34.8516, 31.0461];
export const DEFAULT_MAP_ZOOM = 7;
export const USER_MAP_ZOOM = 15;
export const MAP_MIN_DISCOVERY_ZOOM = 4;

export function getMapTilerKey(platform = Platform.OS) {
  const localKey = process.env.EXPO_PUBLIC_MAPTILER_KEY || '';
  return platform === 'web'
    ? process.env.EXPO_PUBLIC_MAPTILER_WEB_KEY || localKey
    : process.env.EXPO_PUBLIC_MAPTILER_MOBILE_KEY || localKey;
}

export function getMapTilerStyleUrl(key = getMapTilerKey()) {
  if (!key) return null;
  return `https://api.maptiler.com/maps/${MAPTILER_STYLE_ID}/style.json?key=${encodeURIComponent(key)}`;
}

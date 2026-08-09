import {
  getMapTilerKey,
  getMapTilerStyleUrl,
  MAPTILER_STYLE_ID,
} from '../src/config/mapConfig';

describe('MapTiler configuration', () => {
  const originalWeb = process.env.EXPO_PUBLIC_MAPTILER_WEB_KEY;
  const originalMobile = process.env.EXPO_PUBLIC_MAPTILER_MOBILE_KEY;

  afterEach(() => {
    process.env.EXPO_PUBLIC_MAPTILER_WEB_KEY = originalWeb;
    process.env.EXPO_PUBLIC_MAPTILER_MOBILE_KEY = originalMobile;
  });

  it('uses separate web and mobile keys', () => {
    process.env.EXPO_PUBLIC_MAPTILER_WEB_KEY = 'web-key';
    process.env.EXPO_PUBLIC_MAPTILER_MOBILE_KEY = 'mobile-key';
    expect(getMapTilerKey('web')).toBe('web-key');
    expect(getMapTilerKey('ios')).toBe('mobile-key');
    expect(getMapTilerStyleUrl('mobile-key')).toBe(
      `https://api.maptiler.com/maps/${MAPTILER_STYLE_ID}/style.json?key=mobile-key`
    );
  });

  it('returns no style URL when the relevant key is missing', () => {
    process.env.EXPO_PUBLIC_MAPTILER_WEB_KEY = '';
    process.env.EXPO_PUBLIC_MAPTILER_MOBILE_KEY = '';
    expect(getMapTilerKey('web')).toBe('');
    expect(getMapTilerKey('android')).toBe('');
    expect(getMapTilerStyleUrl('')).toBeNull();
  });
});

import { favoriteCityPreviewIsCurrent } from '../src/hooks/useFavoriteCityIds';

jest.mock('../src/hooks/useFavorites', () => ({ useFavorites: () => ({ favorites: [], loading: false }) }));
jest.mock('../src/services/SocialService', () => ({ setFavorite: jest.fn() }));

describe('favorite destination cache expiry', () => {
  const now = Date.parse('2026-08-12T00:00:00Z');

  test('keeps only projections whose Google cache is still valid', () => {
    expect(favoriteCityPreviewIsCurrent({
      preview: { cacheExpiresAt: { toMillis: () => now + 1 } },
    }, now)).toBe(true);
    expect(favoriteCityPreviewIsCurrent({
      preview: { cacheExpiresAt: new Date(now - 1) },
    }, now)).toBe(false);
  });

  test('rejects missing or malformed expiry metadata', () => {
    expect(favoriteCityPreviewIsCurrent({ preview: {} }, now)).toBe(false);
    expect(favoriteCityPreviewIsCurrent({ preview: { cacheExpiresAt: 'invalid' } }, now)).toBe(false);
  });
});

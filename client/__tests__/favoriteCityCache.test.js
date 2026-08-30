import { favoriteCityPreviewIsUsable } from '../src/hooks/useFavoriteCityIds';

jest.mock('../src/hooks/useFavorites', () => ({ useFavorites: () => ({ favorites: [], loading: false }) }));
jest.mock('../src/services/SocialService', () => ({ setFavorite: jest.fn() }));

describe('favorite destination preview availability', () => {
  test('keeps a named projection after its historical Google cache expiry', () => {
    expect(favoriteCityPreviewIsUsable({
      preview: { title: 'פריז', cacheExpiresAt: new Date('2020-01-01T00:00:00.000Z') },
    })).toBe(true);
  });

  test('rejects previews without a display title', () => {
    expect(favoriteCityPreviewIsUsable({ preview: {} })).toBe(false);
    expect(favoriteCityPreviewIsUsable({ preview: { title: '   ' } })).toBe(false);
  });
});

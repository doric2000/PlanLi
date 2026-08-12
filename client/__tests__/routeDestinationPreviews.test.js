import { getRouteDestinationPreviews } from '../src/features/roadtrip/utils/routeDestinationPreviews';

describe('route destination previews', () => {
  it('uses catalog thumbnails and keeps one entry per destination', () => {
    const previews = getRouteDestinationPreviews({
      destinationPreviews: [
        {
          countryId: 'TH', cityId: 'chiang-mai', name: 'צ׳יאנג מאי',
          destinationImage: { urls: { thumb: 'https://img.example/cm.jpg' } },
        },
        { countryId: 'TH', cityId: 'chiang-mai', name: 'Duplicate' },
        { countryId: 'TH', cityId: 'pai', name: 'פאי' },
      ],
    });

    expect(previews).toEqual([
      expect.objectContaining({ name: 'צ׳יאנג מאי', imageUrl: 'https://img.example/cm.jpg' }),
      expect.objectContaining({ name: 'פאי', imageUrl: null }),
    ]);
  });

  it('falls back to a matching stop image for detailed legacy routes', () => {
    const [preview] = getRouteDestinationPreviews({
      destinations: [{ countryId: 'FR', cityId: 'paris', cityName: 'פריז' }],
      days: [{ stops: [{
        destination: { countryId: 'FR', cityId: 'paris' },
        media: { thumb: { url: 'https://img.example/stop.jpg' } },
      }] }],
    });
    expect(preview.imageUrl).toBe('https://img.example/stop.jpg');
  });
});

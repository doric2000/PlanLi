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

  it('does not place a credit-required provider image in a 30px route preview', () => {
    const [preview] = getRouteDestinationPreviews({
      destinationPreviews: [{
        countryId: 'FR',
        cityId: 'paris',
        name: 'פריז',
        destinationImage: {
          source: { type: 'unsplash' },
          urls: { thumb: 'https://images.unsplash.com/paris.jpg' },
          attribution: {
            photographerName: 'Traveler',
            photographerProfileUrl: 'https://unsplash.com/@traveler?utm_source=planli&utm_medium=referral',
            providerName: 'Unsplash',
          },
        },
      }],
    });

    expect(preview.imageUrl).toBeNull();
  });

  it('prefers stop media over a provider image and allows attribution-free Commons media', () => {
    const [withStop] = getRouteDestinationPreviews({
      destinationPreviews: [{
        countryId: 'FR',
        cityId: 'paris',
        name: 'פריז',
        destinationImage: {
          source: { type: 'unsplash' },
          urls: { thumb: 'https://images.unsplash.com/paris.jpg' },
          attribution: {
            photographerName: 'Traveler',
            photographerProfileUrl: 'https://unsplash.com/@traveler',
            providerName: 'Unsplash',
          },
        },
      }],
      days: [{ stops: [{
        destination: { countryId: 'FR', cityId: 'paris' },
        media: { thumb: { url: 'https://img.example/user-stop.jpg' } },
      }] }],
    });
    expect(withStop.imageUrl).toBe('https://img.example/user-stop.jpg');

    const [publicDomain] = getRouteDestinationPreviews({
      destinationPreviews: [{
        countryId: 'IT',
        cityId: 'rome',
        name: 'רומא',
        destinationImage: {
          source: { type: 'wikimedia' },
          urls: { thumb: 'https://upload.wikimedia.org/rome.jpg' },
          attribution: { licenseName: 'Public Domain' },
        },
      }],
    });
    expect(publicDomain.imageUrl).toBe('https://upload.wikimedia.org/rome.jpg');
  });
});

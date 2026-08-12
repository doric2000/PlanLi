import {
  getDestinationAttribution,
  getDestinationImageUrl,
} from './destinationImages';

test('destination images expose Wikimedia variants and attribution', () => {
  const destination = {
    destinationImage: {
      source: { type: 'wikimedia' },
      urls: {
        large: 'https://upload.wikimedia.org/large.jpg',
        feed: 'https://upload.wikimedia.org/feed.jpg',
        thumb: 'https://upload.wikimedia.org/thumb.jpg',
      },
      attribution: {
        photographerName: 'Traveler',
        providerName: 'Wikimedia Commons',
      },
    },
  };

  expect(getDestinationImageUrl(destination, 'thumb')).toBe('https://upload.wikimedia.org/thumb.jpg');
  expect(getDestinationAttribution(destination)).toEqual(destination.destinationImage.attribution);
});

test('unknown destination image providers do not expose untrusted attribution', () => {
  expect(getDestinationAttribution({
    destinationImage: { source: { type: 'unknown' }, attribution: { providerName: 'Unknown' } },
  })).toBeNull();
});

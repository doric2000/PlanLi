import {
  canDisplayDestinationImageWithoutCredit,
  getDestinationAttribution,
  getDestinationCreditPolicy,
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
        photoUrl: 'https://commons.wikimedia.org/wiki/File:Traveler.jpg',
        licenseName: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      },
    },
  };

  expect(getDestinationImageUrl(destination, 'thumb')).toBe('https://upload.wikimedia.org/thumb.jpg');
  expect(getDestinationCreditPolicy(destination).mode).toBe('details');
  expect(getDestinationAttribution(destination)).toEqual(destination.destinationImage.attribution);
});

test.each(['Public Domain', 'CC0', 'CC0 1.0'])(
  'Wikimedia %s images can display without visible credit',
  (licenseName) => {
    const destination = {
      destinationImage: {
        source: { type: 'wikimedia' },
        urls: { thumb: 'https://upload.wikimedia.org/free.jpg' },
        attribution: { licenseName },
      },
    };
    expect(getDestinationCreditPolicy(destination).mode).toBe('none');
    expect(canDisplayDestinationImageWithoutCredit(destination)).toBe(true);
    expect(getDestinationAttribution(destination)).toBeNull();
    expect(getDestinationImageUrl(destination, 'thumb')).toBe('https://upload.wikimedia.org/free.jpg');
  }
);

test('unknown destination image providers do not expose untrusted attribution', () => {
  expect(getDestinationAttribution({
    destinationImage: { source: { type: 'unknown' }, attribution: { providerName: 'Unknown' } },
  })).toBeNull();
});

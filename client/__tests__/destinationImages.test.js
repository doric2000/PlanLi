import {
  canDisplayDestinationImageWithoutCredit,
  getDestinationAttribution,
  getDestinationCreditPolicy,
  getDestinationImageUrl,
  LEGACY_GENERIC_DESTINATION_IMAGE,
} from '../src/utils/destinationImages';

test('canonical destination variants take precedence over legacy fields', () => {
  const destination = {
    imageUrl: 'https://legacy.test/image.jpg',
    destinationImage: {
      source: { type: 'recommendation' },
      urls: { large: 'https://new.test/large.jpg', feed: 'https://new.test/feed.jpg', thumb: 'https://new.test/thumb.jpg' },
    },
  };
  expect(getDestinationImageUrl(destination, 'thumb')).toBe('https://new.test/thumb.jpg');
  expect(getDestinationImageUrl(destination, 'large')).toBe('https://new.test/large.jpg');
});

test('the old generic and Google Place URLs are treated as missing', () => {
  expect(getDestinationImageUrl({ imageUrl: LEGACY_GENERIC_DESTINATION_IMAGE })).toBeNull();
  expect(getDestinationImageUrl({ imageUrl: 'https://maps.googleapis.com/maps/api/place/photo?key=secret' })).toBeNull();
});

test('complete Unsplash attribution is exposed and required inline', () => {
  const attribution = {
    photographerName: 'Traveler',
    photographerProfileUrl: 'https://unsplash.com/@traveler?utm_source=planli&utm_medium=referral',
    providerName: 'Unsplash',
  };
  const destination = { destinationImage: { source: { type: 'unsplash' }, attribution } };
  expect(getDestinationCreditPolicy(destination).mode).toBe('inline');
  expect(canDisplayDestinationImageWithoutCredit(destination)).toBe(false);
  expect(getDestinationAttribution({ destinationImage: { source: { type: 'unsplash' }, attribution } })).toBe(attribution);
  expect(getDestinationAttribution({ destinationImage: { source: { type: 'recommendation' } } })).toBeNull();
});

test('provider images with incomplete required credit are not displayed', () => {
  const destination = {
    destinationImage: {
      source: { type: 'unsplash' },
      urls: { feed: 'https://images.unsplash.com/incomplete.jpg' },
      attribution: { photographerName: 'Traveler' },
    },
  };
  expect(getDestinationCreditPolicy(destination).mode).toBe('blocked');
  expect(getDestinationImageUrl(destination)).toBeNull();
});

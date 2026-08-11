import {
  getDestinationAttribution,
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

test('attribution is exposed only for Unsplash images', () => {
  const attribution = { photographerName: 'Traveler' };
  expect(getDestinationAttribution({ destinationImage: { source: { type: 'unsplash' }, attribution } })).toBe(attribution);
  expect(getDestinationAttribution({ destinationImage: { source: { type: 'recommendation' } } })).toBeNull();
});

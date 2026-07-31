import {
  findMediaAssetByUrl,
  getMediaPlaceholder,
  getMediaSrcSet,
  getMediaVariantUrl,
  getRecommendationImageUrls,
  getRouteImageUrls,
} from '../src/utils/mediaAssets';

const asset = (id) => ({
  assetId: id,
  placeholder: { thumbhash: `hash-${id}`, color: '#123456' },
  large: { url: `https://cdn/${id}-large.webp`, width: 1600 },
  feed: { url: `https://cdn/${id}-feed.webp`, width: 1280 },
  thumb: { url: `https://cdn/${id}-thumb.webp`, width: 384 },
});

describe('canonical media helpers', () => {
  test('returns only the requested canonical variant', () => {
    expect(getMediaVariantUrl(asset('a'), 'feed')).toBe(
      'https://cdn/a-feed.webp'
    );
    expect(getMediaVariantUrl({}, 'feed')).toBeNull();
  });

  test('returns ThumbHash placeholders and responsive WebP sources', () => {
    expect(getMediaPlaceholder(asset('a'))).toEqual({
      thumbhash: 'hash-a',
    });
    expect(getMediaSrcSet(asset('a'))).toBe(
      'https://cdn/a-thumb.webp 384w, https://cdn/a-feed.webp 1280w, https://cdn/a-large.webp 1600w'
    );
  });

  test('reads recommendation media without legacy arrays', () => {
    const item = { media: [asset('one'), asset('two')] };
    expect(getRecommendationImageUrls(item, 'thumb')).toEqual([
      'https://cdn/one-thumb.webp',
      'https://cdn/two-thumb.webp',
    ]);
    expect(
      findMediaAssetByUrl(item.media, 'https://cdn/two-feed.webp')?.assetId
    ).toBe('two');
  });

  test('collects route, day and stop media', () => {
    expect(
      getRouteImageUrls(
        {
          media: [asset('cover')],
          tripDaysData: [
            {
              media: asset('day'),
              stops: [{ media: asset('stop') }],
            },
          ],
        },
        'thumb'
      )
    ).toEqual([
      'https://cdn/cover-thumb.webp',
      'https://cdn/day-thumb.webp',
      'https://cdn/stop-thumb.webp',
    ]);
  });
});


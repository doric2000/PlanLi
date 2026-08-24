import {
  createTravelMediaDescriptor,
  defaultTravelMediaCrop,
  mergeTravelMediaSelection,
  queueMediaFromDescriptor,
  updateTravelMediaCrop,
} from '../src/utils/travelMedia';

describe('travel media descriptors', () => {
  it('creates the recommendation and RoadTrip center crops without manipulating a file', () => {
    expect(defaultTravelMediaCrop(4000, 3000, [1, 1])).toEqual({
      originX: 500, originY: 0, width: 3000, height: 3000,
    });
    expect(defaultTravelMediaCrop(4000, 3000, [4, 3])).toEqual({
      originX: 0, originY: 0, width: 4000, height: 3000,
    });
    const descriptor = createTravelMediaDescriptor({
      uri: 'file:///photo.jpg', width: 4000, height: 3000,
    }, { aspect: [1, 1], maxLongEdge: 1600, newSource: true });
    expect(descriptor.transform).toEqual(expect.objectContaining({
      crop: { originX: 500, originY: 0, width: 3000, height: 3000 },
      maxLongEdge: 1600,
      format: 'jpeg',
    }));
  });

  it('preserves selection order, removes duplicates, and enforces the field limit', () => {
    const selection = mergeTravelMediaSelection(
      [{ uri: 'file:///one.jpg' }],
      [
        { uri: 'file:///two.jpg' },
        { uri: 'file:///one.jpg' },
        { uri: 'file:///three.jpg' },
      ],
      { maxItems: 2, aspect: [1, 1], newSource: true }
    );
    expect(selection.map((item) => item.uri)).toEqual(['file:///one.jpg', 'file:///two.jpg']);
  });

  it('updates live crop metadata and carries it into the durable queue entry', () => {
    const initial = createTravelMediaDescriptor({
      uri: 'file:///photo.jpg', width: 2000, height: 1500,
    }, { aspect: [4, 3], maxLongEdge: 1800, newSource: true });
    const crop = { originX: 100, originY: 75, width: 1600, height: 1200 };
    const updated = updateTravelMediaCrop(initial, crop);
    expect(queueMediaFromDescriptor(updated)).toEqual(expect.objectContaining({
      uri: 'file:///photo.jpg',
      transform: expect.objectContaining({ crop, maxLongEdge: 1800 }),
    }));
  });

  it('keeps existing uploaded assets immutable and out of the transform pipeline', () => {
    const asset = { assetId: 'remote-1', feed: { url: 'https://cdn/feed.webp' } };
    const descriptor = createTravelMediaDescriptor({ asset, uri: asset.feed.url }, {
      aspect: [1, 1], newSource: false,
    });
    expect(descriptor.transform).toBeUndefined();
    expect(queueMediaFromDescriptor(descriptor)).toEqual({ asset });
  });
});

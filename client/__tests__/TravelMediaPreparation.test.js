import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import {
  buildTravelMediaPreparationActions,
  deletePreparedTravelMedia,
  prepareTravelMediaBatch,
  prepareTravelMediaSource,
} from '../src/utils/travelMediaPreparation';

jest.mock('expo-file-system/legacy', () => ({ deleteAsync: jest.fn(async () => {}) }));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: jest.fn(async () => ({ uri: 'file:///cache/prepared.jpg' })),
}));

describe('queued travel-media preparation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('applies the saved crop and bounded resize exactly once at publication time', async () => {
    const transform = {
      crop: { originX: 100, originY: 50, width: 3000, height: 3000 },
      maxLongEdge: 1600,
      compress: 0.92,
    };
    expect(buildTravelMediaPreparationActions(transform)).toEqual([
      { crop: transform.crop },
      { resize: { width: 1600, height: 1600 } },
    ]);
    const prepared = await prepareTravelMediaSource('file:///source.heic', transform);
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledTimes(1);
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///source.heic',
      buildTravelMediaPreparationActions(transform),
      { compress: 0.92, format: 'jpeg' }
    );
    await deletePreparedTravelMedia(prepared);
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/prepared.jpg', { idempotent: true });
  });

  it('treats legacy already-processed queue media as a no-op', async () => {
    await expect(prepareTravelMediaSource('file:///legacy.jpg', null)).resolves.toEqual({
      uri: 'file:///legacy.jpg', temporary: false,
    });
    expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
  });

  it('deletes completed temporary outputs when another batch item fails', async () => {
    ImageManipulator.manipulateAsync
      .mockResolvedValueOnce({ uri: 'file:///cache/completed-before-failure.jpg' })
      .mockRejectedValueOnce(new Error('decode failed'));
    const items = [
      {
        uri: 'file:///source-one.jpg',
        transform: { crop: { originX: 0, originY: 0, width: 1200, height: 900 } },
      },
      {
        uri: 'file:///source-two.jpg',
        transform: { crop: { originX: 0, originY: 0, width: 1200, height: 900 } },
      },
    ];
    await expect(prepareTravelMediaBatch(items, { concurrency: 2 }))
      .rejects.toThrow('decode failed');
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      'file:///cache/completed-before-failure.jpg',
      { idempotent: true }
    );
  });
});

import * as ImageManipulator from 'expo-image-manipulator';

import {
  calculateCropRect,
  cropImageForReview,
  fitCropViewport,
} from '../src/components/ImageCropReviewModal';
import {
  RECOMMENDATION_IMAGE_LONG_EDGE,
  ROUTE_IMAGE_LONG_EDGE,
  TRAVEL_IMAGE_COMPRESSION,
} from '../src/constants/travelMedia';

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: jest.fn(),
}));

describe('calculateCropRect', () => {
  it('fits crop frames inside both compact portrait and landscape stages', () => {
    expect(fitCropViewport({
      containerWidth: 390,
      containerHeight: 420,
      aspectRatio: 1,
    })).toEqual({ width: 390, height: 390 });
    expect(fitCropViewport({
      containerWidth: 720,
      containerHeight: 260,
      aspectRatio: 1,
    })).toEqual({ width: 260, height: 260 });
    expect(fitCropViewport({
      containerWidth: 720,
      containerHeight: 260,
      aspectRatio: 4 / 3,
    })).toEqual({ width: 260 * (4 / 3), height: 260 });
    expect(fitCropViewport({
      containerWidth: 1024,
      containerHeight: 900,
      aspectRatio: 1,
    })).toEqual({ width: 640, height: 640 });
  });

  it('centers a square crop and never exceeds the source', () => {
    expect(calculateCropRect({
      sourceWidth: 4000,
      sourceHeight: 3000,
      viewportWidth: 300,
      viewportHeight: 300,
    })).toEqual({ originX: 500, originY: 0, width: 3000, height: 3000 });
  });

  it('maps pan and zoom into a bounded 4:3 source crop', () => {
    const crop = calculateCropRect({
      sourceWidth: 3000,
      sourceHeight: 2000,
      viewportWidth: 400,
      viewportHeight: 300,
      zoom: 2,
      translateX: 100,
      translateY: -50,
    });
    expect(crop).toEqual({ originX: 500, originY: 667, width: 1333, height: 1000 });
    expect(crop.originX + crop.width).toBeLessThanOrEqual(3000);
    expect(crop.originY + crop.height).toBeLessThanOrEqual(2000);
  });

  it('encodes bounded travel staging JPEGs at the shared quality target', async () => {
    ImageManipulator.manipulateAsync.mockResolvedValue({ uri: 'file:travel-stage.jpg' });
    await expect(cropImageForReview(
      'file:source.jpg',
      { originX: 0, originY: 0, width: 3000, height: 3000 },
      {
        maxLongEdge: RECOMMENDATION_IMAGE_LONG_EDGE,
        compress: TRAVEL_IMAGE_COMPRESSION,
      }
    )).resolves.toBe('file:travel-stage.jpg');
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:source.jpg',
      [
        { crop: { originX: 0, originY: 0, width: 3000, height: 3000 } },
        { resize: { width: 1600, height: 1600 } },
      ],
      { compress: 0.85, format: 'jpeg' }
    );
    expect(ROUTE_IMAGE_LONG_EDGE).toBe(2048);
  });
});

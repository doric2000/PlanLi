import { calculateCropRect } from '../src/components/ImageCropReviewModal';

describe('calculateCropRect', () => {
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
});

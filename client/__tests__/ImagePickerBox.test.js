import { imagePickerFrameStyle } from '../src/components/ImagePickerBox';

describe('ImagePickerBox preview frame', () => {
  it('uses the crop aspect ratio instead of applying a second fixed-height crop', () => {
    expect(imagePickerFrameStyle({ height: 200, previewAspectRatio: 1 })).toEqual({
      height: undefined,
      aspectRatio: 1,
    });
    expect(imagePickerFrameStyle({ height: 200, previewAspectRatio: 4 / 3 })).toEqual({
      height: undefined,
      aspectRatio: 4 / 3,
    });
  });

  it('keeps the existing fixed-height behavior when no crop ratio is requested', () => {
    expect(imagePickerFrameStyle({ height: 240 })).toEqual({ height: 240 });
  });
});

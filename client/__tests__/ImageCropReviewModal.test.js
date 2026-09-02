import React from 'react';
import * as ImageManipulator from 'expo-image-manipulator';
import { render } from '@testing-library/react-native';
import { Modal } from 'react-native';

import ImageCropReviewModal, {
  boundCropTranslation,
  calculateCropRect,
  cropImageForReview,
  fitCropViewport,
} from '../src/components/ImageCropReviewModal';
import { cropRectToViewportTransform } from '../src/utils/cropMath';
import {
  RECOMMENDATION_IMAGE_LONG_EDGE,
  ROUTE_IMAGE_LONG_EDGE,
  TRAVEL_IMAGE_COMPRESSION,
} from '../src/constants/travelMedia';

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: jest.fn(),
}));
jest.mock('react-native-reanimated', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useAnimatedStyle: (factory) => factory(),
    useSharedValue: (value) => ReactModule.useRef({ value }).current,
    withTiming: (value) => value,
  };
});
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  const chain = () => {
    const value = {};
    ['minDistance', 'shouldCancelWhenOutside', 'onStart', 'onUpdate', 'onEnd'].forEach((name) => {
      value[name] = () => value;
    });
    return value;
  };
  return {
    Gesture: { Pan: chain, Pinch: chain, Simultaneous: () => ({}) },
    GestureDetector: ({ children }) => <>{children}</>,
    GestureHandlerRootView: ({ children, ...props }) => <View {...props}>{children}</View>,
  };
});

describe('calculateCropRect', () => {
  it('renders a contained crop review without adding another native modal', () => {
    const screen = render(
      <ImageCropReviewModal contained visible uris={[]} onCancel={jest.fn()} onComplete={jest.fn()} />
    );
    expect(screen.getByTestId('image-crop-contained')).toBeTruthy();
    expect(screen.UNSAFE_queryAllByType(Modal)).toHaveLength(0);
  });

  it('allows panning on both axes only as far as the crop still stays covered', () => {
    expect(boundCropTranslation({
      displayWidth: 600,
      displayHeight: 500,
      viewportWidth: 400,
      viewportHeight: 300,
      zoom: 1,
      translateX: 900,
      translateY: -900,
    })).toEqual({ x: 100, y: -100 });
    expect(boundCropTranslation({
      displayWidth: 400,
      displayHeight: 300,
      viewportWidth: 400,
      viewportHeight: 300,
      zoom: 2,
      translateX: -500,
      translateY: 500,
    })).toEqual({ x: -200, y: 150 });
  });

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
    expect(fitCropViewport({
      containerWidth: 760,
      containerHeight: 760,
      aspectRatio: 1,
      maxWidth: 760,
    })).toEqual({ width: 760, height: 760 });
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

  it('rehydrates a saved crop into the same viewport pan and zoom', () => {
    const dimensions = {
      sourceWidth: 3000,
      sourceHeight: 2000,
      viewportWidth: 400,
      viewportHeight: 300,
    };
    const savedCrop = calculateCropRect({
      ...dimensions,
      zoom: 2,
      translateX: 100,
      translateY: -50,
    });
    const viewportTransform = cropRectToViewportTransform({
      ...dimensions,
      crop: savedCrop,
    });
    expect(calculateCropRect({
      ...dimensions,
      ...viewportTransform,
    })).toEqual(savedCrop);
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

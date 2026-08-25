import React from 'react';
import { FlatList } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import { ImagePickerBox, imagePickerFrameStyle } from '../src/components/ImagePickerBox';

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

  it('clamps the active photo after the selected list shrinks', () => {
    const onRemove = jest.fn();
    const screen = render(
      <ImagePickerBox
        imageUris={['file:///one.jpg', 'file:///two.jpg', 'file:///three.jpg']}
        onPress={jest.fn()}
        onRemove={onRemove}
        testID="picker"
      />
    );
    act(() => {
      screen.UNSAFE_getByType(FlatList).props.onViewableItemsChanged({
        viewableItems: [{ index: 2 }],
      });
    });
    screen.rerender(
      <ImagePickerBox
        imageUris={['file:///one.jpg']}
        onPress={jest.fn()}
        onRemove={onRemove}
        testID="picker"
      />
    );
    fireEvent.press(screen.getByTestId('picker-remove'));
    expect(onRemove).toHaveBeenCalledWith(0);
  });
});

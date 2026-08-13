import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { render } from '@testing-library/react-native';

import { Avatar } from '../src/components/Avatar';

describe('Avatar', () => {
  it('removes external spacing and clips a photo when embedded in a circular ring', () => {
    const { UNSAFE_getByType } = render(
      <Avatar
        photoURL="https://cdn.example/avatar.jpg"
        displayName="Traveler"
        size={40}
        insideRing
      />
    );
    const image = UNSAFE_getByType(require('expo-image').Image);
    const style = StyleSheet.flatten(image.props.style);

    expect(style).toEqual(expect.objectContaining({
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 0,
      overflow: 'hidden',
    }));
    if (Platform.OS !== 'web') expect(style.backgroundColor).toBe('#E2E8F0');
  });

  it('applies the same centered clipping to the fallback avatar', () => {
    const { UNSAFE_getByType } = render(<Avatar displayName="Admin" size={40} insideRing />);
    const style = StyleSheet.flatten(UNSAFE_getByType(View).props.style);

    expect(style).toEqual(expect.objectContaining({
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 0,
      overflow: 'hidden',
    }));
  });
});

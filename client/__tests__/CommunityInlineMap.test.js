import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import CommunityInlineMap from '../src/features/community/components/CommunityInlineMap';

jest.mock('react-native-maps');

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text: NativeText } = require('react-native');
  const MaterialIcons = ({ name }) => ReactModule.createElement(NativeText, null, `icon:${name}`);
  MaterialIcons.loadFont = jest.fn(() => Promise.resolve());
  return { MaterialIcons };
});

jest.mock('../src/hooks/useUserLocation', () => ({
  useUserLocation: () => ({ location: null, requestLocation: jest.fn(() => Promise.resolve(null)) }),
}));

jest.mock('../src/features/community/components/RecommendationMapPreviewCard', () => (
  function MockPreview({ item, onClose, onOpenRecommendation }) {
    const ReactModule = require('react');
    const { Pressable: NativePressable, Text: NativeText, View: NativeView } = require('react-native');
    return ReactModule.createElement(
      NativeView,
      { testID: 'mock-map-preview' },
      ReactModule.createElement(NativeText, null, item.title),
      ReactModule.createElement(NativePressable, { testID: 'mock-map-preview-close', onPress: onClose }),
      ReactModule.createElement(NativePressable, {
        testID: 'mock-map-preview-open',
        onPress: () => onOpenRecommendation(item),
      })
    );
  }
));

const recommendations = [
  {
    id: 'rec-1',
    title: 'מסעדה מקומית',
    categoryId: 'food',
    place: { coordinates: { lat: 32.1, lng: 34.8 } },
  },
  {
    id: 'rec-2',
    title: 'שמורת טבע',
    categoryId: 'nature',
    place: { coordinates: { lat: 32.2, lng: 34.9 } },
  },
];

describe('CommunityInlineMap', () => {
  it('selects markers, opens the full item, and clears from the map background', async () => {
    const onOpenRecommendation = jest.fn();
    const screen = render(
      <CommunityInlineMap
        recommendations={recommendations}
        overlayBottomInset={92}
        onOpenRecommendation={onOpenRecommendation}
      />
    );

    await act(async () => {});
    fireEvent.press(screen.getByTestId('recommendation-map-marker-rec-1'));
    expect(screen.getByTestId('mock-map-preview')).toBeTruthy();
    expect(screen.getByText('מסעדה מקומית')).toBeTruthy();

    fireEvent.press(screen.getByTestId('mock-map-preview-open'));
    expect(onOpenRecommendation).toHaveBeenCalledWith(recommendations[0]);

    fireEvent.press(screen.getByTestId('community-inline-map'));
    await waitFor(() => expect(screen.queryByTestId('mock-map-preview')).toBeNull());
  });

  it('clears selection when filters remove the selected recommendation', async () => {
    const screen = render(<CommunityInlineMap recommendations={recommendations} />);
    await act(async () => {});
    fireEvent.press(screen.getByTestId('recommendation-map-marker-rec-2'));
    expect(screen.getByTestId('mock-map-preview')).toBeTruthy();

    screen.rerender(<CommunityInlineMap recommendations={[recommendations[0]]} />);
    await waitFor(() => expect(screen.queryByTestId('mock-map-preview')).toBeNull());
  });
});

import React from 'react';
import { TouchableOpacity } from 'react-native';
import { render } from '@testing-library/react-native';

import CommunityInlineMap from '../src/features/community/components/CommunityInlineMap.web';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }) => ReactModule.createElement(Text, null, `icon:${name}`),
  };
});

describe('CommunityInlineMap web fallback', () => {
  it('promotes and marks the focused recommendation without creating an interactive map', () => {
    const recommendations = [
      {
        id: 'rec-1',
        title: 'First result',
        place: { coordinates: { lat: 32.1, lng: 34.8 } },
      },
      {
        id: 'rec-2',
        title: 'Focused result',
        place: { coordinates: { lat: 32.2, lng: 34.9 } },
      },
    ];
    const screen = render(
      <CommunityInlineMap
        recommendations={recommendations}
        focusRequest={{
          requestId: 'rec-2:1',
          recommendationId: 'rec-2',
          coordinates: { lat: 32.2, lng: 34.9 },
        }}
        onOpenRecommendation={jest.fn()}
      />
    );

    const focusedRow = screen.getByTestId('community-map-web-item-rec-2');
    const otherRow = screen.getByTestId('community-map-web-item-rec-1');
    expect(focusedRow.props.accessibilityState).toEqual({ selected: true });
    expect(otherRow.props.accessibilityState).toEqual({ selected: false });
    expect(screen.UNSAFE_getAllByType(TouchableOpacity)[0].props.testID).toBe(
      'community-map-web-item-rec-2'
    );
    expect(screen.queryByTestId('community-inline-map')).toBeNull();
  });
});

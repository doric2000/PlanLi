import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import RouteItinerary from '../src/features/roadtrip/components/RouteItinerary';

jest.mock('../src/components/CachedImage', () => () => null);
jest.mock('../src/components/MediaGalleryModal', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return ({ visible, initialIndex, items }) => visible
    ? ReactModule.createElement(Text, { testID: 'gallery-state' }, `${initialIndex}:${items.map((item) => item.caption).join('|')}`)
    : null;
});
jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return { Ionicons: ({ name }) => ReactModule.createElement(Text, null, `icon:${name}`) };
});

const days = [{
  id: 'day-1',
  description: 'היום הראשון',
  media: { large: { url: 'https://img/day-large.jpg' }, thumb: { url: 'https://img/day-thumb.jpg' } },
  stops: [{
    id: 'stop-1',
    title: 'התחנה הראשונה',
    description: 'תיאור התחנה',
    place: { address: 'כתובת', url: 'https://maps.example/stop' },
    media: { large: { url: 'https://img/stop-large.jpg' }, thumb: { url: 'https://img/stop-thumb.jpg' } },
  }],
}, {
  id: 'day-2',
  description: 'היום השני',
  stops: [{ id: 'stop-2', title: 'תחנה בלי תמונה', place: { address: 'כתובת שנייה' } }],
}];

describe('RouteItinerary', () => {
  it('keeps one day open and exposes every stop responsively', () => {
    const screen = render(<RouteItinerary days={days} />);
    expect(screen.getByTestId('route-day-stops-0')).toBeTruthy();
    expect(screen.getByText('התחנה הראשונה')).toBeTruthy();
    expect(screen.queryByTestId('route-day-stops-1')).toBeNull();

    fireEvent.press(screen.getByTestId('route-day-toggle-1'));
    expect(screen.queryByTestId('route-day-stops-0')).toBeNull();
    expect(screen.getByTestId('route-day-stops-1')).toBeTruthy();
    expect(screen.getByText('תחנה בלי תמונה')).toBeTruthy();
  });

  it('opens a deduplicated day gallery at the selected stop photo', () => {
    const screen = render(<RouteItinerary days={days} />);
    fireEvent.press(screen.getByTestId('route-stop-photo-0-0'));
    expect(screen.getByTestId('gallery-state').props.children).toBe('1:יום 1|התחנה הראשונה');
  });
});

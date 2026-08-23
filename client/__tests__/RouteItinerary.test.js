import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import RouteItinerary from '../src/features/roadtrip/components/RouteItinerary';

jest.mock('../src/components/CachedImage', () => () => null);
jest.mock('../src/components/MediaGalleryModal', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return ({ visible, initialIndex, items }) => visible
    ? ReactModule.createElement(Text, { testID: 'gallery-state' }, `${initialIndex}:${items.length}:${items.map((item) => item.caption).join('|')}`)
    : null;
});
jest.mock('../src/components/OpenWithLocationSheet', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return ({ visible, place }) => visible
    ? ReactModule.createElement(Text, { testID: 'open-with-sheet' }, `${place?.name || ''}:${place?.coordinates?.lat || ''}`)
    : null;
});
jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return { Ionicons: ({ name }) => ReactModule.createElement(Text, null, `icon:${name}`) };
});

const days = [{
  id: 'day-1',
  description: 'הערה אמיתית ליום',
  stops: [{
    id: 'stop-1',
    title: 'התחנה הראשונה',
    description: 'תיאור התחנה',
    locationPrecision: 'exact',
    startTime: '09:30',
    durationMinutes: 90,
    source: { recommendationId: 'recommendation-1' },
    place: { address: 'כתובת', coordinates: { lat: 32.1, lng: 34.8 } },
    media: { large: { url: 'https://img/stop-large.jpg' }, thumb: { url: 'https://img/stop-thumb.jpg' } },
    additionalMedia: [
      { large: { url: 'https://img/stop-2-large.jpg' }, thumb: { url: 'https://img/stop-2-thumb.jpg' } },
      { large: { url: 'https://img/stop-3-large.jpg' }, thumb: { url: 'https://img/stop-3-thumb.jpg' } },
      { large: { url: 'https://img/stop-4-large.jpg' }, thumb: { url: 'https://img/stop-4-thumb.jpg' } },
    ],
  }, {
    id: 'stop-2',
    title: 'עצירה כללית',
    description: 'תיאור שני',
    locationPrecision: 'general',
    destination: { cityName: 'חיפה' },
  }],
}, {
  id: 'day-2',
  stops: [{ id: 'stop-3', title: 'עצירה ביום השני', locationPrecision: 'general' }],
}];

describe('RouteItinerary', () => {
  it('shows one selected day with useful time metadata and an optional legacy note', () => {
    const screen = render(<RouteItinerary day={days[0]} dayIndex={0} dayCount={2} />);
    expect(screen.getByTestId('route-day-stops-0')).toBeTruthy();
    expect(screen.getByText('התחנה הראשונה')).toBeTruthy();
    expect(screen.getByText('09:30 · שעה וחצי')).toBeTruthy();
    expect(screen.getByText('הערה אמיתית ליום')).toBeTruthy();
    expect(screen.getByText('אזור כללי')).toBeTruthy();
    expect(screen.queryByText('תיאור התחנה')).toBeNull();
  });

  it('keeps only one stop expanded and exposes PlanLi source details', () => {
    const onOpenRecommendation = jest.fn();
    const screen = render(<RouteItinerary day={days[0]} dayIndex={0} dayCount={2} onOpenRecommendation={onOpenRecommendation} />);

    fireEvent.press(screen.getByTestId('route-stop-toggle-0-0'));
    expect(screen.getByTestId('route-stop-expanded-0-0')).toBeTruthy();
    expect(screen.getByText('תיאור התחנה')).toBeTruthy();
    expect(screen.getAllByText('כתובת')).toHaveLength(2);
    fireEvent.press(screen.getByTestId('route-stop-recommendation-0-0'));
    expect(onOpenRecommendation).toHaveBeenCalledWith('recommendation-1');

    fireEvent.press(screen.getByTestId('route-stop-toggle-0-1'));
    expect(screen.queryByTestId('route-stop-expanded-0-0')).toBeNull();
    expect(screen.getByTestId('route-stop-expanded-0-1')).toBeTruthy();
  });

  it('opens a stop-specific gallery at the selected photo', () => {
    const screen = render(<RouteItinerary day={days[0]} dayIndex={0} />);
    fireEvent.press(screen.getByTestId('route-stop-photo-0-0'));
    expect(screen.getByTestId('gallery-state').props.children).toBe('0:3:התחנה הראשונה|התחנה הראשונה|התחנה הראשונה');
  });

  it('opens the shared Maps and Waze chooser only for a precise stop', () => {
    const screen = render(<RouteItinerary day={days[0]} dayIndex={0} />);
    fireEvent.press(screen.getByTestId('route-stop-map-0-0'));
    expect(screen.getByTestId('open-with-sheet').props.children).toBe('התחנה הראשונה:32.1');
    expect(screen.queryByTestId('route-stop-map-0-1')).toBeNull();
  });

  it('offers previous and next day callbacks without rendering another day', () => {
    const onNextDay = jest.fn();
    const screen = render(<RouteItinerary day={days[0]} dayIndex={0} dayCount={2} onNextDay={onNextDay} />);
    expect(screen.queryByText('עצירה ביום השני')).toBeNull();
    fireEvent.press(screen.getByTestId('route-next-day'));
    expect(onNextDay).toHaveBeenCalledTimes(1);
  });
});

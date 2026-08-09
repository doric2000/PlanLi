import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import CommunityInlineMap from '../src/features/community/components/CommunityInlineMap';

jest.mock('../src/config/mapConfig', () => ({
  DEFAULT_MAP_CENTER: [34.85, 31.04],
  DEFAULT_MAP_ZOOM: 7,
  USER_MAP_ZOOM: 15,
  getMapTilerKey: () => 'test-key',
  getMapTilerStyleUrl: () => 'https://example.com/style.json',
}));

jest.mock('@maplibre/maplibre-react-native', () => {
  const ReactModule = require('react');
  const { Pressable, View } = require('react-native');
  const Map = ReactModule.forwardRef(({ children, onPress, onDidFinishLoadingMap, testID }, ref) => {
    ReactModule.useImperativeHandle(ref, () => ({
      getViewState: async () => ({ bounds: [34.7, 32, 34.9, 32.2], zoom: 12 }),
    }));
    ReactModule.useEffect(() => onDidFinishLoadingMap?.(), [onDidFinishLoadingMap]);
    return ReactModule.createElement(Pressable, { testID, onPress }, children);
  });
  const Camera = ReactModule.forwardRef((props, ref) => {
    ReactModule.useImperativeHandle(ref, () => ({ flyTo: jest.fn(), easeTo: jest.fn() }));
    return ReactModule.createElement(View, props);
  });
  const GeoJSONSource = ReactModule.forwardRef(({ data, children, onPress, id }, ref) => {
    ReactModule.useImperativeHandle(ref, () => ({ getClusterExpansionZoom: async () => 14 }));
    const features = data?.features || [];
    return ReactModule.createElement(
      View,
      { testID: `source-${id}` },
      children,
      ...features.filter((feature) => feature?.properties?.id).map((feature) => ReactModule.createElement(
        Pressable,
        {
          key: feature.properties.id,
          testID: `recommendation-map-marker-${feature.properties.id}`,
          onPress: () => onPress?.({ nativeEvent: { features: [feature] }, stopPropagation: jest.fn() }),
        }
      ))
    );
  });
  const Layer = (props) => ReactModule.createElement(View, props);
  return {
    Map,
    Camera,
    GeoJSONSource,
    Layer,
    TransformRequestManager: { addHeader: jest.fn() },
  };
});

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text: NativeText } = require('react-native');
  const Icon = ({ name }) => ReactModule.createElement(NativeText, null, `icon:${name}`);
  return { Ionicons: Icon, MaterialIcons: Icon };
});

const mockStartTracking = jest.fn(() => Promise.resolve(null));
jest.mock('../src/hooks/useLiveUserLocation', () => ({
  useLiveUserLocation: () => ({
    location: null,
    status: 'denied',
    startTracking: mockStartTracking,
    stopTracking: jest.fn(),
  }),
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
        onPress: () => onOpenRecommendation(item.postId || item.id),
      })
    );
  }
));

const recommendations = [
  {
    id: 'rec-1',
    postId: 'rec-1',
    title: 'מסעדה מקומית',
    categoryId: 'food',
    place: { coordinates: { lat: 32.1, lng: 34.8 } },
  },
  {
    id: 'rec-2',
    postId: 'rec-2',
    title: 'שמורת טבע',
    categoryId: 'nature',
    place: { coordinates: { lat: 32.2, lng: 34.9 } },
  },
];

describe('CommunityInlineMap', () => {
  it('selects pins, opens by postId, and clears from the map background', async () => {
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
    expect(onOpenRecommendation).toHaveBeenCalledWith('rec-1');

    fireEvent.press(screen.getByTestId('community-inline-map'));
    await waitFor(() => expect(screen.queryByTestId('mock-map-preview')).toBeNull());
  });

  it('clears selection when a viewport refresh removes the selected recommendation', async () => {
    const screen = render(<CommunityInlineMap recommendations={recommendations} />);
    await act(async () => {});
    fireEvent.press(screen.getByTestId('recommendation-map-marker-rec-2'));
    expect(screen.getByTestId('mock-map-preview')).toBeTruthy();

    screen.rerender(<CommunityInlineMap recommendations={[recommendations[0]]} />);
    await waitFor(() => expect(screen.queryByTestId('mock-map-preview')).toBeNull());
  });

  it('offers a non-blocking location retry when permission is denied', async () => {
    const screen = render(<CommunityInlineMap recommendations={[]} />);
    await act(async () => {});
    fireEvent.press(screen.getByText('אפשר להפעיל מיקום כדי למצוא המלצות קרובות'));
    expect(mockStartTracking).toHaveBeenCalled();
  });
});

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import RecommendationMapPreviewCard from '../src/features/community/components/RecommendationMapPreviewCard';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text: NativeText } = require('react-native');
  const Icon = ({ name }) => ReactModule.createElement(NativeText, null, `icon:${name}`);
  return { Ionicons: Icon, MaterialIcons: Icon };
});

jest.mock('../src/components/CachedImage', () => function MockCachedImage({ source }) {
  const ReactModule = require('react');
  const { Text: NativeText } = require('react-native');
  return ReactModule.createElement(
    NativeText,
    { testID: 'map-preview-image' },
    source?.uri
  );
});

describe('RecommendationMapPreviewCard', () => {
  const item = {
    id: 'rec-1',
    title: 'המסעדה של השכונה',
    categoryId: 'food',
    budget: 'balanced',
    stats: { likeCount: 17 },
    destination: { cityName: 'תל אביב', countryName: 'ישראל' },
    place: { name: 'שוק לוינסקי' },
    media: [{ thumb: { url: 'https://example.com/thumb.webp' } }],
  };

  it('shows rich recommendation details and invokes both actions', () => {
    const onClose = jest.fn();
    const onOpenRecommendation = jest.fn();
    const screen = render(
      <RecommendationMapPreviewCard
        item={item}
        bottomInset={92}
        onClose={onClose}
        onOpenRecommendation={onOpenRecommendation}
      />
    );

    expect(screen.getByText('אוכל ושתייה')).toBeTruthy();
    expect(screen.getByText('המסעדה של השכונה')).toBeTruthy();
    expect(screen.getByText('שוק לוינסקי, תל אביב, ישראל')).toBeTruthy();
    expect(screen.getByText('₪₪')).toBeTruthy();
    expect(screen.getByText('17')).toBeTruthy();
    expect(screen.getByTestId('map-preview-image').props.children).toBe('https://example.com/thumb.webp');

    fireEvent.press(screen.getByTestId('recommendation-map-preview-close'));
    fireEvent.press(screen.getByTestId('recommendation-map-preview-open'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenRecommendation).toHaveBeenCalledWith('rec-1');
  });

  it('uses a category placeholder and omits unavailable metadata', () => {
    const screen = render(
      <RecommendationMapPreviewCard
        item={{ id: 'rec-2', title: 'מקום בלי תמונה', category: 'טבע ומים' }}
        bottomInset={116}
      />
    );

    expect(screen.getByTestId('recommendation-map-preview-placeholder')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });
});

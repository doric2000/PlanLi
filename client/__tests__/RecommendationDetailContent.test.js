import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import RecommendationDetailContent from '../src/features/community/components/RecommendationDetailContent';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => ReactModule.createElement(Text, null, `icon:${name}`);
  return { Ionicons: Icon, MaterialIcons: Icon };
});

jest.mock('../src/components/Avatar', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return { Avatar: () => ReactModule.createElement(View, { testID: 'detail-author-avatar' }) };
});

jest.mock('../src/components/ExactLocationMapPreview', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return function MockExactLocationMapPreview(props) {
    return ReactModule.createElement(View, {
      testID: props.testID,
      style: props.style,
    });
  };
});

jest.mock('../src/components/OpenWithLocationSheet', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return function MockOpenWithLocationSheet({ visible }) {
    return visible
      ? ReactModule.createElement(View, { testID: 'mock-open-with-location-sheet' })
      : null;
  };
});

jest.mock('../src/features/moderation/components/ReportButton', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return ({ target, subjectLabel }) => ReactModule.createElement(View, {
    testID: 'attached-place-report',
    accessibilityLabel: `${subjectLabel}:${target?.subject?.kind}`,
  });
});

describe('RecommendationDetailContent', () => {
  const item = {
    id: 'rec-1',
    ownerId: 'owner-1',
    title: 'השוק המרכזי של מונאר',
    description: 'שוק מקומי צבעוני עם תבלינים ותה.',
    categoryId: 'shopping',
    budget: 'balanced',
    destination: {
      cityId: 'munnar',
      countryId: 'india',
      cityName: 'מונאר',
      countryName: 'הודו',
    },
    place: {
      placeId: 'google-place-1',
      name: 'השוק המרכזי',
      address: 'Main Road',
      coordinates: { lat: 10.0889, lng: 77.0595 },
    },
    facets: { audienceScope: 'all', audiences: [] },
    tags: ['shopping_markets'],
  };

  it('renders the approved RTL hierarchy and authorized edit action', () => {
    const navigation = { navigate: jest.fn() };
    const onEdit = jest.fn();
    const screen = render(
      <RecommendationDetailContent
        item={item}
        author={{ displayName: 'Bot' }}
        canEdit
        navigation={navigation}
        onEdit={onEdit}
      />
    );

    expect(screen.getByText(item.title)).toBeTruthy();
    expect(screen.getByText('על המקום')).toBeTruthy();
    expect(screen.getByText('פרטים שימושיים')).toBeTruthy();
    expect(screen.getByText('קהל')).toBeTruthy();
    expect(screen.getByText('מתאים לכולם')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByText(item.title).props.style).writingDirection).toBe('rtl');
    const audienceFactStyle = StyleSheet.flatten(screen.getByTestId('recommendation-fact-audiences').props.style);
    expect(audienceFactStyle.backgroundColor).toBeUndefined();
    expect(audienceFactStyle.borderBottomWidth).toBeUndefined();
    expect(audienceFactStyle.width).toBe('100%');
    const tagsMetadata = screen.getByTestId('recommendation-tags-metadata');
    expect(tagsMetadata.props.accessibilityRole).toBeUndefined();
    const tagsMetadataStyle = StyleSheet.flatten(tagsMetadata.props.style);
    expect(tagsMetadataStyle.backgroundColor).toBeUndefined();
    expect(tagsMetadataStyle.borderWidth).toBeUndefined();
    expect(screen.getByText('פתיחה באמצעות')).toBeTruthy();
    expect(screen.getByTestId('attached-place-report').props.accessibilityLabel).toBe('המקום המחובר:attached_place');
    expect(screen.queryByText('פתיחה ב-Waze')).toBeNull();
    expect(screen.queryByText('פתח בגוגל מפות')).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('recommendation-exact-map').props.style)).toMatchObject({
      width: '100%',
      height: 150,
      borderRadius: 16,
    });

    fireEvent.press(screen.getByTestId('recommendation-open-with'));
    expect(screen.getByTestId('mock-open-with-location-sheet')).toBeTruthy();

    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(123456);
    fireEvent.press(screen.getByTestId('recommendation-exact-map'));
    expect(navigation.navigate).toHaveBeenCalledWith('Main', {
      screen: 'Tabs',
      params: {
        screen: 'Community',
        params: {
          mapFocus: {
            requestId: 'rec-1:123456',
            recommendationId: 'rec-1',
            coordinates: { lat: 10.0889, lng: 77.0595 },
          },
        },
      },
    }, { pop: true });
    nowSpy.mockRestore();

    fireEvent.press(screen.getByTestId('recommendation-detail-edit'));
    expect(onEdit).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('פתיחת היעד מונאר, הודו'));
    expect(navigation.navigate).toHaveBeenCalledWith('LandingPage', {
      cityId: 'munnar',
      countryId: 'india',
    });
  });

  it('does not render edit for a user without permission', () => {
    const screen = render(
      <RecommendationDetailContent
        item={item}
        author={{ displayName: 'Bot' }}
        canEdit={false}
        navigation={{ navigate: jest.fn() }}
      />
    );

    expect(screen.queryByTestId('recommendation-detail-edit')).toBeNull();
  });

  it('does not render an exact map when the saved place has no coordinates', () => {
    const screen = render(
      <RecommendationDetailContent
        item={{ ...item, place: { name: 'Legacy place', address: 'Old Road' } }}
        author={{ displayName: 'Bot' }}
        canEdit={false}
        navigation={{ navigate: jest.fn() }}
      />
    );

    expect(screen.queryByTestId('recommendation-exact-map')).toBeNull();
    expect(screen.getByTestId('recommendation-open-with')).toBeTruthy();
  });
});

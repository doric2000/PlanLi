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
    place: { name: 'השוק המרכזי', address: 'Main Road' },
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
    expect(screen.getByText('מתאים לכולם')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByText(item.title).props.style).writingDirection).toBe('rtl');

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
});

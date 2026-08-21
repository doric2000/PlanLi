import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import RecommendationDetailScreen from '../src/features/community/screens/RecommendationDetailScreen';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));
jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }) => ReactModule.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});
jest.mock('../src/config/firebase', () => ({ auth: { currentUser: null } }));
jest.mock('../src/hooks/useAdminClaim', () => ({ useAdminClaim: () => ({ isAdmin: false }) }));
jest.mock('../src/hooks/useAuthUser', () => ({ useAuthUser: () => ({ isActive: true }) }));
jest.mock('../src/hooks/useRecommendationById', () => ({
  useRecommendationById: () => ({ data: null, loading: false, refresh: jest.fn() }),
}));
jest.mock('../src/hooks/useUserData', () => ({ useUserData: () => ({ displayName: 'Dana' }) }));
jest.mock('../src/services/PersonalizationService', () => ({
  recordRecommendationOpen: jest.fn(() => Promise.resolve()),
}));
jest.mock('../src/features/community/hooks/useLikes', () => ({
  useLikes: () => ({ isLiked: false, likeCount: 0, toggleLike: jest.fn() }),
}));
jest.mock('../src/features/community/hooks/useCommentsCount', () => ({ useCommentsCount: () => 0 }));
jest.mock('../src/components/RecommendationHero', () => {
  const ReactModule = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    RecommendationHero: ({ onImagePress }) => ReactModule.createElement(
      Pressable,
      { testID: 'mock-recommendation-photo', onPress: () => onImagePress(1) },
      ReactModule.createElement(Text, null, 'photo')
    ),
  };
});
jest.mock('../src/components/MediaGalleryModal', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return ({ visible, initialIndex, items }) => visible
    ? ReactModule.createElement(Text, { testID: 'mock-gallery' }, `${initialIndex}:${items.length}`)
    : null;
});
jest.mock('../src/features/community/components/RecommendationDetailContent', () => () => null);
jest.mock('../src/components/RecommendationActionBar', () => ({ RecommendationActionBar: () => null }));
jest.mock('../src/components/LikesModal', () => () => null);
jest.mock('../src/components/CommentsModal', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return {
    CommentsModal: ({ visible, initialCommentId }) => visible
      ? ReactModule.createElement(Text, { testID: 'mock-comments-focus' }, initialCommentId || 'comments')
      : null,
  };
});

describe('RecommendationDetailScreen gallery', () => {
  it('opens the shared full-screen gallery at the tapped hero image', () => {
    const item = {
      id: 'rec-1',
      ownerId: 'owner-1',
      title: 'המלצה מצולמת',
      media: [
        { assetId: 'one', large: { url: 'https://img.example/one.jpg' } },
        { assetId: 'two', large: { url: 'https://img.example/two.jpg' } },
      ],
    };
    const screen = render(
      <RecommendationDetailScreen
        route={{ params: { item } }}
        navigation={{ navigate: jest.fn() }}
      />
    );

    fireEvent.press(screen.getByTestId('mock-recommendation-photo'));
    expect(screen.getByTestId('mock-gallery').props.children).toBe('1:2');
  });

  it('opens and focuses the exact comment requested by a notification', () => {
    const item = { id: 'rec-1', ownerId: 'owner-1', title: 'המלצה' };
    const screen = render(
      <RecommendationDetailScreen
        route={{ params: { item, openComments: true, commentId: 'comment-7' } }}
        navigation={{ navigate: jest.fn() }}
      />
    );

    expect(screen.getByTestId('mock-comments-focus').props.children).toBe('comment-7');
  });
});

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';
import { useRecommendationById } from '../src/hooks/useRecommendationById';

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
  useRecommendationById: jest.fn(() => ({ data: null, loading: true, resolved: false, refresh: jest.fn() })),
}));
jest.mock('../src/hooks/useUserData', () => ({ useUserData: () => ({ displayName: 'Dana' }) }));
jest.mock('../src/services/PersonalizationService', () => ({
  recordRecommendationOpen: jest.fn(() => Promise.resolve()),
  recordRecommendationView: jest.fn(() => Promise.resolve()),
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
jest.mock('../src/components/RecommendationActionBar', () => {
  const ReactModule = require('react');
  const { Pressable, Text } = require('react-native');
  return { RecommendationActionBar: ({ onSharePress }) => ReactModule.createElement(
    Pressable, { onPress: onSharePress, accessibilityLabel: 'Share' }, ReactModule.createElement(Text, null, 'Share')) };
});
jest.mock('../src/features/tripPlanner/components/AddToTripModal', () => () => null);
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
  afterEach(() => jest.restoreAllMocks());
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

  it('shares a canonical recommendation URL after loading an ID-only link', async () => {
    useRecommendationById.mockReturnValueOnce({ data: { id: 'rec-1', title: 'המלצה', status: 'active' }, loading: false, resolved: true });
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    const screen = render(<RecommendationDetailScreen route={{ params: { postId: 'rec-1' } }} navigation={{ navigate: jest.fn() }} />);
    fireEvent.press(screen.getByLabelText('Share'));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'המלצה', message: 'המלצה\nhttps://planli.cc/recommendation/rec-1' }));
  });

  it('discards stale navigation data when a recommendation is missing, including retries', () => {
    const refresh = jest.fn();
    const props = { route: { params: { item: { id: 'rec-1', title: 'cached' } } }, navigation: {} };
    useRecommendationById.mockReturnValueOnce({ data: null, loading: false, resolved: true, refresh });
    const screen = render(<RecommendationDetailScreen {...props} />);
    expect(screen.queryByTestId('mock-recommendation-photo')).toBeNull();
    fireEvent.press(screen.getByLabelText('ניסיון נוסף'));
    expect(refresh).toHaveBeenCalledTimes(1);
    useRecommendationById.mockReturnValueOnce({ data: null, loading: true, resolved: true, refresh });
    screen.rerender(<RecommendationDetailScreen {...props} />);
    expect(screen.queryByTestId('mock-recommendation-photo')).toBeNull();
  });
});

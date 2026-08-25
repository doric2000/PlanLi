import React from 'react';
import { View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import RecommendationCard from '../src/components/RecommendationCard';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('../src/config/firebase', () => ({
  auth: { currentUser: null },
}));

jest.mock('../src/services/SocialService', () => ({
  deleteContent: jest.fn(),
}));

jest.mock('../src/hooks/useUserData', () => ({
  useUserData: () => ({ displayName: 'Traveler' }),
}));

jest.mock('../src/hooks/useAdminClaim', () => ({
  useAdminClaim: () => ({ isAdmin: false }),
}));

jest.mock('../src/hooks/useAuthUser', () => ({
  useAuthUser: () => ({
    user: null,
    isActive: false,
    ensureCapability: jest.fn(async () => false),
  }),
}));

jest.mock('../src/hooks/useBoundedImageWindow', () => ({
  useBoundedImageWindow: () => ({ currentIndex: 0, indices: [0] }),
}));

jest.mock('../src/hooks/useStableCarouselLayout', () => ({
  useStableCarouselLayout: () => ({ pageWidth: 390, frameHeight: 355, onLayout: jest.fn() }),
}));

jest.mock('../src/utils/contentPermissions', () => ({
  canManageRecommendation: () => false,
}));

jest.mock('../src/components/CachedImage', () => {
  const { View: MockView } = require('react-native');
  const MockCachedImage = (props) => <MockView {...props} />;
  return {
    __esModule: true,
    default: MockCachedImage,
    prefetchImage: jest.fn(() => Promise.resolve()),
  };
});

jest.mock('../src/components/RtlPagedFlatList', () => {
  const ReactModule = require('react');
  const { View: MockView } = require('react-native');
  return ReactModule.forwardRef(({ data, renderItem }, _ref) => (
    <MockView>{data.map((item, index) => (
      <ReactModule.Fragment key={`${index}:${item}`}>
        {renderItem({ item, index })}
      </ReactModule.Fragment>
    ))}</MockView>
  ));
});

jest.mock('../src/components/Avatar', () => {
  const { View: MockView } = require('react-native');
  return { Avatar: () => <MockView /> };
});
jest.mock('../src/components/ActionMenu', () => ({ ActionMenu: () => null }));
jest.mock('../src/components/ActionBar', () => () => null);
jest.mock('../src/components/FavoriteButton', () => () => null);
jest.mock('../src/components/PreferenceContextLine', () => () => null);
jest.mock('../src/features/profile/context/PersonalizationFeedbackContext', () => ({
  usePersonalizationFeedback: () => ({ isHidden: () => false }),
}));

const recommendation = {
  id: 'recommendation-1',
  title: 'Hidden beach',
  description: 'A quiet beach recommendation',
  ownerId: 'owner-1',
  media: [{
    feed: { url: 'https://example.com/feed.webp', width: 1080, height: 1080 },
    thumb: { url: 'https://example.com/thumb.webp', width: 400, height: 400 },
  }],
};

describe('RecommendationCard photo navigation', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('opens recommendation details when its photo is pressed', () => {
    const screen = render(<RecommendationCard item={recommendation} showActionBar={false} />);

    fireEvent.press(screen.getByTestId('recommendation-image-recommendation-1-0'));

    expect(mockNavigate).toHaveBeenCalledWith('RecommendationDetail', { item: recommendation });
  });

  it('loads a favorite preview by post id when its photo is pressed', () => {
    const preview = { ...recommendation, isFavoritePreview: true };
    const screen = render(<RecommendationCard item={preview} showActionBar={false} />);

    fireEvent.press(screen.getByTestId('recommendation-image-recommendation-1-0'));

    expect(mockNavigate).toHaveBeenCalledWith('RecommendationDetail', {
      postId: 'recommendation-1',
    });
  });
});

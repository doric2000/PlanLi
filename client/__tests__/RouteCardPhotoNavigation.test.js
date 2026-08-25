import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { RouteCard } from '../src/features/roadtrip/components/RouteCard';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('../src/config/firebase', () => ({
  auth: { currentUser: null },
}));

jest.mock('../src/hooks/useUserData', () => ({
  useUserData: () => ({ displayName: 'Traveler' }),
}));

jest.mock('../src/hooks/useAdminClaim', () => ({
  useAdminClaim: () => ({ isAdmin: false }),
}));

jest.mock('../src/hooks/useAuthUser', () => ({
  useAuthUser: () => ({ isActive: false, ensureCapability: jest.fn(async () => false) }),
}));

jest.mock('../src/hooks/useBoundedImageWindow', () => ({
  useBoundedImageWindow: () => ({ currentIndex: 0, indices: [0] }),
}));

jest.mock('../src/hooks/useStableCarouselLayout', () => ({
  useStableCarouselLayout: () => ({ pageWidth: 390, frameHeight: 312, onLayout: jest.fn() }),
}));

jest.mock('../src/components/CachedImage', () => {
  const { View } = require('react-native');
  const MockCachedImage = (props) => <View {...props} />;
  return {
    __esModule: true,
    default: MockCachedImage,
    prefetchImage: jest.fn(() => Promise.resolve()),
  };
});

jest.mock('../src/components/RtlPagedFlatList', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return ReactModule.forwardRef(({ data, renderItem }, _ref) => (
    <View>{data.map((item, index) => (
      <ReactModule.Fragment key={`${index}:${item}`}>
        {renderItem({ item, index })}
      </ReactModule.Fragment>
    ))}</View>
  ));
});

jest.mock('../src/components/Avatar', () => {
  const { View } = require('react-native');
  return { Avatar: () => <View /> };
});
jest.mock('../src/components/ActionMenu', () => ({ ActionMenu: () => null }));
jest.mock('../src/components/ActionBar', () => () => null);
jest.mock('../src/components/FavoriteButton', () => () => null);
jest.mock('../src/components/PreferenceContextLine', () => () => null);
jest.mock('../src/features/profile/context/PersonalizationFeedbackContext', () => ({
  usePersonalizationFeedback: () => ({ isHidden: () => false }),
}));
jest.mock('../src/features/roadtrip/components/PlacesRoute', () => () => null);

const route = {
  id: 'route-1',
  title: 'Northern road trip',
  description: 'A scenic multi-day route',
  ownerId: 'owner-1',
  media: [{
    feed: { url: 'https://example.com/route-feed.webp', width: 1080, height: 864 },
    thumb: { url: 'https://example.com/route-thumb.webp', width: 400, height: 320 },
  }],
};

describe('RouteCard photo navigation', () => {
  it('uses the existing route-details callback when a RoadTrip photo is pressed', () => {
    const openRoute = jest.fn();
    const screen = render(
      <RouteCard item={route} variant="feed" onPress={openRoute} showActionBar={false} />,
    );

    fireEvent.press(screen.getByTestId('route-image-route-1-0'));

    expect(openRoute).toHaveBeenCalledTimes(1);
  });

  it('shows the route budget instead of the misleading straight-line distance', () => {
    const screen = render(
      <RouteCard
        item={{
          ...route,
          dayCount: 3,
          distanceKm: 42.7,
          facets: { budgetLevel: 'balanced' },
          transportModes: ['car'],
        }}
        variant="feed"
        onPress={jest.fn()}
        showActionBar={false}
      />,
    );

    expect(screen.getByText('3 ימים')).toBeTruthy();
    expect(screen.getByText('בינוני · ₪₪')).toBeTruthy();
    expect(screen.queryByText(/42\.7|ק״מ/)).toBeNull();
  });
});

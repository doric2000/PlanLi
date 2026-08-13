import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import BackButton from '../src/components/BackButton';
import FavoriteButton from '../src/components/FavoriteButton';
import PageHeader from '../src/components/PageHeader';
import { RecommendationHero } from '../src/components/RecommendationHero';
import { colors, radii, TAB_HERO_BASE_HEIGHT } from '../src/styles';

const mockUseFavorite = jest.fn();
const mockUseSafeAreaInsets = jest.fn(() => ({ top: 0, right: 0, bottom: 0, left: 0 }));

jest.mock('../src/hooks/useFavorite', () => ({
  useFavorite: (...args) => mockUseFavorite(...args),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockUseSafeAreaInsets(),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
}));

jest.mock('@expo/vector-icons', () => {
  const MockIcon = ({ name, color }) => {
    const { Text: MockText } = require('react-native');
    return <MockText testID={`icon-${name}`} style={{ color }}>{name}</MockText>;
  };
  return { Ionicons: MockIcon, MaterialIcons: MockIcon };
});

jest.mock('../src/components/CachedImage', () => {
  const { View: MockView } = require('react-native');
  const MockCachedImage = ({ style }) => <MockView testID="hero-image" style={style} />;
  return {
    __esModule: true,
    default: MockCachedImage,
    prefetchImage: jest.fn(() => Promise.resolve()),
  };
});

describe('overlapping hero headers', () => {
  beforeEach(() => {
    mockUseSafeAreaInsets.mockReturnValue({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it.each([0, 44])('uses one tab-header height plus a %ipx top safe area', (top) => {
    mockUseSafeAreaInsets.mockReturnValue({ top, right: 0, bottom: 0, left: 0 });
    const { getByTestId } = render(
      <PageHeader testID="uniform-hero-header" variant="hero" title="קהילה" />
    );

    const style = StyleSheet.flatten(getByTestId('uniform-hero-header').props.style);
    expect(style.height).toBe(TAB_HERO_BASE_HEIGHT + top);
    expect(style.paddingTop).toBe(top + 8);
  });

  it('overlaps the next surface by the same amount as its lower corner radius', () => {
    const { getByTestId } = render(
      <PageHeader testID="hero-header" variant="hero" overlapNext title="קהילה" />
    );
    const style = StyleSheet.flatten(getByTestId('hero-header').props.style);

    expect(style.marginBottom).toBe(-radii.xl);
    expect(style.zIndex).toBeGreaterThan(0);
    expect(style.borderBottomLeftRadius).toBe(radii.xl);
    expect(style.borderBottomRightRadius).toBe(radii.xl);
  });
});

describe('RTL recommendation actions', () => {
  beforeEach(() => {
    mockUseFavorite.mockReturnValue({
      isFavorite: false,
      toggleFavorite: jest.fn(),
      loading: false,
    });
  });

  it('uses a right-pointing back icon when RTL is explicit', () => {
    const { getByTestId, queryByTestId } = render(<BackButton iconDirection="rtl" />);
    expect(getByTestId('icon-chevron-forward')).toBeTruthy();
    expect(queryByTestId('icon-chevron-back')).toBeNull();
  });

  it.each([
    ['without an image', { id: 'rec-no-image' }],
    ['with an image', { id: 'rec-image', media: [{ large: { url: 'https://example.com/a.jpg' } }] }],
  ])('places back first in a row-reverse action bar %s', (_, item) => {
    const { getByTestId } = render(<RecommendationHero item={item} snapshotData={{}} />);
    const style = StyleSheet.flatten(getByTestId('recommendation-hero-actions').props.style);

    expect(style.flexDirection).toBe('row-reverse');
    expect(style.justifyContent).toBe('space-between');
    expect(getByTestId('icon-chevron-forward')).toBeTruthy();
  });

  it('supports the shared route hero without changing recommendation defaults', () => {
    render(
      <RecommendationHero
        item={{ id: 'route-1' }}
        snapshotData={{}}
        favoriteType="routes"
        imageUrls={['https://example.com/route.jpg']}
        emptyIcon="route"
      />
    );
    expect(mockUseFavorite).toHaveBeenCalledWith('routes', 'route-1', {});
  });

  it('opens the selected detail image through the shared gallery callback', () => {
    const onImagePress = jest.fn();
    const screen = render(
      <RecommendationHero
        item={{ id: 'rec-gallery', media: [{ large: { url: 'https://example.com/photo.jpg' } }] }}
        snapshotData={{}}
        onImagePress={onImagePress}
      />
    );

    fireEvent.press(screen.getByTestId('recommendation-hero-image-0'));
    expect(onImagePress).toHaveBeenCalledWith(0);
  });
});

describe('favorite state presentation', () => {
  it('uses a neutral outline and save label when not saved', () => {
    mockUseFavorite.mockReturnValue({
      isFavorite: false,
      toggleFavorite: jest.fn(),
      loading: false,
    });
    const { getByLabelText, getByTestId } = render(
      <FavoriteButton
        type="recommendations"
        id="one"
        variant="dark"
        style={{ backgroundColor: colors.white }}
      />
    );

    expect(getByLabelText('שמירה במועדפים')).toBeTruthy();
    expect(getByTestId('icon-bookmark-outline')).toBeTruthy();
  });

  it('uses the orange action state, filled white icon and remove label when saved', () => {
    mockUseFavorite.mockReturnValue({
      isFavorite: true,
      toggleFavorite: jest.fn(),
      loading: false,
    });
    const { getByLabelText, getByTestId } = render(
      <FavoriteButton
        type="recommendations"
        id="one"
        variant="dark"
        style={{ backgroundColor: colors.white }}
      />
    );
    const button = getByLabelText('הסרה מהמועדפים');
    const style = StyleSheet.flatten(button.props.style);

    expect(style.backgroundColor).toBe(colors.accentAction);
    expect(getByTestId('icon-bookmark').props.style.color).toBe(colors.white);
  });
});

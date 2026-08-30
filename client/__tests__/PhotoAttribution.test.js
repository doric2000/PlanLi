import React from 'react';
import { Linking, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import PhotoAttribution from '../src/components/PhotoAttribution';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }) => ReactModule.createElement(Text, null, `icon:${name}`),
  };
});

jest.mock('expo-linear-gradient', () => {
  const ReactModule = require('react');
  const { View: MockView } = require('react-native');
  return {
    LinearGradient: (props) => ReactModule.createElement(MockView, props),
  };
});

const unsplashImage = {
  source: { type: 'unsplash' },
  attribution: {
    photographerName: 'Annie Spratt',
    photographerProfileUrl: 'https://unsplash.com/@anniespratt?utm_source=planli&utm_medium=referral',
    photoUrl: 'https://unsplash.com/photos/not-opened',
    providerName: 'Unsplash',
    providerUrl: 'https://unsplash.com/?utm_source=planli&utm_medium=referral',
  },
};

const wikimediaImage = {
  source: { type: 'wikimedia' },
  attribution: {
    photographerName: 'Traveler',
    photoUrl: 'https://commons.wikimedia.org/wiki/File:Traveler.jpg',
    providerName: 'Wikimedia Commons',
    providerUrl: 'https://commons.wikimedia.org/',
    licenseName: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
};

describe('PhotoAttribution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'openURL').mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows a minimal Unsplash credit and opens only the photographer profile', () => {
    const parentPress = jest.fn();
    const screen = render(
      <View onTouchEnd={parentPress}>
        <PhotoAttribution image={unsplashImage} />
      </View>
    );

    expect(screen.getByText('צילום: ')).toBeTruthy();
    expect(screen.getByText('Annie Spratt')).toBeTruthy();
    expect(screen.getByText(' · Unsplash')).toBeTruthy();
    expect(screen.getAllByRole('link')).toHaveLength(1);

    fireEvent.press(screen.getByLabelText('פתיחת הפרופיל של Annie Spratt ב-Unsplash'));

    expect(Linking.openURL).toHaveBeenCalledWith(unsplashImage.attribution.photographerProfileUrl);
    expect(Linking.openURL).not.toHaveBeenCalledWith(unsplashImage.attribution.photoUrl);
    expect(parentPress).not.toHaveBeenCalled();
  });

  it('shows Wikimedia credit details locally before opening external links', () => {
    const screen = render(<PhotoAttribution image={wikimediaImage} />);

    expect(screen.queryByText('CC BY-SA 4.0')).toBeNull();
    fireEvent.press(screen.getByLabelText('פרטי קרדיט לתמונה מאת Traveler'));

    expect(screen.getByText('פרטי התמונה')).toBeTruthy();
    expect(screen.getByText('Traveler')).toBeTruthy();
    expect(screen.getByText('CC BY-SA 4.0')).toBeTruthy();
    expect(Linking.openURL).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('פתיחת עמוד המקור'));
    expect(Linking.openURL).toHaveBeenCalledWith(wikimediaImage.attribution.photoUrl);
    fireEvent.press(screen.getByLabelText('פתיחת פרטי הרישיון'));
    expect(Linking.openURL).toHaveBeenCalledWith(wikimediaImage.attribution.licenseUrl);
  });

  it.each(['Public Domain', 'CC0 1.0'])('renders nothing for Wikimedia %s', (licenseName) => {
    const screen = render(
      <PhotoAttribution image={{
        source: { type: 'wikimedia' },
        attribution: { licenseName },
      }} />
    );
    expect(screen.toJSON()).toBeNull();
  });

  it('suppresses hostile legacy provider links while preserving local credit text', () => {
    const screen = render(<PhotoAttribution image={{
      ...wikimediaImage,
      attribution: {
        ...wikimediaImage.attribution,
        photoUrl: 'https://commons.wikimedia.org.evil.example/wiki/File:Traveler.jpg',
        licenseUrl: 'javascript:alert(1)',
      },
    }} />);

    fireEvent.press(screen.getByLabelText('פרטי קרדיט לתמונה מאת Traveler'));

    expect(screen.getByText('Traveler')).toBeTruthy();
    expect(screen.queryByLabelText('פתיחת עמוד המקור')).toBeNull();
    expect(screen.queryByLabelText('פתיחת פרטי הרישיון')).toBeNull();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('renders an unsafe Unsplash profile as non-clickable credit', () => {
    const screen = render(<PhotoAttribution image={{
      ...unsplashImage,
      attribution: {
        ...unsplashImage.attribution,
        photographerProfileUrl: 'https://unsplash.com@evil.example/@traveler',
      },
    }} />);

    expect(screen.getByText('Annie Spratt')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});

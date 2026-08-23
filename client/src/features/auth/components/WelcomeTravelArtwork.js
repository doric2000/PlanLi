import React from 'react';
import { Image, View } from 'react-native';

import { authStyles } from '../../../styles';

export default function WelcomeTravelArtwork({ topInset = 0 }) {
  return (
    <View
      style={authStyles.welcomeArtwork}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="welcome-travel-artwork"
    >
      <Image
        source={require('../../../../assets/welcome-travel-hero.png')}
        style={authStyles.welcomeArtworkImage}
        resizeMode="cover"
        testID="welcome-travel-image"
      />
      <View style={[authStyles.welcomeMarkHalo, { top: 70 + topInset }]} testID="welcome-mark-position">
        <Image
          source={require('../../../../assets/brand-mark.png')}
          style={authStyles.welcomeMark}
          resizeMode="contain"
          testID="welcome-brand-mark"
        />
      </View>
    </View>
  );
}

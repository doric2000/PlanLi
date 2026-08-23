import React from 'react';
import { Image } from 'react-native';
import { authStyles } from '../../../styles';

export default function BrandWordmark({ compact = false, form = false, welcome = false, testID = 'brand-wordmark' }) {
  return (
    <Image
      source={require('../../../../assets/brand-wordmark.png')}
      style={welcome ? authStyles.welcomeWordmark : form ? authStyles.formLogo : compact ? authStyles.compactLogo : authStyles.logo}
      resizeMode="contain"
      accessible
      accessibilityLabel="PlanLi Travels"
      testID={testID}
    />
  );
}

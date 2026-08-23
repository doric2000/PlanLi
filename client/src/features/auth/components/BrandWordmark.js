import React from 'react';
import { Image } from 'react-native';
import { authStyles } from '../../../styles';

export default function BrandWordmark({ compact = false, form = false, testID = 'brand-wordmark' }) {
  return (
    <Image
      source={require('../../../../assets/brand-wordmark.png')}
      style={form ? authStyles.formLogo : compact ? authStyles.compactLogo : authStyles.logo}
      resizeMode="contain"
      accessible
      accessibilityLabel="PlanLi Travels"
      testID={testID}
    />
  );
}

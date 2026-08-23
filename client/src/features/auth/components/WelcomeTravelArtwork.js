import React from 'react';
import { Image, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { authStyles } from '../../../styles';

export default function WelcomeTravelArtwork() {
  return (
    <View
      style={authStyles.welcomeArtwork}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width="100%" height="100%" viewBox="0 0 375 220">
        <Path
          d="M0 154 C48 112 91 126 133 150 C177 174 217 135 258 118 C304 99 337 119 375 91 L375 220 L0 220 Z"
          fill="#DCEAF5"
        />
        <Path
          d="M0 181 C51 145 98 158 143 184 C190 210 232 166 276 149 C319 133 348 144 375 128 L375 220 L0 220 Z"
          fill="#BFD6E8"
        />
        <Path
          d="M24 174 C78 145 106 194 154 173 C202 152 213 114 260 128 C302 141 314 100 352 91"
          fill="none"
          stroke="#F5961D"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="8 9"
        />
        <Circle cx="25" cy="174" r="7" fill="#FFFFFF" stroke="#1E3A5F" strokeWidth="4" />
        <Circle cx="154" cy="173" r="7" fill="#FFFFFF" stroke="#F5961D" strokeWidth="4" />
        <Circle cx="260" cy="128" r="7" fill="#FFFFFF" stroke="#1E3A5F" strokeWidth="4" />
        <Circle cx="352" cy="91" r="9" fill="#F5961D" />
        <Circle cx="352" cy="91" r="3" fill="#FFFFFF" />
      </Svg>
      <View style={authStyles.welcomeMarkHalo}>
        <Image
          source={require('../../../../assets/brand-mark.png')}
          style={authStyles.welcomeMark}
          resizeMode="cover"
        />
      </View>
    </View>
  );
}

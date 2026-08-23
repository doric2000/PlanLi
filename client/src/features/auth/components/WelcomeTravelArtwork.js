import React from 'react';
import { Image, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from 'react-native-svg';

import { authStyles } from '../../../styles';

export default function WelcomeTravelArtwork() {
  return (
    <View
      style={authStyles.welcomeArtwork}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="welcome-travel-artwork"
    >
      <Svg width="100%" height="100%" viewBox="0 0 375 280" preserveAspectRatio="xMidYMax slice">
        <Defs>
          <SvgLinearGradient id="farMountains" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#EAF2F8" />
            <Stop offset="1" stopColor="#C9DCEC" />
          </SvgLinearGradient>
          <SvgLinearGradient id="nearMountains" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#A9C9E1" />
            <Stop offset="1" stopColor="#4E83B4" />
          </SvgLinearGradient>
          <SvgLinearGradient id="valley" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#F8FCFF" />
            <Stop offset="1" stopColor="#BFD9EA" />
          </SvgLinearGradient>
        </Defs>

        <G opacity="0.72" fill="#FFFFFF">
          <Ellipse cx="34" cy="38" rx="35" ry="12" />
          <Circle cx="19" cy="30" r="13" />
          <Circle cx="46" cy="27" r="18" />
          <Ellipse cx="342" cy="62" rx="43" ry="13" />
          <Circle cx="325" cy="51" r="16" />
          <Circle cx="352" cy="45" r="21" />
        </G>

        <Path
          d="M0 116 C29 91 48 92 70 118 C91 143 108 141 132 112 C158 80 179 80 205 113 C227 141 244 142 269 111 C294 80 320 82 375 124 L375 280 L0 280 Z"
          fill="url(#farMountains)"
        />
        <Path
          d="M0 162 C38 120 70 122 104 161 C133 194 165 197 198 160 C235 118 272 125 301 158 C325 185 345 181 375 153 L375 280 L0 280 Z"
          fill="#D9E7F2"
        />
        <Path
          d="M0 208 C47 163 89 168 128 208 C166 246 209 245 249 203 C288 162 329 170 375 208 L375 280 L0 280 Z"
          fill="url(#nearMountains)"
        />
        <Path
          d="M84 280 C125 235 147 218 187 214 C227 210 250 235 292 280 Z"
          fill="url(#valley)"
          opacity="0.98"
        />

        <G stroke="#477DAC" strokeWidth="3" strokeLinecap="round" opacity="0.9">
          <Path d="M29 235 L29 187" />
          <Path d="M29 189 C12 180 9 168 8 160" />
          <Path d="M29 190 C41 176 50 170 59 170" />
          <Path d="M29 190 C18 171 19 162 23 154" />
          <Path d="M29 190 C39 169 39 160 37 153" />
        </G>

        <Path
          d="M54 232 C99 241 121 242 153 223 C184 204 178 173 216 163 C253 153 249 124 289 116 C316 110 328 91 349 73"
          fill="none"
          stroke="#F5961D"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray="7 7"
        />
        <Circle cx="54" cy="232" r="8" fill="#FFFFFF" stroke="#1E3A5F" strokeWidth="4" />
        <Circle cx="153" cy="223" r="7" fill="#FFFFFF" stroke="#F5961D" strokeWidth="3.5" />
        <Circle cx="216" cy="163" r="6" fill="#FFFFFF" stroke="#1E3A5F" strokeWidth="3" />
        <Circle cx="289" cy="116" r="6" fill="#FFFFFF" stroke="#F5961D" strokeWidth="3" />
        <Path
          d="M349 58 C339 58 332 66 332 76 C332 89 349 103 349 103 C349 103 366 89 366 76 C366 66 359 58 349 58 Z"
          fill="#F5961D"
        />
        <Circle cx="349" cy="75" r="5" fill="#FFFFFF" />
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

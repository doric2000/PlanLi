import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { forms } from '../../../styles';
import CachedImage from '../../../components/CachedImage';

const SOCIALS = [
  { logo: "https://cdn-icons-png.flaticon.com/512/300/300221.png", key: "google" },
  { logo: "https://cdn-icons-png.flaticon.com/512/5968/5968764.png", key: "facebook" },
  { logo: "https://cdn-icons-png.flaticon.com/512/0/747.png", key: "apple" },
];

export const SocialLoginButtons = ({ onGoogleLogin }) => (
  <View style={forms.authSocialContainer}>
    {SOCIALS.map((item, index) => (
      <TouchableOpacity
        key={index}
        style={forms.authSocialButton}
        onPress={item.key === "google" ? onGoogleLogin : undefined}
      >
        <CachedImage
          source={{ uri: item.logo }}
          style={forms.authSocialIcon}
          contentFit="contain"
          priority="low"
        />
      </TouchableOpacity>
    ))}
  </View>
);

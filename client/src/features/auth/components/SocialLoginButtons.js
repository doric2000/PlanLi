import React from 'react';
import { View, TouchableOpacity, Image } from 'react-native';
import { forms } from '../../../styles';

const GOOGLE_LOGO = "https://cdn-icons-png.flaticon.com/512/300/300221.png";
const FACEBOOK_LOGO = "https://cdn-icons-png.flaticon.com/512/5968/5968764.png";
const APPLE_LOGO = "https://cdn-icons-png.flaticon.com/512/0/747.png";

export const SocialLoginButtons = () => (
  <View style={forms.authSocialContainer}>
    {[GOOGLE_LOGO, FACEBOOK_LOGO, APPLE_LOGO].map((uri, index) => (
      <TouchableOpacity key={index} style={forms.authSocialButton}>
        <Image source={{ uri }} style={forms.authSocialIcon} />
      </TouchableOpacity>
    ))}
  </View>
);
import React, { useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import AppText from "./AppText";
import AppTextInput from "./AppTextInput";
import { Ionicons } from '@expo/vector-icons';
import { forms } from '../styles'; // Adjust path

export const AuthInput = ({ 
  label, 
  value, 
  onChangeText, 
  placeholder, 
  iconName, 
  isPassword = false, 
  keyboardType = 'default',
  autoCapitalize = 'none' 
}) => {
  const [isSecure, setIsSecure] = useState(isPassword);

  return (
    <View style={forms.authInputContainer}>
      <AppText style={forms.authInputLabel}>{label}</AppText>
      <View style={forms.authInputWrapper}>
        <Ionicons name={iconName} size={20} color="#6B7280" style={forms.authInputIcon} />
        <AppTextInput
          style={forms.authInput}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={isSecure}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
        />
        {isPassword && (
          <TouchableOpacity onPress={() => setIsSecure(!isSecure)} style={forms.authEyeIcon}>
            <Ionicons name={isSecure ? "eye-off-outline" : "eye-outline"} size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};
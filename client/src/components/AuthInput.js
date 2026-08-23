import React, { forwardRef, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import AppText from "./AppText";
import AppTextInput from "./AppTextInput";
import { Ionicons } from '@expo/vector-icons';
import { authStyles } from '../styles';

export const AuthInput = forwardRef(function AuthInput({
  label, 
  value, 
  onChangeText, 
  placeholder, 
  iconName, 
  isPassword = false, 
  keyboardType = 'default',
  autoCapitalize = 'none',
  testID,
  editable = true,
  compact = false,
  hideLabel = false,
  contentDirection = 'rtl',
  accessibilityLabel = label,
  ...inputProps
}, ref) {
  const [isSecure, setIsSecure] = useState(isPassword);
  const writingDirection = contentDirection === 'ltr' && value ? 'ltr' : 'rtl';

  return (
    <View style={[authStyles.field, compact && authStyles.compactField, hideLabel && authStyles.editingField]}>
      {!hideLabel ? <AppText style={[authStyles.label, compact && authStyles.compactLabel]}>{label}</AppText> : null}
      <View style={[authStyles.inputRow, compact && authStyles.compactInputRow]}>
        <Ionicons name={iconName} size={19} color="#64748B" style={authStyles.inputIcon} />
        <AppTextInput
          ref={ref}
          style={[
            authStyles.input,
            compact && authStyles.compactInput,
            { writingDirection, textAlign: 'right' },
          ]}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={isSecure}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          testID={testID}
          editable={editable}
          accessibilityLabel={accessibilityLabel}
          {...inputProps}
        />
        {isPassword && (
          <TouchableOpacity
            onPress={() => setIsSecure(!isSecure)}
            style={authStyles.eyeButton}
            accessibilityRole="button"
            accessibilityLabel={isSecure ? 'הצגת סיסמה' : 'הסתרת סיסמה'}
            testID={testID ? `${testID}-visibility` : undefined}
          >
            <Ionicons name={isSecure ? "eye-off-outline" : "eye-outline"} size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

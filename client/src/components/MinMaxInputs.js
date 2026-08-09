import React from 'react';
import { View } from 'react-native';
import AppText from "./AppText";
import AppTextInput from "./AppTextInput";
import { common, spacing } from '../styles';

export default function MinMaxInputs({
  label,
  minValue,
  maxValue,
  onChangeMin,
  onChangeMax,
  minPlaceholder = "מינ׳",
  maxPlaceholder = "מקס׳",
  unitSuffix,
}) {
  return (
    <View style={{ marginTop: spacing.md }}>
      {!!label && (
        <AppText style={common.modalLabel}>
          {label}{unitSuffix ? ` (${unitSuffix})` : ''}
        </AppText>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <AppTextInput
          style={[common.modalInput, { flex: 1, textAlign: 'center' }]}
          placeholder={minPlaceholder}
          keyboardType="numeric"
          value={String(minValue ?? '')}
          onChangeText={onChangeMin}
        />
        <AppTextInput
          style={[common.modalInput, { flex: 1, textAlign: 'center' }]}
          placeholder={maxPlaceholder}
          keyboardType="numeric"
          value={String(maxValue ?? '')}
          onChangeText={onChangeMax}
        />
      </View>
    </View>
  );
}

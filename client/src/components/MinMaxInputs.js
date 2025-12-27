import React from 'react';
import { View, Text, TextInput } from 'react-native';
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
        <Text style={common.modalLabel}>
          {label}{unitSuffix ? ` (${unitSuffix})` : ''}
        </Text>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TextInput
          style={[common.modalInput, { flex: 1, textAlign: 'center' }]}
          placeholder={minPlaceholder}
          keyboardType="numeric"
          value={String(minValue ?? '')}
          onChangeText={onChangeMin}
        />
        <TextInput
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

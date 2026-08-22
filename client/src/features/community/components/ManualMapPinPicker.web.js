import React, { useState } from 'react';
import { View } from 'react-native';

import { FormInput } from '../../../components/FormInput';
import AppText from '../../../components/AppText';
import { recommendationComposerStyles as styles } from '../../../styles';

export default function ManualMapPinPicker({ destination, value, onChange }) {
  const [focusedField, setFocusedField] = useState('');
  const latitude = value?.latitude ?? value?.lat ?? '';
  const longitude = value?.longitude ?? value?.lng ?? '';
  const update = (field, nextValue) => {
    onChange?.({
      latitude: field === 'latitude' ? nextValue : latitude,
      longitude: field === 'longitude' ? nextValue : longitude,
    });
  };

  return (
    <View>
      <AppText style={styles.fieldHint}>
        בגרסת הדפדפן אפשר להזין קואורדינטות. באפליקציה ניתן לסמן את הנקודה ישירות במפה.
      </AppText>
      <View style={styles.coordinateFields}>
        <FormInput
          label="קו רוחב"
          value={String(latitude)}
          onChangeText={(next) => update('latitude', next)}
          placeholder={focusedField === 'latitude' ? '' : String(destination?.coordinates?.lat || '32.0853')}
          onFocus={() => setFocusedField('latitude')}
          onBlur={() => setFocusedField('')}
          keyboardType="decimal-pad"
          rtl
          testID="recommendation-manual-latitude"
        />
        <FormInput
          label="קו אורך"
          value={String(longitude)}
          onChangeText={(next) => update('longitude', next)}
          placeholder={focusedField === 'longitude' ? '' : String(destination?.coordinates?.lng || '34.7818')}
          onFocus={() => setFocusedField('longitude')}
          onBlur={() => setFocusedField('')}
          keyboardType="decimal-pad"
          rtl
          testID="recommendation-manual-longitude"
        />
      </View>
    </View>
  );
}

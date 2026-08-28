import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { regionSelectorStyles as styles } from '../../../styles/regionSelector';
import { getRegionById } from '../regionDefinitions';

export default function RegionHeaderAction({ regionId, onPress, testID }) {
  const region = getRegionById(regionId);
  if (!region) return null;

  return (
    <Pressable
      style={({ pressed }) => [styles.headerRegionAction, pressed && styles.headerRegionActionPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`האזור הנבחר: ${region.label}. לחיצה להחלפה`}
      accessibilityHint="פתיחת מסך בחירת אזור"
      testID={testID}
    >
      <View style={styles.headerRegionIcon} pointerEvents="none">
        <Ionicons name="earth-outline" size={18} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}

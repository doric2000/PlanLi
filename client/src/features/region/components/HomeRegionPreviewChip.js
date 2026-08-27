import { TouchableOpacity, View } from 'react-native';

import AppText from '../../../components/AppText';
import { regionSelectorStyles as styles } from '../../../styles/regionSelector';
import { getRegionById } from '../regionDefinitions';

export default function HomeRegionPreviewChip({ regionId, onPress }) {
  const region = getRegionById(regionId);
  if (!region) return null;

  return (
    <View style={styles.previewChipWrap} testID="home-region-preview-chip">
      <TouchableOpacity
        style={styles.previewChip}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`אזור נבחר: ${region.label}. החלפה`}
        testID="home-region-preview-change"
      >
        <View style={styles.previewChipCopy}>
          <AppText style={styles.previewChipEyebrow}>האזור שנבחר</AppText>
          <AppText style={styles.previewChipLabel}>{region.label}</AppText>
        </View>
        <View style={styles.previewChipAction}>
          <AppText style={styles.previewChipActionText}>החלפה</AppText>
        </View>
      </TouchableOpacity>
    </View>
  );
}

import { useMemo, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { regionSelectorStyles as styles } from '../../../styles/regionSelector';
import { useRegionSelection } from '../context/RegionSelectionState';
import {
  REGIONS,
  REGION_SELECTOR_REFERENCE,
  REGION_SELECTOR_SOURCE_SIZE,
} from '../regionDefinitions';

const WEB_MAX_CANVAS_WIDTH = 430;

function closeSelector(navigation) {
  if (navigation?.canGoBack?.() && typeof navigation?.goBack === 'function') {
    navigation.goBack();
    return;
  }
  navigation?.navigate?.('Main');
}

function scaledCropStyle(crop, canvasWidth, canvasHeight, zIndex = 0) {
  const widthScale = canvasWidth / REGION_SELECTOR_SOURCE_SIZE.width;
  const heightScale = canvasHeight / REGION_SELECTOR_SOURCE_SIZE.height;
  return {
    left: crop.x * widthScale,
    top: crop.y * heightScale,
    width: crop.width * widthScale,
    height: crop.height * heightScale,
    zIndex,
  };
}

export { closeSelector };

export default function RegionSelectorScreen({ navigation, route }) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const { selectRegion, dismissPrompt } = useRegionSelection();
  const [busy, setBusy] = useState(false);
  const required = route?.params?.required === true;
  const canvasWidth = Math.min(viewportWidth, Platform.OS === 'web' ? WEB_MAX_CANVAS_WIDTH : viewportWidth);
  const canvasHeight = Math.round(
    canvasWidth * REGION_SELECTOR_SOURCE_SIZE.height / REGION_SELECTOR_SOURCE_SIZE.width,
  );
  const centerVertically = Platform.OS === 'web' && viewportHeight > canvasHeight;
  const scrollContentStyle = useMemo(() => [
    styles.scrollContent,
    centerVertically && { justifyContent: 'center' },
  ], [centerVertically]);

  const handleRegionPress = async (regionId) => {
    if (busy) return;
    setBusy(true);
    try {
      await selectRegion(regionId);
      if (!required) closeSelector(navigation);
    } catch {
      // Keep the selector open so the traveler can retry without losing the choice.
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await dismissPrompt();
      closeSelector(navigation);
    } catch {
      // Keep the selector open until the local dismissal is persisted.
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={Platform.OS === 'web' ? [] : ['top', 'bottom', 'left', 'right']}
      testID="region-selector-screen"
    >
      <StatusBar barStyle="light-content" backgroundColor="#081E39" />
      <LinearGradient
        colors={['#081E39', '#123E65', '#F8EBD7']}
        locations={[0, 0.42, 1]}
        style={styles.outerGradient}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={scrollContentStyle}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View
            style={[styles.canvas, { width: canvasWidth, height: canvasHeight }]}
            testID="region-selector-canvas"
          >
            <Image
              source={REGION_SELECTOR_REFERENCE}
              style={styles.referenceImage}
              resizeMode="stretch"
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            {!required ? <Pressable
              style={({ pressed }) => [styles.skipButton, pressed && styles.regionButtonPressed]}
              onPress={handleDismiss}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="לא עכשיו"
              testID="region-selector-skip"
            /> : (
              <View style={styles.requiredSkipMask} accessible={false}>
                <Image source={REGION_SELECTOR_REFERENCE} style={styles.requiredSkipMaskImage} resizeMode="stretch" accessible={false} />
              </View>
            )}
            {REGIONS.map((region) => (
              <Pressable
                key={region.id}
                style={({ pressed }) => [
                  styles.regionButton,
                  scaledCropStyle(region.crop, canvasWidth, canvasHeight, region.zIndex),
                  pressed && styles.regionButtonPressed,
                ]}
                onPress={() => handleRegionPress(region.id)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={region.label}
                accessibilityHint={`בחירת אזור ${region.label}`}
                testID={`region-option-${region.id}`}
              >
                <Image
                  source={region.image}
                  style={styles.regionImage}
                  resizeMode="stretch"
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

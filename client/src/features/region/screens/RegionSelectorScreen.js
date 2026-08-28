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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppText from '../../../components/AppText';
import { regionSelectorStyles as styles } from '../../../styles/regionSelector';
import { useRegionSelection } from '../context/RegionSelectionState';
import {
  REGIONS,
  REGION_SELECTOR_REFERENCE,
  REGION_SELECTOR_SOURCE_SIZE,
} from '../regionDefinitions';

const WEB_MAX_CANVAS_WIDTH = 430;

export function calculateRegionSelectorCanvasSize({ viewportWidth, viewportHeight, platform }) {
  const width = Math.min(
    viewportWidth,
    platform === 'web' ? WEB_MAX_CANVAS_WIDTH : viewportWidth,
  );

  return {
    width,
    height: platform === 'web'
      ? Math.round(width * REGION_SELECTOR_SOURCE_SIZE.height / REGION_SELECTOR_SOURCE_SIZE.width)
      : Math.max(1, Math.round(viewportHeight)),
  };
}

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

function scaledOutlineStyle(crop, padding, canvasWidth, canvasHeight) {
  const widthScale = canvasWidth / REGION_SELECTOR_SOURCE_SIZE.width;
  const heightScale = canvasHeight / REGION_SELECTOR_SOURCE_SIZE.height;
  return {
    left: -padding * widthScale,
    top: -padding * heightScale,
    width: (crop.width + padding * 2) * widthScale,
    height: (crop.height + padding * 2) * heightScale,
  };
}

export { closeSelector };

export default function RegionSelectorScreen({ navigation, route }) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { selectRegion } = useRegionSelection();
  const [busy, setBusy] = useState(false);
  const [pressedRegionId, setPressedRegionId] = useState(null);
  const [savingRegionId, setSavingRegionId] = useState(null);
  const required = route?.params?.required === true;
  const selectorSource = route?.params?.source;
  const showCancel = !required
    && typeof selectorSource === 'string'
    && selectorSource.endsWith('-change');
  const { width: canvasWidth, height: canvasHeight } = calculateRegionSelectorCanvasSize({
    viewportWidth,
    viewportHeight,
    platform: Platform.OS,
  });
  const centerVertically = Platform.OS === 'web' && viewportHeight > canvasHeight;
  const activeRegionId = savingRegionId || pressedRegionId;
  const cancelPosition = Platform.OS === 'web'
    ? null
    : { top: Math.max(canvasHeight * 0.024, insets.top + 2) };
  const scrollContentStyle = useMemo(() => [
    styles.scrollContent,
    centerVertically && { justifyContent: 'center' },
  ], [centerVertically]);

  const handleRegionPress = async (regionId) => {
    if (busy) return;
    setBusy(true);
    setSavingRegionId(regionId);
    try {
      await selectRegion(regionId);
      if (!required) closeSelector(navigation);
    } catch {
      // Keep the selector open so the traveler can retry without losing the choice.
    } finally {
      setBusy(false);
      setSavingRegionId(null);
      setPressedRegionId(null);
    }
  };

  return (
    <View
      style={styles.safeArea}
      testID="region-selector-screen"
    >
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <LinearGradient
        colors={['#081E39', '#123E65', '#F8EBD7']}
        locations={[0, 0.42, 1]}
        style={styles.outerGradient}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={scrollContentStyle}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
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
            {showCancel ? <Pressable
              style={({ pressed }) => [
                styles.cancelButton,
                cancelPosition,
                pressed && styles.cancelButtonPressed,
              ]}
              onPress={() => closeSelector(navigation)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="ביטול וחזרה"
              testID="region-selector-cancel"
            >
              <AppText style={styles.cancelButtonText} weight="semiBold">ביטול</AppText>
              <View style={styles.cancelButtonUnderline} accessible={false} />
            </Pressable> : null}
            {REGIONS.map((region) => (
              <Pressable
                key={region.id}
                style={[
                  styles.regionButton,
                  scaledCropStyle(region.crop, canvasWidth, canvasHeight, region.zIndex),
                  activeRegionId === region.id && styles.regionButtonActive,
                ]}
                onPressIn={() => setPressedRegionId(region.id)}
                onPressOut={() => setPressedRegionId(null)}
                onPress={() => handleRegionPress(region.id)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={region.label}
                accessibilityHint={`בחירת אזור ${region.label}`}
                testID={`region-option-${region.id}`}
              >
                {activeRegionId === region.id ? (
                  <View
                    style={[
                      styles.regionPressedVisual,
                      scaledOutlineStyle(
                        region.crop,
                        region.selectionOutlinePadding,
                        canvasWidth,
                        canvasHeight,
                      ),
                    ]}
                    testID={`region-option-${region.id}-pressed-visual`}
                    accessible={false}
                  >
                    <Image
                      source={region.selectionOutline}
                      style={styles.regionPressedImage}
                      resizeMode="stretch"
                      accessible={false}
                      testID={`region-option-${region.id}-selection-outline`}
                    />
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

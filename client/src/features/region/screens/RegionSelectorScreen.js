import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, AppState, Pressable, ScrollView,
  StatusBar, useWindowDimensions, View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../../../components/AppText';
import { atlasStyles as styles } from '../../../styles/atlas';
import { useRegionSelection } from '../context/RegionSelectionState';
import { REGIONS } from '../regionDefinitions';
import catalog from '../atlasRegions.json';
import { atlasPhotos, atlasGlobeFallback } from '../atlasAssets';
import AtlasGlobe from '../components/AtlasGlobe';

export function calculateAtlasLayout({ viewportWidth, viewportHeight, top = 0, bottom = 0 }) {
  const width = Math.min(viewportWidth, 430);
  const scale = Math.min(1, Math.max(.82, (viewportHeight - top - bottom) / 844));
  return { width, globeHeight: Math.round(width / 390 * 282 * scale), photoHeight: Math.max(180, Math.round(width / 390 * 216 * scale)) };
}
export function closeSelector(navigation) {
  if (navigation?.canGoBack?.() && typeof navigation.goBack === 'function') navigation.goBack();
  else navigation?.navigate?.('Main');
}

export default function RegionSelectorScreen({ navigation, route }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { selectedRegionId, selectedMode, selectRegion, selectGlobal } = useRegionSelection();
  const [draftRegion, setDraftRegion] = useState(selectedRegionId || null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [saveError, setSaveError] = useState(false);
  const [globeState, setGlobeState] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [spinning, setSpinning] = useState(true);
  const [focused, setFocused] = useState(navigation?.isFocused?.() ?? true);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const active = focused && foreground;
  const choicesRef = useRef(null);
  const choiceLayouts = useRef({});
  const required = route?.params?.required === true;
  const source = route?.params?.source;
  const canCancel = !required && (Boolean(selectedRegionId) || selectedMode === 'global' || (typeof source === 'string' && source.endsWith('-change')));
  const region = catalog.find((item) => item.id === draftRegion);
  const layout = calculateAtlasLayout({ viewportWidth: width - insets.left - insets.right, viewportHeight: height, top: insets.top, bottom: insets.bottom });

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((enabled) => { if (mounted) setReducedMotion(enabled); });
    const reduced = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    const appState = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    const focus = navigation?.addListener?.('focus', () => setFocused(true));
    const blur = navigation?.addListener?.('blur', () => setFocused(false));
    return () => { mounted = false; reduced.remove(); appState.remove(); focus?.(); blur?.(); };
  }, [navigation]);
  useEffect(() => {
    if (!active || globeState !== 'loading') return undefined;
    const timeout = setTimeout(() => setGlobeState('error'), 15000);
    return () => clearTimeout(timeout);
  }, [active, globeState, attempt]);
  const choose = (id) => {
    if (busyRef.current) return;
    setDraftRegion(id); setSaveError(false);
    const x = choiceLayouts.current[id];
    if (typeof x === 'number') choicesRef.current?.scrollTo({ x: Math.max(0, x - 8), animated: !reducedMotion });
  };
  const confirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setSaveError(false);
    try {
      if (draftRegion) await selectRegion(draftRegion); else await selectGlobal();
      if (!required) closeSelector(navigation);
    } catch { setSaveError(true); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const retry = () => { setGlobeState('loading'); setAttempt((value) => value + 1); };
  const cycle = (direction) => {
    const index = REGIONS.findIndex((item) => item.id === draftRegion);
    const next = index < 0 ? (direction > 0 ? 0 : REGIONS.length - 1) : (index + direction + REGIONS.length) % REGIONS.length;
    choose(REGIONS[next].id);
  };
  return <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]} testID="region-selector-screen">
    <StatusBar barStyle="light-content" backgroundColor="#0A2238" />
    <View style={[styles.frame, { width: layout.width }]} testID="region-selector-canvas">
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces={false} contentInsetAdjustmentBehavior="never">
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <AppText weight="bold" style={styles.logo}>Plan<AppText weight="bold" style={styles.logoGold}>Li</AppText></AppText>
            {canCancel ? <Pressable onPress={() => closeSelector(navigation)} disabled={busy} style={({ pressed }) => [styles.close, pressed && styles.pressed]}
              accessibilityRole="button" accessibilityLabel="ביטול וחזרה" testID="region-selector-cancel">
              <AppText style={styles.closeText}>חזרה</AppText>
            </Pressable> : <View style={styles.closeSpace} />}
          </View>
          <AppText weight="extraBold" style={styles.title}>כל העולם.</AppText>
          <AppText weight="extraBold" style={[styles.title, styles.gold]}>המסע שלכם.</AppText>
          <AppText style={styles.subtitle}>מקום חדש. אנשים טובים. סיפור משלכם.</AppText>
        </View>
        <View style={[styles.globe, { height: layout.globeHeight }]} testID="atlas-globe-stage">
          <Image source={atlasGlobeFallback} style={styles.fill} contentFit="contain" accessible={false} />
          {globeState !== 'error' ? <View style={[styles.fill, globeState === 'loading' && styles.hiddenGlobe]}>
            <AtlasGlobe key={attempt} regionId={draftRegion} active={active && !busy} reducedMotion={reducedMotion} spinning={spinning && !reducedMotion}
              onSelect={choose} onReady={() => setGlobeState('ready')} onError={() => setGlobeState('error')} onInteraction={() => setSpinning(false)} />
          </View> : null}
          <Pressable onPress={() => cycle(-1)} disabled={busy} style={[styles.rotate, styles.rotateLeft]} accessibilityRole="button" accessibilityLabel="האזור הקודם">
            <Ionicons name="chevron-back" size={21} color="#B2C5D4" />
          </Pressable>
          <Pressable onPress={() => cycle(1)} disabled={busy} style={[styles.rotate, styles.rotateRight]} accessibilityRole="button" accessibilityLabel="האזור הבא">
            <Ionicons name="chevron-forward" size={21} color="#B2C5D4" />
          </Pressable>
        </View>
        <View style={styles.hintRow}>
          <AppText style={styles.hint}>{globeState === 'loading' ? 'מכינים לכם את העולם…' : 'סובבו את העולם · בחרו את הרגע הבא'}</AppText>
          {!reducedMotion && globeState === 'ready' ? <Pressable onPress={() => setSpinning((value) => !value)} style={styles.spin}
            accessibilityRole="button" accessibilityLabel={spinning ? 'עצירת סיבוב אוטומטי' : 'הפעלת סיבוב אוטומטי'}>
            <Ionicons name={spinning ? 'pause-outline' : 'play-outline'} size={19} color="#FFB34D" />
          </Pressable> : null}
        </View>
        {globeState === 'error' ? <View style={styles.notice} accessibilityLiveRegion="polite" testID="atlas-globe-error">
          <AppText style={styles.hint}>אפשר להמשיך ולבחור אזור בכפתורים.</AppText>
          <Pressable onPress={retry} style={styles.retry} accessibilityRole="button" accessibilityLabel="טעינת הגלובוס מחדש">
            <AppText weight="semiBold" style={styles.gold}>נסו שוב</AppText>
          </Pressable>
        </View> : null}
        <View style={[styles.photoCard, { minHeight: layout.photoHeight }]} testID="atlas-region-preview" accessibilityLiveRegion="polite">
          {region ? <Image source={atlasPhotos[region.id]} style={styles.fill} contentFit="cover" transition={reducedMotion ? 0 : 180} accessible={false} />
            : <View style={[styles.fill, styles.collage]}>{['north_america', 'europe', 'east_southeast_asia'].map((id) => <Image key={id} source={atlasPhotos[id]} style={styles.collagePhoto} contentFit="cover" accessible={false} />)}</View>}
          <LinearGradient colors={['rgba(6,23,38,0)', 'rgba(6,23,38,0.45)', 'rgba(6,23,38,0.96)']} locations={[0, .45, 1]} style={styles.fill} />
          <View style={styles.photoCopy}>
            <AppText weight="semiBold" style={styles.eyebrow}>{region?.place || 'המסע הבא יכול להתחיל בכל מקום'}</AppText>
            <AppText weight="extraBold" style={styles.regionTitle}>{region?.label || 'כל העולם'}</AppText>
            <AppText style={styles.description}>{region?.description || 'המלצות, מסלולים ויעדים מכל העולם'}</AppText>
          </View>
        </View>
        <View style={styles.choicesRow}>
          <Pressable onPress={() => choose(null)} disabled={busy} testID="region-option-global" accessibilityRole="button" accessibilityLabel="כל העולם"
            accessibilityState={{ selected: !draftRegion, disabled: busy }} style={({ pressed }) => [styles.chip, styles.globalChip, !draftRegion && styles.selectedChip, pressed && styles.pressed]}>
            <Ionicons name="earth-outline" size={17} color={draftRegion ? '#FFFFFF' : '#172C43'} />
            <AppText weight="semiBold" style={[styles.chipText, !draftRegion && styles.selectedChipText]}>כל העולם</AppText>
          </Pressable>
          <ScrollView ref={choicesRef} horizontal style={styles.regionScroll} contentContainerStyle={styles.regionChoices} showsHorizontalScrollIndicator={false}>
            {REGIONS.map((item) => <Pressable key={item.id} disabled={busy} onPress={() => choose(item.id)}
              onLayout={({ nativeEvent }) => { choiceLayouts.current[item.id] = nativeEvent.layout.x; }}
              testID={'region-option-' + item.id} accessibilityRole="button" accessibilityLabel={item.label}
              accessibilityState={{ selected: item.id === draftRegion, disabled: busy }}
              style={({ pressed }) => [styles.chip, item.id === draftRegion && styles.selectedChip, pressed && styles.pressed]}>
              <AppText style={[styles.chipText, item.id === draftRegion && styles.selectedChipText]}>{item.label}</AppText>
            </Pressable>)}
          </ScrollView>
        </View>
      </ScrollView>
      <View style={styles.footer}>
        {saveError ? <AppText accessibilityRole="alert" style={styles.saveError} testID="atlas-save-error">הבחירה לא נשמרה. נסו שוב.</AppText> : null}
        <Pressable onPress={confirm} disabled={busy} testID="atlas-confirm" accessibilityRole="button"
          accessibilityLabel={'לגלות את ' + (region?.label || 'כל העולם')} accessibilityState={{ busy, disabled: busy }}
          style={({ pressed }) => [styles.confirm, pressed && styles.pressed, busy && styles.busy]}>
          {busy ? <ActivityIndicator color="#172C43" /> : <Ionicons name="arrow-back-outline" size={20} color="#172C43" />}
          <AppText weight="bold" style={styles.confirmText}>{busy ? 'שומרים את הבחירה…' : 'לגלות את ' + (region?.label || 'כל העולם')}</AppText>
        </Pressable>
      </View>
    </View>
  </View>;
}

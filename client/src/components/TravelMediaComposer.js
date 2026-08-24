import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import AppText from './AppText';
import CachedImage from './CachedImage';
import RtlHorizontalScrollView from './RtlHorizontalScrollView';
import RtlPagedFlatList from './RtlPagedFlatList';
import {
  boundCropTranslation,
  calculateCropRect,
  cropRectToViewportTransform,
  fitCropViewport,
} from '../utils/cropMath';
import { getImageSize } from '../hooks/useImagePicker';
import useTravelMediaSource from '../hooks/useTravelMediaSource';
import { colors, spacing } from '../styles';
import {
  createTravelMediaDescriptor,
  mergeTravelMediaSelection,
  travelMediaIdentity,
  travelMediaUri,
  updateTravelMediaCrop,
} from '../utils/travelMedia';

const ZERO_INSETS = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

function CropPage({ item, aspect, onCropChange }) {
  const uri = travelMediaUri(item);
  const [sourceSize, setSourceSize] = useState(() => item.width && item.height
    ? { width: item.width, height: item.height }
    : null);
  const [stageSize, setStageSize] = useState(null);
  const [viewport, setViewport] = useState(null);
  const zoom = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startZoom = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const displayWidth = useSharedValue(0);
  const displayHeight = useSharedValue(0);
  const viewportWidth = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const initialCropApplied = useRef(false);
  const ratio = (Number(aspect?.[0]) || 1) / (Number(aspect?.[1]) || 1);
  const canCrop = item.type !== 'remote' && Boolean(item.transform);

  useEffect(() => {
    let active = true;
    if (sourceSize || !uri) return () => { active = false; };
    getImageSize(uri).then((size) => {
      if (active) setSourceSize(size);
    }).catch(() => {});
    return () => { active = false; };
  }, [sourceSize, uri]);

  const fittedViewport = useMemo(() => fitCropViewport({
    containerWidth: stageSize?.width,
    containerHeight: stageSize?.height,
    aspectRatio: ratio,
  }), [ratio, stageSize]);
  const displaySize = useMemo(() => {
    if (!sourceSize || !viewport) return null;
    const scale = Math.max(viewport.width / sourceSize.width, viewport.height / sourceSize.height);
    return { width: sourceSize.width * scale, height: sourceSize.height * scale };
  }, [sourceSize, viewport]);

  useEffect(() => {
    displayWidth.value = displaySize?.width || 0;
    displayHeight.value = displaySize?.height || 0;
    viewportWidth.value = viewport?.width || 0;
    viewportHeight.value = viewport?.height || 0;
  }, [displayHeight, displaySize, displayWidth, viewport, viewportHeight, viewportWidth]);

  useEffect(() => {
    if (initialCropApplied.current || !sourceSize || !viewport || !canCrop) return;
    const initial = cropRectToViewportTransform({
      sourceWidth: sourceSize.width,
      sourceHeight: sourceSize.height,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      crop: item.transform?.crop,
    });
    zoom.value = initial.zoom;
    translateX.value = initial.translateX;
    translateY.value = initial.translateY;
    startZoom.value = initial.zoom;
    startX.value = initial.translateX;
    startY.value = initial.translateY;
    initialCropApplied.current = true;
  }, [
    canCrop, item.transform?.crop, sourceSize, startX, startY, startZoom, translateX,
    translateY, viewport, zoom,
  ]);

  const commitCrop = useCallback((nextZoom, nextX, nextY) => {
    if (!sourceSize || !viewport || !canCrop) return;
    onCropChange(calculateCropRect({
      sourceWidth: sourceSize.width,
      sourceHeight: sourceSize.height,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      zoom: nextZoom,
      translateX: nextX,
      translateY: nextY,
    }));
  }, [canCrop, onCropChange, sourceSize, viewport]);

  const pan = useMemo(() => Gesture.Pan()
    .enabled(canCrop)
    .minDistance(1)
    .onStart(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      const bounded = boundCropTranslation({
        displayWidth: displayWidth.value,
        displayHeight: displayHeight.value,
        viewportWidth: viewportWidth.value,
        viewportHeight: viewportHeight.value,
        zoom: zoom.value,
        translateX: startX.value + event.translationX,
        translateY: startY.value + event.translationY,
      });
      translateX.value = bounded.x;
      translateY.value = bounded.y;
    })
    .onEnd(() => runOnJS(commitCrop)(zoom.value, translateX.value, translateY.value)), [
      canCrop, commitCrop, displayHeight, displayWidth, startX, startY, translateX, translateY,
      viewportHeight, viewportWidth, zoom,
    ]);
  const pinch = useMemo(() => Gesture.Pinch()
    .enabled(canCrop)
    .onStart(() => { startZoom.value = zoom.value; })
    .onUpdate((event) => {
      const nextZoom = Math.max(1, Math.min(4, startZoom.value * event.scale));
      const bounded = boundCropTranslation({
        displayWidth: displayWidth.value,
        displayHeight: displayHeight.value,
        viewportWidth: viewportWidth.value,
        viewportHeight: viewportHeight.value,
        zoom: nextZoom,
        translateX: translateX.value,
        translateY: translateY.value,
      });
      zoom.value = nextZoom;
      translateX.value = bounded.x;
      translateY.value = bounded.y;
    })
    .onEnd(() => runOnJS(commitCrop)(zoom.value, translateX.value, translateY.value)), [
      canCrop, commitCrop, displayHeight, displayWidth, startZoom, translateX, translateY,
      viewportHeight, viewportWidth, zoom,
    ]);
  const gesture = useMemo(() => Gesture.Simultaneous(pan, pinch), [pan, pinch]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: zoom.value },
    ],
  }));

  if (!canCrop) {
    return (
      <View style={styles.uncroppedPage} testID="travel-media-existing-preview">
        <CachedImage source={{ uri }} style={styles.uncroppedImage} contentFit="contain" />
        <AppText style={styles.existingHint}>תמונה שכבר פורסמה נשארת ללא שינוי</AppText>
      </View>
    );
  }

  return (
    <View
      style={styles.cropStage}
      onLayout={(event) => setStageSize({
        width: Math.max(0, event.nativeEvent.layout.width - (spacing.lg * 2)),
        height: Math.max(0, event.nativeEvent.layout.height - (spacing.sm * 2)),
      })}
      testID="travel-media-crop-stage"
    >
      {fittedViewport ? (
        <View
          style={[styles.cropViewport, fittedViewport]}
          onLayout={(event) => setViewport(event.nativeEvent.layout)}
          testID="travel-media-crop-viewport"
        >
          {displaySize && uri ? (
            <GestureDetector gesture={gesture}>
              <Animated.View style={styles.gestureSurface} collapsable={false}>
                <Animated.View style={[
                  styles.cropImageWrap,
                  {
                    width: displaySize.width,
                    height: displaySize.height,
                    left: (viewport.width - displaySize.width) / 2,
                    top: (viewport.height - displaySize.height) / 2,
                  },
                  animatedStyle,
                ]}>
                  <CachedImage source={{ uri }} style={styles.cropImage} contentFit="fill" />
                </Animated.View>
              </Animated.View>
            </GestureDetector>
          ) : <ActivityIndicator size="large" color={colors.white} />}
        </View>
      ) : null}
    </View>
  );
}

function SelectionBadge({ number }) {
  if (!number) return null;
  return <View style={styles.badge}><AppText style={styles.badgeText}>{number}</AppText></View>;
}

export default function TravelMediaComposer({
  visible,
  value = [],
  maxItems = 5,
  aspect = [1, 1],
  maxLongEdge = 1600,
  compress = 0.94,
  onChange,
  onCancel,
  contained = false,
  sourceAdapter: suppliedSourceAdapter,
  sourceAdapters,
}) {
  const defaultSourceAdapter = useTravelMediaSource({ maxItems });
  const { width: windowWidth } = useWindowDimensions();
  const sourceAdapter = suppliedSourceAdapter || sourceAdapters?.[Platform.OS] || defaultSourceAdapter;
  const insets = useContext(SafeAreaInsetsContext) || ZERO_INSETS;
  const [working, setWorking] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewWidth, setPreviewWidth] = useState(windowWidth);
  const [composerError, setComposerError] = useState('');
  const [composerSession, setComposerSession] = useState(0);
  const scrollRef = useRef(null);
  const onPreviewItemsChanged = useRef(({ viewableItems }) => {
    const nextIndex = viewableItems.find((item) => item.isViewable)?.index;
    if (Number.isInteger(nextIndex)) setActiveIndex(nextIndex);
  }).current;
  const previewViewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const options = useMemo(() => ({ aspect, maxItems, maxLongEdge, compress }), [
    aspect, compress, maxItems, maxLongEdge,
  ]);

  useEffect(() => {
    if (!visible) return;
    setWorking(mergeTravelMediaSelection([], value, options));
    setActiveIndex(0);
    setComposerError('');
    setComposerSession((current) => current + 1);
    sourceAdapter.kind === 'inline-library' && sourceAdapter.loadInitial().catch(() => {});
  }, [visible]); // The draft is intentionally captured only when the composer opens.

  useEffect(() => {
    if (!visible || !working.length || !previewWidth) return;
    const frame = requestAnimationFrame(() => scrollRef.current?.scrollToIndex?.({
      index: Math.min(activeIndex, working.length - 1),
      animated: false,
    }));
    return () => cancelAnimationFrame(frame);
  }, [activeIndex, previewWidth, visible, working.length]);

  const materializeSelection = useCallback(async (descriptor) => {
    if (descriptor.persistence === 'ready' || descriptor.type === 'remote') return descriptor;
    setWorking((current) => current.map((item) => travelMediaIdentity(item) === travelMediaIdentity(descriptor)
      ? { ...item, persistence: 'materializing' }
      : item));
    try {
      const materialized = await sourceAdapter.materialize(descriptor);
      const normalized = createTravelMediaDescriptor(materialized, { ...options, newSource: true });
      setWorking((current) => current.map((item) => travelMediaIdentity(item) === travelMediaIdentity(descriptor)
        ? normalized
        : item));
      return normalized;
    } catch (error) {
      setWorking((current) => current.map((item) => travelMediaIdentity(item) === travelMediaIdentity(descriptor)
        ? { ...item, persistence: 'failed' }
        : item));
      setComposerError('לא הצלחנו להוריד את התמונה. אפשר לנסות שוב או לבחור תמונה אחרת.');
      throw error;
    }
  }, [options, sourceAdapter]);

  const addDescriptors = useCallback((additions) => {
    const next = mergeTravelMediaSelection(working, additions, { ...options, newSource: true });
    const currentIds = new Set(working.map(travelMediaIdentity));
    const added = next.filter((item) => !currentIds.has(travelMediaIdentity(item)));
    setWorking(next);
    setComposerError('');
    Promise.resolve().then(() => added.forEach((item) => materializeSelection(item).catch(() => {})));
  }, [materializeSelection, options, working]);

  const toggleAsset = useCallback((asset) => {
    const identity = travelMediaIdentity(asset);
    const existingIndex = working.findIndex((item) => travelMediaIdentity(item) === identity);
    if (existingIndex >= 0) {
      setWorking((current) => current.filter((item) => travelMediaIdentity(item) !== identity));
      setActiveIndex((current) => Math.max(0, Math.min(current, working.length - 2)));
      return;
    }
    if (working.length >= maxItems) {
      setComposerError(`אפשר לבחור עד ${maxItems} תמונות.`);
      return;
    }
    addDescriptors([asset]);
    setActiveIndex(working.length);
  }, [addDescriptors, maxItems, working]);

  const pickMore = useCallback(async () => {
    if (working.length >= maxItems) return;
    try {
      const additions = await sourceAdapter.pickMore(maxItems - working.length);
      addDescriptors(additions);
    } catch {
      setComposerError('לא הצלחנו לפתוח את בחירת התמונות. אפשר לנסות שוב.');
    }
  }, [addDescriptors, maxItems, sourceAdapter, working.length]);

  const updateCrop = useCallback((identity, crop) => {
    setWorking((current) => current.map((item) => travelMediaIdentity(item) === identity
      ? updateTravelMediaCrop(item, crop)
      : item));
  }, []);

  const retryFailed = useCallback(() => {
    setComposerError('');
    working.filter((item) => item.persistence === 'failed')
      .forEach((item) => materializeSelection(item).catch(() => {}));
  }, [materializeSelection, working]);

  const pending = working.some((item) => item.persistence === 'materializing');
  const failed = working.some((item) => item.persistence === 'failed');
  const gridItems = sourceAdapter.kind === 'inline-library' ? sourceAdapter.assets : working;
  const content = (
    <GestureHandlerRootView style={styles.screen}>
      <View style={[styles.screen, {
        paddingTop: Math.max(insets.top, spacing.sm),
        paddingBottom: Math.max(insets.bottom, spacing.sm),
      }]} testID="travel-media-composer">
        <View style={styles.header}>
          <Pressable onPress={onCancel} style={styles.headerSecondary} testID="travel-media-cancel">
            <AppText style={styles.headerSecondaryText}>ביטול</AppText>
          </Pressable>
          <View style={styles.headerCopy}>
            <AppText style={styles.title}>בחירת תמונות</AppText>
            <AppText style={styles.counter}>{working.length}/{maxItems}</AppText>
          </View>
          <Pressable
            onPress={() => onChange?.(working)}
            disabled={pending || failed}
            style={[styles.doneButton, (pending || failed) && styles.disabled]}
            testID="travel-media-done"
          >
            <AppText style={styles.doneText}>סיום</AppText>
          </Pressable>
        </View>

        <View style={styles.previewWrap} onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          if (width) setPreviewWidth(width);
        }}>
          {working.length ? (
            <RtlPagedFlatList
              ref={scrollRef}
              data={working}
              extraData={working}
              keyExtractor={(item) => `${composerSession}:${travelMediaIdentity(item)}`}
              getItemLayout={(_, index) => ({ length: previewWidth, offset: previewWidth * index, index })}
              onViewableItemsChanged={onPreviewItemsChanged}
              viewabilityConfig={previewViewabilityConfig}
              renderItem={({ item }) => (
                <View style={[styles.previewPage, { width: previewWidth || windowWidth }]}>
                  <CropPage
                    item={item}
                    aspect={aspect}
                    onCropChange={(crop) => updateCrop(travelMediaIdentity(item), crop)}
                  />
                </View>
              )}
              testID="travel-media-preview-carousel"
            />
          ) : (
            <View style={styles.emptyPreview}>
              <Ionicons name="images-outline" size={38} color={colors.textMuted} />
              <AppText style={styles.emptyText}>בחרו תמונות מהגלריה</AppText>
            </View>
          )}
          {working.length ? <AppText style={styles.cropHint}>
            {working[activeIndex]?.transform ? 'אפשר לצבוט ולהזיז כדי לשנות את החיתוך' : 'התמונה תישאר ללא שינוי'}
          </AppText> : null}
        </View>

        <View style={styles.libraryHeader}>
          <AppText style={styles.libraryTitle}>
            {sourceAdapter.kind === 'inline-library' ? 'גלריה' : 'התמונות שנבחרו'}
          </AppText>
          {sourceAdapter.kind !== 'inline-library' && working.length < maxItems ? (
            <Pressable style={styles.addButton} onPress={pickMore} testID="travel-media-pick-more">
              <Ionicons name="add" size={18} color={colors.white} />
              <AppText style={styles.addButtonText}>בחירת תמונות</AppText>
            </Pressable>
          ) : null}
        </View>

        {sourceAdapter.kind === 'inline-library' && sourceAdapter.albums?.length ? (
          <RtlHorizontalScrollView style={styles.albums} contentContainerStyle={styles.albumsContent}>
            <Pressable style={[styles.albumChip, !sourceAdapter.selectedAlbum && styles.albumChipSelected]} onPress={() => sourceAdapter.chooseAlbum(null).catch(() => {})}>
              <AppText style={styles.albumChipText}>אחרונות</AppText>
            </Pressable>
            {sourceAdapter.albums.map((album) => (
              <Pressable key={album.id} style={[styles.albumChip, sourceAdapter.selectedAlbum?.id === album.id && styles.albumChipSelected]} onPress={() => sourceAdapter.chooseAlbum(album).catch(() => {})}>
                <AppText style={styles.albumChipText}>{album.title}</AppText>
              </Pressable>
            ))}
          </RtlHorizontalScrollView>
        ) : null}

        {sourceAdapter.permission?.accessPrivileges === 'limited' ? (
          <Pressable style={styles.limitedButton} onPress={() => sourceAdapter.requestMoreAccess().catch(() => {})}>
            <AppText style={styles.limitedText}>בחירת תמונות נוספות מהספרייה</AppText>
          </Pressable>
        ) : null}

        {(composerError || sourceAdapter.error) ? (
          <View style={styles.errorRow} testID="travel-media-error">
            <AppText style={styles.errorText}>{composerError || sourceAdapter.error}</AppText>
            {failed ? <Pressable onPress={retryFailed}><AppText style={styles.retryText}>ניסיון נוסף</AppText></Pressable> : null}
          </View>
        ) : null}

        <FlatList
          data={gridItems}
          extraData={working}
          keyExtractor={travelMediaIdentity}
          numColumns={3}
          initialNumToRender={18}
          maxToRenderPerBatch={18}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== 'web'}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          onEndReached={sourceAdapter.kind === 'inline-library'
            ? () => sourceAdapter.loadMore().catch(() => {})
            : undefined}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => {
            const identity = travelMediaIdentity(item);
            const selectedIndex = working.findIndex((selected) => travelMediaIdentity(selected) === identity);
            return (
              <Pressable style={styles.gridTile} onPress={() => toggleAsset(item)} testID={`travel-media-item-${identity}`}>
                <CachedImage source={{ uri: travelMediaUri(item) }} style={styles.gridImage} contentFit="cover" />
                <SelectionBadge number={selectedIndex >= 0 ? selectedIndex + 1 : 0} />
                {item.persistence === 'materializing' ? <View style={styles.tileLoading}><ActivityIndicator color={colors.white} /></View> : null}
                {item.persistence === 'failed' ? <View style={styles.tileLoading}><Ionicons name="alert-circle" size={24} color={colors.white} /></View> : null}
              </Pressable>
            );
          }}
          ListFooterComponent={sourceAdapter.loading
            ? <ActivityIndicator style={styles.gridLoader} color={colors.primary} />
            : null}
          testID="travel-media-grid"
        />
      </View>
    </GestureHandlerRootView>
  );

  if (contained) {
    if (!visible) return null;
    return <View style={styles.contained}>{content}</View>;
  }
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onCancel}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  contained: { ...StyleSheet.absoluteFillObject, zIndex: 120, backgroundColor: colors.background },
  header: { height: 58, paddingHorizontal: spacing.lg, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.white },
  headerCopy: { alignItems: 'center' },
  title: { fontSize: 17, color: colors.textPrimary },
  counter: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  headerSecondary: { minWidth: 62, alignItems: 'center', paddingVertical: spacing.sm },
  headerSecondaryText: { color: colors.textSecondary },
  doneButton: { minWidth: 62, borderRadius: spacing.radiusSmall, backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'center' },
  doneText: { color: colors.white },
  disabled: { opacity: 0.45 },
  previewWrap: { height: 330, backgroundColor: '#101317' },
  previewPage: { height: 292 },
  cropStage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cropViewport: { overflow: 'hidden', backgroundColor: '#090B0E' },
  gestureSurface: { flex: 1 },
  cropImageWrap: { position: 'absolute' },
  cropImage: { width: '100%', height: '100%' },
  uncroppedPage: { height: 292, alignItems: 'center', justifyContent: 'center' },
  uncroppedImage: { width: '100%', height: 250 },
  existingHint: { position: 'absolute', bottom: spacing.sm, color: colors.white, fontSize: 12 },
  emptyPreview: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyText: { color: colors.textMuted },
  cropHint: { position: 'absolute', bottom: spacing.sm, alignSelf: 'center', color: colors.white, fontSize: 12, textAlign: 'center' },
  libraryHeader: { minHeight: 52, paddingHorizontal: spacing.lg, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white },
  libraryTitle: { fontSize: 16, color: colors.textPrimary },
  addButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.primary, borderRadius: spacing.radiusSmall, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  addButtonText: { color: colors.white, fontSize: 13 },
  albums: { flexGrow: 0, backgroundColor: colors.white },
  albumsContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  albumChip: { marginHorizontal: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: spacing.radiusFull, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  albumChipSelected: { borderColor: colors.primary, backgroundColor: colors.accentLight },
  albumChipText: { color: colors.textPrimary, fontSize: 13 },
  limitedButton: { backgroundColor: colors.infoLight, paddingVertical: spacing.sm, alignItems: 'center' },
  limitedText: { color: colors.info, fontSize: 13 },
  errorRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.errorLight, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  errorText: { flex: 1, color: colors.error, textAlign: 'right', fontSize: 13 },
  retryText: { color: colors.primary, marginRight: spacing.md },
  grid: { padding: 1, paddingBottom: spacing.xxl },
  gridRow: { flexDirection: 'row-reverse' },
  gridTile: { flex: 1 / 3, maxWidth: '33.333%', aspectRatio: 1, padding: 1 },
  gridImage: { width: '100%', height: '100%', backgroundColor: colors.borderLight },
  badge: { position: 'absolute', top: spacing.xs, right: spacing.xs, width: 25, height: 25, borderRadius: 13, backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.white, fontSize: 12 },
  tileLoading: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  gridLoader: { marginVertical: spacing.lg },
});

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import AppText from './AppText';
import CachedImage from './CachedImage';
import RtlPagedFlatList from './RtlPagedFlatList';
import { useBoundedImageWindow } from '../hooks/useBoundedImageWindow';
import { getMediaPlaceholder, getMediaSrcSet } from '../utils/mediaAssets';
import { colors, mediaGalleryModalStyles as styles } from '../styles';

export default function MediaGalleryModal({ visible, items = [], initialIndex = 0, onClose }) {
  const [{ width, height }, setViewport] = useState({ width: 0, height: 0 });
  const listRef = useRef(null);
  const normalized = useMemo(() => items.filter((item) => item?.url), [items]);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const window = useBoundedImageWindow(activeIndex, normalized.length);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const first = viewableItems?.[0]?.index;
    if (typeof first === 'number') {
      activeIndexRef.current = first;
      setActiveIndex(first);
    }
  }).current;

  useEffect(() => {
    if (!visible || !normalized.length) return;
    const next = Math.max(0, Math.min(initialIndex, normalized.length - 1));
    activeIndexRef.current = next;
    setActiveIndex(next);
    const frame = requestAnimationFrame(() => listRef.current?.scrollToIndex?.({ index: next, animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [initialIndex, normalized.length, visible]);

  useEffect(() => {
    if (!visible || !normalized.length || !width || !height) return undefined;
    const frame = requestAnimationFrame(() => listRef.current?.scrollToIndex?.({ index: activeIndexRef.current, animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [width, height, visible]);

  const goTo = (index) => {
    const next = Math.max(0, Math.min(index, normalized.length - 1));
    activeIndexRef.current = next;
    listRef.current?.scrollToIndex?.({ index: next, animated: true });
    setActiveIndex(next);
  };

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      {/* Native modals need a provider in their own native view hierarchy. */}
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen} testID="media-gallery-modal">
          <View style={styles.header}>
            <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="סגירת גלריה">
              <Ionicons name="close" size={25} color={colors.white} />
            </Pressable>
            <AppText style={styles.counter}>{normalized.length ? `${activeIndex + 1} / ${normalized.length}` : ''}</AppText>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.viewport} testID="media-gallery-viewport" onLayout={({ nativeEvent: { layout } }) => {
            setViewport((current) => current.width === layout.width && current.height === layout.height
              ? current : { width: layout.width, height: layout.height });
          }}>
            {width > 0 && height > 0 ? <RtlPagedFlatList
              ref={listRef}
              data={normalized}
              keyExtractor={(item, index) => item.id || `${item.url}:${index}`}
              getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              initialNumToRender={1}
              maxToRenderPerBatch={1}
              windowSize={3}
              renderItem={({ item, index }) => (
                <View style={[styles.page, { width, height }]}>
                  {window.indices.includes(index) ? (
                    <CachedImage
                      source={{ uri: item.url }}
                      placeholder={getMediaPlaceholder(item.media)}
                      srcSet={getMediaSrcSet(item.media)}
                      sizes="100vw"
                      style={styles.image}
                      contentFit="contain"
                      priority={index === activeIndex ? 'high' : 'low'}
                    />
                  ) : null}
                  {!!item.caption && <AppText style={styles.caption}>{item.caption}</AppText>}
                </View>
              )}
            /> : null}
          </View>

          {Platform.OS === 'web' && normalized.length > 1 ? (
            <View style={styles.webNavigation} pointerEvents="box-none">
              <Pressable
                style={[styles.navButton, activeIndex === normalized.length - 1 && styles.navButtonDisabled]}
                onPress={() => goTo(activeIndex + 1)}
                disabled={activeIndex === normalized.length - 1}
                accessibilityLabel="תמונה הבאה"
              >
                <Ionicons name="chevron-back" size={28} color={colors.white} />
              </Pressable>
              <Pressable
                style={[styles.navButton, activeIndex === 0 && styles.navButtonDisabled]}
                onPress={() => goTo(activeIndex - 1)}
                disabled={activeIndex === 0}
                accessibilityLabel="תמונה קודמת"
              >
                <Ionicons name="chevron-forward" size={28} color={colors.white} />
              </Pressable>
            </View>
          ) : null}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, SafeAreaView, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from './AppText';
import CachedImage from './CachedImage';
import { useBoundedImageWindow } from '../hooks/useBoundedImageWindow';
import { getMediaPlaceholder, getMediaSrcSet } from '../utils/mediaAssets';
import { colors, mediaGalleryModalStyles as styles } from '../styles';

export default function MediaGalleryModal({ visible, items = [], initialIndex = 0, onClose }) {
  const { width, height } = useWindowDimensions();
  const listRef = useRef(null);
  const normalized = useMemo(() => items.filter((item) => item?.url), [items]);
  const [activeIndex, setActiveIndex] = useState(0);
  const window = useBoundedImageWindow(activeIndex, normalized.length);

  useEffect(() => {
    if (!visible || !normalized.length) return;
    const next = Math.max(0, Math.min(initialIndex, normalized.length - 1));
    setActiveIndex(next);
    requestAnimationFrame(() => listRef.current?.scrollToIndex?.({ index: next, animated: false }));
  }, [initialIndex, normalized.length, visible]);

  const goTo = (index) => {
    const next = Math.max(0, Math.min(index, normalized.length - 1));
    listRef.current?.scrollToIndex?.({ index: next, animated: true });
    setActiveIndex(next);
  };

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen} testID="media-gallery-modal">
        <View style={styles.header}>
          <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="סגירת גלריה">
            <Ionicons name="close" size={25} color={colors.white} />
          </Pressable>
          <AppText style={styles.counter}>{normalized.length ? `${activeIndex + 1} / ${normalized.length}` : ''}</AppText>
          <View style={styles.headerSpacer} />
        </View>

        <FlatList
          ref={listRef}
          data={normalized}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item, index) => item.id || `${item.url}:${index}`}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          onMomentumScrollEnd={(event) => setActiveIndex(Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width)))}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          windowSize={3}
          renderItem={({ item, index }) => (
            <View style={[styles.page, { width, height: Math.max(300, height - 110) }]}>
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
        />

        {Platform.OS === 'web' && normalized.length > 1 ? (
          <View style={styles.webNavigation} pointerEvents="box-none">
            <Pressable
              style={[styles.navButton, activeIndex === 0 && styles.navButtonDisabled]}
              onPress={() => goTo(activeIndex - 1)}
              disabled={activeIndex === 0}
              accessibilityLabel="תמונה קודמת"
            >
              <Ionicons name="chevron-back" size={28} color={colors.white} />
            </Pressable>
            <Pressable
              style={[styles.navButton, activeIndex === normalized.length - 1 && styles.navButtonDisabled]}
              onPress={() => goTo(activeIndex + 1)}
              disabled={activeIndex === normalized.length - 1}
              accessibilityLabel="תמונה הבאה"
            >
              <Ionicons name="chevron-forward" size={28} color={colors.white} />
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

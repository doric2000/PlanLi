import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, TouchableOpacity, Platform, useWindowDimensions, Pressable } from 'react-native';
import AppText from "./AppText";
import { Ionicons } from '@expo/vector-icons';
import { colors, imagePickerBoxStyles as styles } from '../styles';
import CachedImage from './CachedImage';
import RtlPagedFlatList from './RtlPagedFlatList';
import { useBoundedImageWindow } from '../hooks/useBoundedImageWindow';

export const imagePickerFrameStyle = ({ height = 200, previewAspectRatio } = {}) => (
  Number(previewAspectRatio) > 0
    ? { height: undefined, aspectRatio: Number(previewAspectRatio) }
    : { height }
);

/**
 * Reusable image picker box component.
 * - Empty: shows placeholder, press to pick.
 * - Single: shows image preview + edit button.
 * - Multi: swipeable carousel + dots + count badge + edit button.
 * - Web: uses <img> for more reliable rendering.
 */
export const ImagePickerBox = ({
  imageUri,
  imageUris,
  onPress,
  placeholderText = 'Tap to add photo',
  iconName = 'camera',
  iconSize = 40,
  iconColor = colors.primary,
  height = 200,
  previewAspectRatio,
  style,
  imageStyle,
  imageFit = 'cover',
  disabled = false,
  loading = false,
  testID,
  onRemove,
  maxImages = 5,
}) => {
  const { width: windowWidth } = useWindowDimensions();

  const images = useMemo(() => {
    if (Array.isArray(imageUris) && imageUris.length) return imageUris.filter(Boolean);
    return imageUri ? [imageUri].filter(Boolean) : [];
  }, [imageUri, imageUris]);

  const count = images.length;
  const [containerWidth, setContainerWidth] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const { currentIndex, indices: loadedIndices } = useBoundedImageWindow(
    activeIndex,
    count
  );
  const listRef = useRef(null);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const first = viewableItems?.[0]?.index;
    if (typeof first === 'number') setActiveIndex(first);
  }).current;

  const pageWidth = containerWidth || windowWidth || 0;
  const canSwipe = count > 1;
  const frameStyle = imagePickerFrameStyle({ height, previewAspectRatio });

  useEffect(() => {
    setActiveIndex((current) => Math.max(0, Math.min(current, Math.max(0, count - 1))));
  }, [count]);

  const scrollToIndex = (nextIndex) => {
    if (!count) return;
    const clamped = Math.max(0, Math.min(nextIndex, count - 1));
    try {
      listRef.current?.scrollToIndex?.({ index: clamped, animated: true });
      setActiveIndex(clamped);
    } catch {
      // ignore
    }
  };

  return (
    <View
      style={[styles.container, frameStyle, style]}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {loading ? (
        <View style={styles.placeholder}>
          <Ionicons name="cloud-upload-outline" size={iconSize} color={iconColor} />
          <AppText style={styles.placeholderText}>{placeholderText || 'מעלה תמונה...'}</AppText>
        </View>
      ) : count === 0 ? (
        <TouchableOpacity
          style={styles.placeholder}
          onPress={onPress}
          disabled={disabled}
          activeOpacity={0.7}
          testID={testID}
        >
          <Ionicons name={iconName} size={iconSize} color={iconColor} />
          <AppText style={styles.placeholderText}>{placeholderText}</AppText>
        </TouchableOpacity>
      ) : (
        <View
          style={[
            styles.carouselWrap,
            imageFit === 'contain' ? styles.carouselWrapContain : null,
          ]}
        >
          <RtlPagedFlatList
            ref={listRef}
            data={images}
            extraData={currentIndex}
            keyExtractor={(uri, index) => `${index}:${uri}`}
            scrollEnabled={canSwipe}
            renderItem={({ item: uri, index }) => (
              <View style={{ width: pageWidth || '100%', height: '100%' }}>
                {loadedIndices.includes(index) ? (
                  <CachedImage
                    source={{ uri }}
                    style={[
                      styles.image,
                      imageStyle,
                      {
                        width: pageWidth || '100%',
                        backgroundColor:
                          imageFit === 'contain' ? '#000000' : '#F3F4F6',
                      },
                    ]}
                    contentFit={imageFit}
                    priority={index === currentIndex ? 'normal' : 'low'}
                    recyclingKey={`${index}:${uri}`}
                  />
                ) : (
                  <View
                    style={[
                      styles.image,
                      imageStyle,
                      {
                        width: pageWidth || '100%',
                        backgroundColor:
                          imageFit === 'contain' ? '#000000' : '#F3F4F6',
                      },
                    ]}
                  />
                )}
              </View>
            )}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            getItemLayout={(_, index) => {
              const w = pageWidth || 0;
              return { length: w, offset: w * index, index };
            }}
            initialNumToRender={1}
            maxToRenderPerBatch={1}
            windowSize={3}
          />

          {Platform.OS === 'web' && count > 1 ? (
            <View style={styles.navOverlay} pointerEvents="box-none">
              <Pressable
                style={styles.navZoneLeft}
                onPress={() => scrollToIndex(activeIndex + 1)}
              >
                {activeIndex < count - 1 ? (
                  <View style={styles.navBtn}>
                    <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                  </View>
                ) : null}
              </Pressable>
              <Pressable
                style={styles.navZoneRight}
                onPress={() => scrollToIndex(activeIndex - 1)}
              >
                {activeIndex > 0 ? (
                  <View style={styles.navBtn}>
                    <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
                  </View>
                ) : null}
              </Pressable>
            </View>
          ) : null}

          {count > 1 ? (
            <View style={styles.dots} pointerEvents="none">
              {images.map((_, i) => (
                <View
                  key={`dot:${i}`}
                  style={[styles.dot, i === activeIndex && styles.dotActive]}
                />
              ))}
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.editBtn}
            onPress={onPress}
            disabled={disabled}
            activeOpacity={0.8}
            testID={testID}
          >
            <Ionicons name={iconName} size={18} color="#FFFFFF" />
          </TouchableOpacity>

          {typeof onRemove === 'function' ? (
            <TouchableOpacity
              style={styles.removeOverlayBtn}
              onPress={() => onRemove(activeIndex)}
              disabled={disabled}
              activeOpacity={0.8}
              accessibilityLabel="הסר תמונה"
              testID={testID ? `${testID}-remove` : undefined}
            >
              <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}

          {count > 1 || maxImages > 1 ? (
            <View style={styles.countBadge} pointerEvents="none">
              <AppText style={styles.countText}>{count}/{maxImages}</AppText>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
};



export default ImagePickerBox;

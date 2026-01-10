import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Platform,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../styles';

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
  style,
  imageStyle,
  imageFit = 'cover',
  disabled = false,
}) => {
  const { width: windowWidth } = useWindowDimensions();

  const images = useMemo(() => {
    if (Array.isArray(imageUris) && imageUris.length) return imageUris.filter(Boolean);
    return imageUri ? [imageUri].filter(Boolean) : [];
  }, [imageUri, imageUris]);

  const count = images.length;
  const [containerWidth, setContainerWidth] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef(null);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const first = viewableItems?.[0]?.index;
    if (typeof first === 'number') setActiveIndex(first);
  }).current;

  const pageWidth = containerWidth || windowWidth || 0;
  const canSwipe = count > 1;

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

  const renderWebImg = (uri) => (
    <img
      src={uri}
      alt=""
      style={{
        width: pageWidth || '100%',
        height: '100%',
        objectFit: imageFit,
        display: 'block',
        backgroundColor: imageFit === 'contain' ? '#000000' : '#F3F4F6',
      }}
    />
  );

  return (
    <View
      style={[styles.container, { height }, style]}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {count === 0 ? (
        <TouchableOpacity
          style={styles.placeholder}
          onPress={onPress}
          disabled={disabled}
          activeOpacity={0.7}
        >
          <Ionicons name={iconName} size={iconSize} color={iconColor} />
          <Text style={styles.placeholderText}>{placeholderText}</Text>
        </TouchableOpacity>
      ) : (
        <View
          style={[
            styles.carouselWrap,
            imageFit === 'contain' ? styles.carouselWrapContain : null,
          ]}
        >
          <FlatList
            ref={listRef}
            data={images}
            keyExtractor={(uri, index) => `${index}:${uri}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEnabled={canSwipe}
            renderItem={({ item: uri }) => (
              <View style={{ width: pageWidth || '100%', height: '100%' }}>
                {Platform.OS === 'web' ? (
                  renderWebImg(uri)
                ) : (
                  <Image
                    source={{ uri }}
                    style={[styles.image, imageStyle, { width: pageWidth || '100%' }]}
                    resizeMode={imageFit}
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
          />

          {Platform.OS === 'web' && count > 1 ? (
            <View style={styles.navOverlay} pointerEvents="box-none">
              <Pressable
                style={styles.navZoneLeft}
                onPress={() => scrollToIndex(activeIndex - 1)}
              >
                {activeIndex > 0 ? (
                  <View style={styles.navBtn}>
                    <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                  </View>
                ) : null}
              </Pressable>
              <Pressable
                style={styles.navZoneRight}
                onPress={() => scrollToIndex(activeIndex + 1)}
              >
                {activeIndex < count - 1 ? (
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
          >
            <Ionicons name={iconName} size={18} color="#FFFFFF" />
          </TouchableOpacity>

          {count > 1 ? (
            <View style={styles.countBadge} pointerEvents="none">
              <Text style={styles.countText}>{count}/5</Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.cardBackground || '#FFFFFF',
  },
  carouselWrap: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F3F4F6',
  },
  carouselWrapContain: {
    backgroundColor: '#000000',
  },
  image: {
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    marginTop: 10,
    fontSize: 14,
    color: colors.textSecondary || '#6B7280',
  },
  editBtn: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  dotActive: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  countBadge: {
    position: 'absolute',
    right: 10,
    top: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  navOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  navZoneLeft: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 8,
  },
  navZoneRight: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 8,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ImagePickerBox;

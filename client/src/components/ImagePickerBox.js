import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Image, TouchableOpacity, FlatList, Platform, useWindowDimensions, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, imagePickerBoxStyles as styles } from '../styles';

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
  loading = false,
  testID,
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
      {loading ? (
        <View style={styles.placeholder}>
          <Ionicons name="cloud-upload-outline" size={iconSize} color={iconColor} />
          <Text style={styles.placeholderText}>{placeholderText || 'מעלה תמונה...'}</Text>
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
            testID={testID}
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



export default ImagePickerBox;

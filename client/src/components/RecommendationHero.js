import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, FlatList, Platform, useWindowDimensions, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useBoundedImageWindow } from '../hooks/useBoundedImageWindow';
import { BackButton } from './BackButton';
import CachedImage, { prefetchImage } from './CachedImage';
import FavoriteButton from './FavoriteButton';
import { common, cards } from '../styles';
import { getTravelCategoryPresentation } from '../constants/travelPresentation';
import {
  getMediaPlaceholder,
  getMediaSrcSet,
  getRecommendationImageUrls,
} from '../utils/mediaAssets';

export const RecommendationHero = ({
  item,
  snapshotData,
  favoriteType = 'recommendations',
  imageUrls,
  emptyIcon,
  onImagePress,
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const images = useMemo(
    () => Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : getRecommendationImageUrls(item, 'large'),
    [imageUrls, item]
  );
  const hasImage = images.length > 0;
  const categoryPresentation = useMemo(
    () => getTravelCategoryPresentation(item?.categoryId, item?.category),
    [item?.category, item?.categoryId]
  );
  const [heroWidth, setHeroWidth] = useState(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const heroRef = useRef(null);
  const imageWindow = useBoundedImageWindow(activeImageIndex, images.length);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const first = viewableItems?.[0]?.index;
    if (typeof first === 'number') setActiveImageIndex(first);
  }).current;

  useEffect(() => {
    prefetchImage(
      imageWindow.indices
        .filter((index) => index !== imageWindow.currentIndex)
        .map((index) => images[index])
        .filter(Boolean)
    ).catch(() => {});
  }, [imageWindow.currentIndex, imageWindow.indices, images]);

  const scrollToImageIndex = (nextIndex) => {
    if (!images.length) return;
    const clamped = Math.max(0, Math.min(nextIndex, images.length - 1));
    try {
      heroRef.current?.scrollToIndex?.({ index: clamped, animated: true });
      setActiveImageIndex(clamped);
    } catch {
      // ignore
    }
  };

  if (!hasImage) {
    return (
      <View style={styles.noImageHeader}>
        <View style={styles.noImagePresentation} pointerEvents="none">
          <View style={styles.noImageIcon}>
            <MaterialIcons name={emptyIcon || categoryPresentation.icon} size={36} color="#64748B" />
          </View>
        </View>
        <View style={styles.rtlActionsRow} testID="recommendation-hero-actions">
          <BackButton color="dark" variant="solid" iconDirection="rtl" />
          <FavoriteButton type={favoriteType} id={item.id} variant="dark" snapshotData={snapshotData} />
        </View>
      </View>
    );
  }

  return (
    <View style={[common.heroContainer, styles.heroFrame]} onLayout={(e) => setHeroWidth(e.nativeEvent.layout.width)}>
      <FlatList
        ref={heroRef}
        data={images}
        extraData={imageWindow.currentIndex}
        keyExtractor={(uri, index) => `${item.id || 'hero'}:${index}:${uri}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={images.length > 1}
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        windowSize={3}
        getItemLayout={(_, index) => {
          const pageWidth = heroWidth || windowWidth || 0;
          return { length: pageWidth, offset: pageWidth * index, index };
        }}
        renderItem={({ item: uri, index }) => {
          const pageWidth = (heroWidth || windowWidth) || '100%';
          if (index !== imageWindow.currentIndex) {
            return <View style={[common.heroImage, { width: pageWidth }]} />;
          }

          const pageStyle = Platform.OS === 'web'
            ? { width: pageWidth, height: '100%', backgroundColor: '#F3F4F6' }
            : [common.heroImage, { width: pageWidth }];
          return (
            <Pressable
              style={pageStyle}
              onPress={() => onImagePress?.(index)}
              disabled={!onImagePress}
              accessibilityRole={onImagePress ? 'button' : undefined}
              accessibilityLabel={onImagePress ? `פתיחת תמונה ${index + 1} במסך מלא` : undefined}
              testID={`recommendation-hero-image-${index}`}
            >
              <CachedImage
                source={{ uri }}
                placeholder={getMediaPlaceholder(item?.media?.[index])}
                srcSet={getMediaSrcSet(item?.media?.[index])}
                sizes="100vw"
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                priority={index === imageWindow.currentIndex ? 'high' : 'low'}
              />
            </Pressable>
          );
        }}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      {Platform.OS === 'web' && images.length > 1 && (
        <View style={cards.recNavOverlay} pointerEvents="box-none">
          <View style={cards.recNavOverlayRow} pointerEvents="box-none">
            <View style={cards.recNavZoneLeft} pointerEvents="box-none">
              {activeImageIndex > 0 && (
                <Pressable style={cards.recNavButton} onPress={() => scrollToImageIndex(activeImageIndex - 1)}>
                  <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                </Pressable>
              )}
            </View>
            <View style={cards.recNavZoneRight} pointerEvents="box-none">
              {activeImageIndex < images.length - 1 && (
                <Pressable style={cards.recNavButton} onPress={() => scrollToImageIndex(activeImageIndex + 1)}>
                  <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
                </Pressable>
              )}
            </View>
          </View>
        </View>
      )}

      {images.length > 1 && (
        <View style={common.heroDotsContainer} pointerEvents="none">
          {images.map((_, index) => (
            <View
              key={`${item.id || 'hero'}:dot:${index}`}
              style={[
                cards.recDot,
                index === activeImageIndex && cards.recDotActive,
              ]}
            />
          ))}
        </View>
      )}
      <LinearGradient
        pointerEvents="box-none"
        colors={['rgba(0,0,0,0.3)', 'transparent', 'transparent']}
        style={common.heroGradient}
      >
        <View style={styles.rtlActionsRow} pointerEvents="box-none" testID="recommendation-hero-actions">
          <BackButton iconDirection="rtl" />
          <FavoriteButton type={favoriteType} id={item.id} variant="light" snapshotData={snapshotData} />
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  heroFrame: {
    overflow: 'hidden',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    backgroundColor: '#EEF1F6',
  },
  noImageHeader: {
    height: 188,
    overflow: 'hidden',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingTop: 50,
    paddingHorizontal: 16,
    backgroundColor: '#EEF1F6',
  },
  noImagePresentation: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noImageIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(30,58,95,0.08)',
  },
  rtlActionsRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

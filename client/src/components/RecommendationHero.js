import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, FlatList, Platform, useWindowDimensions, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useBoundedImageWindow } from '../hooks/useBoundedImageWindow';
import { BackButton } from './BackButton';
import CachedImage, { prefetchImage } from './CachedImage';
import FavoriteButton from './FavoriteButton';
import { common, cards } from '../styles';
import {
  getMediaPlaceholder,
  getMediaSrcSet,
  getRecommendationImageUrls,
} from '../utils/mediaAssets';

export const RecommendationHero = ({ item, snapshotData }) => {
  const { width: windowWidth } = useWindowDimensions();
  const images = useMemo(
    () => getRecommendationImageUrls(item, 'large'),
    [item]
  );
  const hasImage = images.length > 0;
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
      <View style={common.noImageHeader}>
        <View style={common.rowBetween}>
          <BackButton color="dark" variant="solid" />
          <FavoriteButton type="recommendations" id={item.id} variant="dark" snapshotData={snapshotData} />
        </View>
      </View>
    );
  }

  return (
    <View style={common.heroContainer} onLayout={(e) => setHeroWidth(e.nativeEvent.layout.width)}>
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

          return (
            <CachedImage
              source={{ uri }}
              placeholder={getMediaPlaceholder(item?.media?.[index])}
              srcSet={getMediaSrcSet(item?.media?.[index])}
              sizes="100vw"
              style={
                Platform.OS === 'web'
                  ? {
                      width: pageWidth,
                      height: '100%',
                      backgroundColor: '#F3F4F6',
                    }
                  : [common.heroImage, { width: pageWidth }]
              }
              contentFit="cover"
              priority={index === imageWindow.currentIndex ? 'high' : 'low'}
            />
          );
        }}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      {Platform.OS === 'web' && images.length > 1 && (
        <View style={cards.recNavOverlay} pointerEvents="box-none">
          <View style={cards.recNavOverlayRow} pointerEvents="box-none">
            <Pressable
              style={cards.recNavZoneLeft}
              onPress={() => scrollToImageIndex(activeImageIndex - 1)}
            >
              {activeImageIndex > 0 && (
                <View style={cards.recNavButton}>
                  <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
            <Pressable
              style={cards.recNavZoneRight}
              onPress={() => scrollToImageIndex(activeImageIndex + 1)}
            >
              {activeImageIndex < images.length - 1 && (
                <View style={cards.recNavButton}>
                  <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
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
        <View style={common.rowBetween} pointerEvents="box-none">
          <BackButton />
          <FavoriteButton type="recommendations" id={item.id} variant="light" snapshotData={snapshotData} />
        </View>
      </LinearGradient>
    </View>
  );
};

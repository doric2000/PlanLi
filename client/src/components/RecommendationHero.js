import React, { useMemo, useRef, useState } from 'react';
import { View, Image, FlatList, Platform, useWindowDimensions, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BackButton } from './BackButton';
import FavoriteButton from './FavoriteButton';
import { common, cards } from '../styles';

export const RecommendationHero = ({ item, snapshotData }) => {
  const { width: windowWidth } = useWindowDimensions();
  const images = useMemo(() => (Array.isArray(item.images) ? item.images.filter(Boolean) : []), [item.images]);
  const hasImage = images.length > 0;
  const [heroWidth, setHeroWidth] = useState(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const heroRef = useRef(null);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const first = viewableItems?.[0]?.index;
    if (typeof first === 'number') setActiveImageIndex(first);
  }).current;

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
        keyExtractor={(uri, index) => `${item.id || 'hero'}:${index}:${uri}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={images.length > 1}
        getItemLayout={(_, index) => {
          const pageWidth = heroWidth || windowWidth || 0;
          return { length: pageWidth, offset: pageWidth * index, index };
        }}
        renderItem={({ item: uri }) => (
          Platform.OS === 'web'
            ? (
                <img
                  src={uri}
                  alt=""
                  style={{
                    width: (heroWidth || windowWidth) || '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                    backgroundColor: '#F3F4F6',
                  }}
                />
              )
            : (
                <Image
                  source={{ uri }}
                  style={[common.heroImage, { width: heroWidth || windowWidth || '100%' }]}
                  resizeMode="cover"
                />
              )
        )}
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

import React from 'react';
import { View, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BackButton } from './BackButton';
import FavoriteButton from './FavoriteButton';
import { common } from '../../styles';

export const RecommendationHero = ({ item, snapshotData }) => {
  const hasImage = item.images && item.images.length > 0;

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
    <View style={common.heroContainer}>
      <Image 
        source={{ uri: item.images[0] }} 
        style={common.heroImage}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.3)', 'transparent', 'transparent']}
        style={common.heroGradient}
      >
        <View style={common.rowBetween}>
          <BackButton />
          <FavoriteButton type="recommendations" id={item.id} variant="light" snapshotData={snapshotData} />
        </View>
      </LinearGradient>
    </View>
  );
};

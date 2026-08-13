import React from 'react';
import { View } from 'react-native';

import AppText from '../../../components/AppText';
import CachedImage from '../../../components/CachedImage';
import { getMediaVariantUrl } from '../../../utils/mediaAssets';
import { routeStopMarkerStyles as styles } from '../../../styles';

export default function RouteStopMarker({ stop, selected = false, compact = false }) {
  const number = Number(stop?.globalIndex ?? 0) + 1;
  const imageUrl = getMediaVariantUrl(stop?.media, 'thumb', stop?.image);
  const label = stop?.title || stop?.place?.name || `תחנה ${number}`;

  return (
    <View
      style={[styles.touchTarget, compact && styles.touchTargetCompact]}
      accessible
      accessibilityLabel={`תחנה ${number}: ${label}`}
      testID={`route-stop-marker-${number}`}
    >
      <View style={[styles.halo, selected && styles.haloSelected, compact && styles.haloCompact]}>
        <View style={[styles.pinHead, selected && styles.pinHeadSelected, compact && styles.pinHeadCompact]}>
          {imageUrl ? (
            <CachedImage source={{ uri: imageUrl }} style={styles.image} contentFit="cover" priority="low" />
          ) : (
            <AppText style={[styles.number, compact && styles.numberCompact]}>{number}</AppText>
          )}
          {imageUrl ? (
            <View style={[styles.badge, compact && styles.badgeCompact]}>
              <AppText style={[styles.badgeText, compact && styles.badgeTextCompact]}>{number}</AppText>
            </View>
          ) : null}
        </View>
        <View style={[styles.tail, selected && styles.tailSelected, compact && styles.tailCompact]} />
      </View>
    </View>
  );
}

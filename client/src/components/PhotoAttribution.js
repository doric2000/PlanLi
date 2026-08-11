import React from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import AppText from './AppText';
import { getDestinationAttribution } from '../utils/destinationImages';

function openLink(event, url) {
  event?.stopPropagation?.();
  if (url) Linking.openURL(url).catch(() => {});
}

export default function PhotoAttribution({ destination, style }) {
  const attribution = getDestinationAttribution(destination);
  if (!attribution) return null;
  return (
    <View style={[styles.container, style]} accessibilityLabel={`Photo by ${attribution.photographerName} on Unsplash`}>
      <AppText style={styles.text}>Photo by </AppText>
      <Pressable onPress={(event) => openLink(event, attribution.photographerProfileUrl)} hitSlop={6}>
        <AppText style={styles.link}>{attribution.photographerName}</AppText>
      </Pressable>
      <AppText style={styles.text}> on </AppText>
      <Pressable onPress={(event) => openLink(event, attribution.photoUrl || attribution.providerUrl)} hitSlop={6}>
        <AppText style={styles.link}>Unsplash</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 7,
    bottom: 6,
    zIndex: 4,
    maxWidth: '78%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.68)',
  },
  text: { color: '#FFFFFF', fontSize: 10 },
  link: { color: '#FFFFFF', fontSize: 10, textDecorationLine: 'underline' },
});

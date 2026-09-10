import React from 'react';
import { Pressable } from 'react-native';
import AppText from '../../../components/AppText';
import { communityDiscoveryStyles as s } from '../../../styles/communityDiscovery';

export default function CommunityCardBody({ title, destination, metadata, description, onPress, onDestinationPress, testID }) {
  return <Pressable style={s.cardBody} onPress={onPress} accessibilityRole="button" accessibilityLabel={`קריאת ${title}`} testID={testID}>
    <AppText style={s.cardTitle} numberOfLines={2}>{title}</AppText>
    {!!destination && (onDestinationPress ? <Pressable style={s.destinationLink} accessibilityRole="button" accessibilityLabel={`פתיחת ${destination}`}
      onPress={(event) => { event?.stopPropagation?.(); onDestinationPress(); }}>
      <AppText style={s.cardDestination} numberOfLines={1}>{destination}</AppText>
    </Pressable> : <AppText style={s.cardDestination} numberOfLines={1}>{destination}</AppText>)}
    {!!metadata && <AppText style={s.cardMetadata} numberOfLines={1}>{metadata}</AppText>}
    {!!description && <AppText style={s.cardExcerpt} numberOfLines={2}>{description}</AppText>}
  </Pressable>;
}

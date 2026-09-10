import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/AppText';
import { communityDiscoveryStyles as s, communityPalette as c } from '../../../styles/communityDiscovery';

export default function CommunityFeedState({ error, filtered, routes, onRetry, onFilter, onClear }) {
  return <View style={s.state} testID={`${routes ? 'routes' : 'community'}-empty-state`}>
    <Ionicons name={error ? 'cloud-offline-outline' : 'search-outline'} size={44} color={c.navy} />
    <AppText style={s.stateTitle}>{error ? 'משהו השתבש בדרך' : filtered ? 'לא מצאנו תוצאות הפעם' : routes ? 'המסלול הבא מתחיל כאן' : 'ההמלצה הבאה מתחילה כאן'}</AppText>
    <AppText style={s.stateText}>{error ? 'לא הצלחנו לטעון את התוכן. אפשר לנסות שוב.' : filtered ? 'אפשר לשנות את החיפוש או להרחיב את הסינון.' : routes ? 'עדיין אין מסלולים באזור הזה.' : 'עדיין אין המלצות באזור הזה.'}</AppText>
    {(error || filtered) && <Pressable style={s.stateButton} onPress={error ? onRetry : onFilter} accessibilityRole="button">
      <AppText style={s.stateButtonText}>{error ? 'נסו שוב' : 'עריכת סינון'}</AppText>
    </Pressable>}
    {filtered && !error && <Pressable style={s.secondaryAction} onPress={onClear} accessibilityRole="button"><AppText style={s.activeLabel}>נקה הכול</AppText></Pressable>}
  </View>;
}

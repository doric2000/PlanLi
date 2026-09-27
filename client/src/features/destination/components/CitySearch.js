import React from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/AppText';
import { communityPalette as c } from '../../../styles/communityDiscovery';

export function CitySearch({ kind, value, onChange, onFilter, filterCount = 0, styles }) {
  const label = kind === 'routes' ? 'חיפוש מסלול בעיר' : 'חיפוש המלצה בעיר';
  return <View style={styles.searchRow}>
    <View style={styles.searchField}>
      <Ionicons name="search-outline" size={20} color={c.navy} />
      <TextInput style={styles.searchInput} value={value || ''} onChangeText={onChange}
        placeholder={label} accessibilityLabel={label} placeholderTextColor={c.muted} returnKeyType="search" />
      {!!value && <Pressable onPress={() => onChange('')} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="ניקוי החיפוש">
        <Ionicons name="close-circle" size={20} color={c.muted} />
      </Pressable>}
    </View>
    {!!onFilter && <Pressable onPress={onFilter} style={styles.iconButton} accessibilityRole="button"
      accessibilityLabel={kind === 'routes' ? 'סינון מסלולים בעיר' : 'סינון המלצות בעיר'}>
      <Ionicons name="options-outline" size={20} color={c.navy} />
      {filterCount > 0 && <View style={styles.filterBadge}><AppText style={styles.badgeText}>{filterCount}</AppText></View>}
    </Pressable>}
  </View>;
}

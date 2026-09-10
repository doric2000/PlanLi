import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/AppText';
import PageHeader from '../../../components/PageHeader';
import CommunityContentSwitch from './CommunityContentSwitch';
import CommunitySearch from './CommunitySearch';
import RegionHeaderAction from '../../region/components/RegionHeaderAction';
import { isRegionDiscoveryEnabled } from '../../region/regionDefinitions';
import { tabHeroStyles } from '../../../styles';
import { COMMUNITY_HEADER_HEIGHT, communityDiscoveryStyles as s, communityPalette as c } from '../../../styles/communityDiscovery';

export default function CommunityHeader({ navigation, mode, filters, onSubmit, onDestinationsChange, regionId, regionMode,
  mapOpen, onMapToggle, onFilter, onSort, sortLabel, activeFilterCount, targets = {} }) {
  const prefix = mode === 'Routes' ? 'routes' : 'community';
  const insets = useSafeAreaInsets();
  return <PageHeader variant="hero" testID={`${prefix}-tab-header`}
    heroColors={[c.navy, c.navy]} contentStyle={s.headerContent}
    style={[tabHeroStyles.fixedHeader, s.header, { height: insets.top + COMMUNITY_HEADER_HEIGHT }]}
    renderTopRow={() => <View style={s.modeRow}>
      <View style={s.iconButton}>{isRegionDiscoveryEnabled() && <RegionHeaderAction regionId={regionId} mode={regionMode}
        onPress={() => navigation.navigate('RegionSelector', { source: `${prefix}-change` })} testID={`${prefix}-region-change`} />}</View>
      <CommunityContentSwitch navigation={navigation} selected={mode} compact />
      {onMapToggle && <Pressable ref={targets.map?.ref} onLayout={targets.map?.onLayout} collapsable={false}
        style={[s.iconButton, s.mapButton]} onPress={onMapToggle} testID="community-map-toggle"
        accessibilityRole="button" accessibilityLabel={mapOpen ? 'חזרה לרשימת המלצות' : 'מפת ההמלצות'}>
        {mapOpen ? <AppText style={s.mapLabel}>רשימה</AppText> : <Ionicons name="map-outline" size={20} color={c.navy} />}
      </Pressable>}
    </View>}>
    <CommunitySearch query={filters.query} destinations={filters.destinations} onSubmit={onSubmit}
      onDestinationsChange={onDestinationsChange} prefix={prefix} navigation={navigation} target={targets.search}>
      {(closeSearch) => <>
        <Pressable ref={targets.filter?.ref} onLayout={targets.filter?.onLayout} collapsable={false} style={s.iconButton}
          onPress={() => { closeSearch(); onFilter(); }} accessibilityRole="button" testID={`${prefix}-filter-button`}
          accessibilityLabel={`סינון ${mode === 'Routes' ? 'מסלולים' : 'המלצות'}${activeFilterCount ? `, ${activeFilterCount} פעילים` : ''}`}>
          <Ionicons name="options-outline" size={22} color={c.white} />
          {!!activeFilterCount && <View style={s.filterBadge}><AppText style={s.filterBadgeText}>{activeFilterCount}</AppText></View>}
        </Pressable>
        {!mapOpen && <Pressable ref={targets.sort?.ref} onLayout={targets.sort?.onLayout} collapsable={false} style={s.iconButton}
          onPress={() => { closeSearch(); onSort(); }} accessibilityRole="button" accessibilityLabel={`מיון ${mode === 'Routes' ? 'מסלולים' : 'המלצות'}: ${sortLabel}`}
          testID={`${prefix}-sort-button`}><AppText style={s.whiteLabel}>מיון</AppText></Pressable>}
      </>}
    </CommunitySearch>
  </PageHeader>;
}

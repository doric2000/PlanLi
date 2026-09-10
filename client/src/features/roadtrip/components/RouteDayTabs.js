import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/AppText';
import RtlHorizontalScrollView from '../../../components/RtlHorizontalScrollView';
import { colors, routeBuilderStyles as styles } from '../../../styles';

export default function RouteDayTabs({ days, activeIndex, locked, onSelect, onAdd }) {
  const scrollRef = useRef(null);
  const layouts = useRef({});
  const buttons = useRef({});
  const width = useRef(0);
  const selectedId = days[activeIndex]?.id;
  const revealSelected = useCallback(() => {
    const layout = layouts.current[selectedId];
    if (!layout || !width.current) return;
    // Native rows run right-to-left inside an explicitly LTR scroll coordinate space.
    if (Platform.OS !== 'web') scrollRef.current?.scrollTo?.({ x: Math.max(0, layout.x + layout.width - width.current), animated: false });
    else buttons.current[selectedId]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [selectedId]);
  useEffect(() => { revealSelected(); }, [revealSelected]);
  return <RtlHorizontalScrollView ref={scrollRef} autoScrollToStart={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}
    onLayout={(event) => { width.current = event.nativeEvent.layout.width; revealSelected(); }}
    onContentSizeChange={revealSelected} keyboardShouldPersistTaps="handled" testID="route-day-tabs">
    {days.map((day, index) => <TouchableOpacity key={day.id} ref={(node) => { buttons.current[day.id] = node; }} style={[styles.tab, activeIndex === index && styles.tabSelected]}
      onLayout={(event) => { layouts.current[day.id] = event.nativeEvent.layout; if (day.id === selectedId) revealSelected(); }}
      onPress={() => onSelect(index)} disabled={locked} accessibilityRole="tab" accessibilityState={{ selected: activeIndex === index, disabled: locked }}
      accessibilityLabel={`יום ${index + 1}${day.title ? `, ${day.title}` : ''}`} testID={`route-day-tab-${index}`}>
      <AppText style={[styles.tabText, activeIndex === index && styles.tabTextSelected]}>יום {index + 1}</AppText>
    </TouchableOpacity>)}
    <TouchableOpacity style={styles.tab} onPress={onAdd} disabled={locked || days.length >= 60} accessibilityRole="button" accessibilityLabel="הוספת יום" testID="route-add-day"><Ionicons name="add" size={22} color={colors.primary} /></TouchableOpacity>
  </RtlHorizontalScrollView>;
}

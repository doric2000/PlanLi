import React from 'react';
import { FlatList, TouchableOpacity, View } from 'react-native';
import DraggableFlatList from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import CachedImage from '../../../components/CachedImage';
import { getRecommendationImageUrls } from '../../../utils/mediaAssets';
import { colors, tripPlannerStyles as styles } from '../../../styles';

function Action({ label, icon, onPress, disabled = false, danger = false }) {
  return (
    <TouchableOpacity style={styles.stopDetailButton} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}>
      <Ionicons name={icon} size={17} color={danger ? colors.error : disabled ? colors.textMuted : colors.primary} />
      <AppText style={[styles.stopDetailText, danger && { color: colors.error }]}>{label}</AppText>
    </TouchableOpacity>
  );
}

function StopRow({ item, index, count, selected, readOnly, drag, isActive, onSelect, onDelete, onMove, onMoveToDay, onOpenRecommendation, onEditCustom }) {
  const custom = item.sourceType === 'custom';
  const thumb = getRecommendationImageUrls(item, 'thumb')[0];
  return (
    <View style={[styles.stopRow, selected && styles.stopRowSelected]} testID={`trip-stop-${item.id}`}>
      <TouchableOpacity activeOpacity={0.82} onPress={() => onSelect?.(item.id)} disabled={isActive} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flex: 1 }} accessibilityRole="button" accessibilityLabel={`${index + 1}, ${item.title}`} accessibilityState={{ expanded: selected }}>
        <View style={[styles.stopNumber, custom && styles.stopNumberCustom]}><AppText style={styles.stopNumberText}>{index + 1}</AppText></View>
        {thumb ? <CachedImage source={{ uri: thumb }} style={styles.discoveryThumb} contentFit="cover" /> : null}
        <View style={styles.stopCopy}>
          <AppText style={styles.stopTitle} numberOfLines={2}>{item.title}</AppText>
          {!!item.subtitle && <AppText style={styles.stopSubtitle} numberOfLines={1}>{item.subtitle}</AppText>}
          <AppText style={styles.stopSource}>{custom ? (item.locationMode === 'general' ? 'רעיון ללא מיקום' : 'עצירה אישית') : 'המלצת PlanLi'}</AppText>
        </View>
        <Ionicons name={selected ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
      </TouchableOpacity>
      {selected ? <View style={styles.stopDetails}>
        {!!item.note && <AppText style={styles.modalText}>{item.note}</AppText>}
        {readOnly && !custom ? <Action label="צפייה בהמלצה" icon="open-outline" onPress={() => onOpenRecommendation?.(item)} /> : null}
        {!readOnly ? <>
        <View style={styles.stopDetailActions}>
          {custom ? <Action label="עריכה" icon="create-outline" onPress={() => onEditCustom?.(item)} /> : <Action label="צפייה בהמלצה" icon="open-outline" onPress={() => onOpenRecommendation?.(item)} />}
          <Action label="ליום אחר" icon="calendar-outline" onPress={() => onMoveToDay?.(item)} />
          <Action label="למעלה" icon="arrow-up" disabled={index === 0} onPress={() => onMove(index, index - 1)} />
          <Action label="למטה" icon="arrow-down" disabled={index === count - 1} onPress={() => onMove(index, index + 1)} />
          <Action label="הסרה" icon="trash-outline" danger onPress={() => onDelete?.(item)} />
        </View>
        <TouchableOpacity style={styles.stopDetailButton} onLongPress={drag} accessibilityRole="button" accessibilityLabel="גרירה לשינוי סדר"><Ionicons name="reorder-three" size={21} color={colors.primary} /><AppText style={styles.stopDetailText}>לחצו לחיצה ארוכה לגרירה</AppText></TouchableOpacity>
        </> : null}
      </View> : null}
    </View>
  );
}

export default function TripStopList({ stops, selectedStopId, readOnly = false, onSelect, onReorder, onDelete, onMoveToDay, onOpenRecommendation, onEditCustom }) {
  const move = (from, to) => {
    if (to < 0 || to >= stops.length) return;
    const next = [...stops];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onReorder?.(next);
  };
  const render = ({ item, index, drag, isActive }) => (
    <StopRow item={item} index={index} count={stops.length} selected={item.id === selectedStopId} readOnly={readOnly}
      drag={drag} isActive={isActive} onSelect={onSelect} onDelete={onDelete} onMove={move}
      onMoveToDay={onMoveToDay} onOpenRecommendation={onOpenRecommendation} onEditCustom={onEditCustom} />
  );
  const common = { data: stops, renderItem: render, keyExtractor: (item) => item.id, contentContainerStyle: styles.listContent, style: styles.list, testID: 'trip-stops-list' };
  if (readOnly) return <FlatList {...common} />;
  return <DraggableFlatList {...common} onDragEnd={({ data }) => onReorder?.(data)} activationDistance={8} />;
}

import React from 'react';
import { FlatList, TouchableOpacity, View } from 'react-native';
import DraggableFlatList from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/AppText';
import { colors, tripPlannerStyles as styles } from '../../../styles';

function StopRow({ item, index, count, selected, readOnly, drag, isActive, onSelect, onDelete, onMove, onMoveToDay }) {
  const custom = item.sourceType === 'custom';
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() => onSelect?.(item.id)}
      onLongPress={readOnly ? undefined : drag}
      disabled={isActive}
      style={[styles.stopRow, selected && styles.stopRowSelected]}
      accessibilityRole="button"
      accessibilityLabel={`${index + 1}, ${item.title}`}
      testID={`trip-stop-${item.id}`}
    >
      <View style={[styles.stopNumber, custom && styles.stopNumberCustom]}><AppText style={styles.stopNumberText}>{index + 1}</AppText></View>
      <View style={styles.stopCopy}>
        <AppText style={styles.stopTitle} numberOfLines={1}>{item.title}</AppText>
        {!!item.subtitle && <AppText style={styles.stopSubtitle} numberOfLines={1}>{item.subtitle}</AppText>}
        <AppText style={styles.stopSource}>{custom ? (item.locationMode === 'general' ? 'רעיון ללא מיקום' : 'עצירה אישית') : 'המלצה מ־PlanLi'}</AppText>
      </View>
      {!readOnly ? (
        <View style={styles.rowActions}>
          <TouchableOpacity style={styles.dragHandle} onLongPress={drag} accessibilityRole="button" accessibilityLabel="גרירה לשינוי סדר">
            <Ionicons name="reorder-three" size={25} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={styles.reorderButtons}>
            <TouchableOpacity disabled={index === 0} onPress={() => onMove(index, index - 1)} style={styles.reorderButton} accessibilityRole="button" accessibilityLabel="הזזה למעלה">
              <Ionicons name="chevron-up" size={18} color={index === 0 ? colors.textMuted : colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity disabled={index === count - 1} onPress={() => onMove(index, index + 1)} style={styles.reorderButton} accessibilityRole="button" accessibilityLabel="הזזה למטה">
              <Ionicons name="chevron-down" size={18} color={index === count - 1 ? colors.textMuted : colors.primary} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => onDelete(item)} style={styles.reorderButton} accessibilityRole="button" accessibilityLabel={`מחיקת ${item.title}`}>
            <Ionicons name="trash-outline" size={17} color={colors.error} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onMoveToDay?.(item)} style={styles.reorderButton} accessibilityRole="button" accessibilityLabel={`העברת ${item.title} ליום אחר`}>
            <Ionicons name="swap-vertical-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export default function TripStopList({ stops, selectedStopId, readOnly = false, onSelect, onReorder, onDelete, onMoveToDay }) {
  const move = (from, to) => {
    const next = [...stops];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onReorder?.(next);
  };
  const render = ({ item, index, drag, isActive }) => (
    <StopRow item={item} index={index} count={stops.length} selected={item.id === selectedStopId} readOnly={readOnly}
      drag={drag} isActive={isActive} onSelect={onSelect} onDelete={onDelete} onMove={move} onMoveToDay={onMoveToDay} />
  );
  if (readOnly) return <FlatList data={stops} renderItem={render} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContent} style={styles.list} />;
  return (
    <DraggableFlatList
      data={stops}
      renderItem={render}
      keyExtractor={(item) => item.id}
      onDragEnd={({ data }) => onReorder?.(data)}
      activationDistance={8}
      contentContainerStyle={styles.listContent}
      style={styles.list}
    />
  );
}

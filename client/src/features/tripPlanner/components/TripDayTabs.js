import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/AppText';
import { colors, tripPlannerStyles as styles } from '../../../styles';
import { orderedDays } from '../utils/tripPlannerModel';
import RtlHorizontalScrollView from '../../../components/RtlHorizontalScrollView';

export default function TripDayTabs({ trip, selectedDayId, onSelect, onAddDay, readOnly = false }) {
  return (
    <RtlHorizontalScrollView
      style={styles.dayRail}
      contentContainerStyle={styles.dayRailContent}
    >
      {orderedDays(trip).map((day) => {
        const selected = day.id === selectedDayId;
        return (
          <TouchableOpacity
            key={day.id}
            style={[styles.dayChip, selected && styles.dayChipSelected]}
            onPress={() => onSelect(day.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={day.kind === 'ideas' ? 'רעיונות' : day.title}
          >
          <AppText style={[styles.dayChipText, selected && styles.dayChipTextSelected]} numberOfLines={1}>
              {day.kind === 'ideas' ? 'רעיונות' : day.title} · {day.stops?.length ?? day.stopCount ?? 0}
            </AppText>
          </TouchableOpacity>
        );
      })}
      {!readOnly ? (
        <TouchableOpacity style={[styles.dayChip, styles.addDayChip]} onPress={onAddDay} accessibilityRole="button" accessibilityLabel="הוספת יום">
          <Ionicons name="add" size={21} color={colors.primary} />
        </TouchableOpacity>
      ) : null}
    </RtlHorizontalScrollView>
  );
}

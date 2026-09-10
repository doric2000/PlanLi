import React, { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import DraggableFlatList from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/AppText';
import CachedImage from '../../../components/CachedImage';
import { colors, routeBuilderStyles as styles } from '../../../styles';
import { getStopMediaUrls } from '../utils/routeStops';

export default function RouteStopSorter({ day, dayIndex, onReorder, onMove, onDone }) {
  const [dragging, setDragging] = useState(false);
  return <View style={styles.screen} testID="route-stop-sorter">
    <View style={styles.modeHeader}>
      <AppText style={styles.sectionTitle}>סידור עצירות · יום {dayIndex + 1}</AppText>
      <AppText style={styles.body}>לחצו ארוכות על ידית הגרירה, או השתמשו בחצים.</AppText>
      <TouchableOpacity accessibilityRole="button" style={styles.primaryButton} onPress={onDone} disabled={dragging} testID="route-sort-done"><AppText style={styles.primaryButtonText}>סיום סידור</AppText></TouchableOpacity>
    </View>
    <DraggableFlatList containerStyle={styles.modeList} style={styles.modeList} contentContainerStyle={styles.content} data={day.stops} keyExtractor={(stop) => stop.id}
      activationDistance={12} autoscrollThreshold={60} autoscrollSpeed={120}
      initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5}
      onDragBegin={() => setDragging(true)} onDragEnd={({ data }) => { setDragging(false); onReorder(data); }}
      testID="route-stop-draggable-list" renderItem={({ item: stop, getIndex, drag, isActive }) => {
        const index = getIndex?.() ?? day.stops.findIndex((item) => item.id === stop.id);
        const uri = getStopMediaUrls(stop, 'thumb')[0];
        return <View style={[styles.stopCard, isActive && styles.stopCardDragging]}>
          <View style={styles.stopNumber}><AppText style={styles.stopNumberText}>{index + 1}</AppText></View>
          {!!uri && <CachedImage source={{ uri }} style={styles.stopThumb} contentFit="cover" />}
          <View style={styles.flexCopy}><AppText style={styles.stopTitle} numberOfLines={1}>{stop.title || 'עצירה חדשה'}</AppText><AppText style={styles.stopMeta} numberOfLines={1}>{stop.destination?.cityName || stop.location || 'להשלמה'}</AppText></View>
          <View>
            <TouchableOpacity accessibilityRole="button" style={styles.stopAction} disabled={dragging || index === 0} onPress={() => onMove(index, index - 1)} accessibilityLabel={`העברת עצירה ${index + 1} למעלה`} testID={`route-sort-up-${stop.id}`}><Ionicons name="arrow-up" size={18} color={colors.primary} /></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={styles.stopAction} disabled={dragging || index === day.stops.length - 1} onPress={() => onMove(index, index + 1)} accessibilityLabel={`העברת עצירה ${index + 1} למטה`} testID={`route-sort-down-${stop.id}`}><Ionicons name="arrow-down" size={18} color={colors.primary} /></TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.dragHandle} onLongPress={drag} delayLongPress={220} disabled={dragging} accessibilityRole="button" accessibilityLabel={`גרירת עצירה ${index + 1}`} testID={`route-stop-drag-handle-${stop.id}`}><Ionicons name="reorder-three-outline" size={26} color={colors.primary} /></TouchableOpacity>
        </View>;
      }} />
  </View>;
}

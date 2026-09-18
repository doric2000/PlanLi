import React, { useEffect } from 'react';
import { TouchableOpacity, View } from 'react-native';
import AppText from '../../../components/AppText';
import { tripPlannerStyles as styles } from '../../../styles';
import { coordinatesForStop } from '../utils/tripPlannerModel';

export default function TripPlannerMap({ stops = [], selectedStopId, onSelectStop, onReady, style }) {
  useEffect(() => { onReady?.(); }, []);
  const points = stops.map((stop) => ({ stop, point: coordinatesForStop(stop) })).filter((item) => item.point);
  const lats = points.map(({ point }) => point.latitude);
  const lngs = points.map(({ point }) => point.longitude);
  const minLat = lats.length ? Math.min(...lats) : 0; const maxLat = lats.length ? Math.max(...lats) : 0;
  const minLng = lngs.length ? Math.min(...lngs) : 0; const maxLng = lngs.length ? Math.max(...lngs) : 0;
  const latitudeRange = maxLat - minLat;
  const longitudeRange = maxLng - minLng;
  const position = (point) => ({
    left: longitudeRange < 0.001 ? '50%' : `${10 + ((point.longitude - minLng) / longitudeRange) * 80}%`,
    top: latitudeRange < 0.001 ? '45%' : `${10 + ((maxLat - point.latitude) / latitudeRange) * 70}%`,
  });
  return (
    <View style={[styles.mapFallback, style]} accessibilityLabel="תצוגת מפה בדפדפן">
      {[18, 38, 58, 78].map((top) => <View key={`h${top}`} style={[styles.mapGridLine, { left: 0, right: 0, top: `${top}%`, height: 1 }]} />)}
      {[18, 38, 58, 78].map((left) => <View key={`v${left}`} style={[styles.mapGridLine, { top: 0, bottom: 0, left: `${left}%`, width: 1 }]} />)}
      {points.map(({ stop, point }, index) => (
        <TouchableOpacity
          key={stop.id}
          onPress={() => onSelectStop?.(stop.id)}
          accessibilityRole="button"
          accessibilityLabel={`${index + 1}. ${stop.title}`}
          style={{ position: 'absolute', transform: 'translate(-22px,-22px)', ...position(point), width: 44, height: 44, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        ><View style={{ width: selectedStopId === stop.id ? 42 : 36, height: selectedStopId === stop.id ? 42 : 36, borderRadius: 24, backgroundColor: stop.sourceType === 'custom' ? '#F5961D' : '#1E3A5F', borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}><AppText style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>{index + 1}</AppText></View></TouchableOpacity>
      ))}
      <View style={styles.webMapNote}><AppText style={styles.webMapNoteText}>באתר מוצג קו תכנון · ניווט חי זמין באפליקציה</AppText></View>
    </View>
  );
}

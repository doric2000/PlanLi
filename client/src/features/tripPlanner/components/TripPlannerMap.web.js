import React, { useEffect } from 'react';
import { TouchableOpacity, View } from 'react-native';
import AppText from '../../../components/AppText';
import { tripPlannerStyles as styles } from '../../../styles';
import { coordinatesForStop } from '../utils/tripPlannerModel';
import RouteStopMarker from '../../roadtrip/components/RouteStopMarker';
import { getRecommendationImageUrls } from '../../../utils/mediaAssets';

export default function TripPlannerMap({ stops = [], selectedStopId, onSelectStop, onReady, style, interactive = true }) {
  useEffect(() => { onReady?.(); }, []);
  const points = stops.map((stop, index) => ({ stop, number: index + 1, point: coordinatesForStop(stop) })).filter((item) => item.point);
  const lats = points.map(({ point }) => point.latitude);
  const lngs = points.map(({ point }) => point.longitude);
  const minLat = lats.length ? Math.min(...lats) : 0; const maxLat = lats.length ? Math.max(...lats) : 0;
  const minLng = lngs.length ? Math.min(...lngs) : 0; const maxLng = lngs.length ? Math.max(...lngs) : 0;
  const latitudeRange = maxLat - minLat;
  const longitudeRange = maxLng - minLng;
  const halfWidth = interactive ? 28 : 22;
  const tipOffset = interactive ? 50 : 39;
  const tailSpace = interactive ? 14 : 11;
  const topInset = interactive ? tipOffset + 60 : tipOffset;
  const position = (point) => {
    const x = longitudeRange === 0 ? 0.5 : (point.longitude - minLng) / longitudeRange;
    const y = latitudeRange === 0 ? 0.5 : (maxLat - point.latitude) / latitudeRange;
    // Interpolate within the padded area; clamping after projection merges
    // distinct stops at the edge of short previews. CSS also handles resizing.
    return {
      left: `calc(${x * 100}% + ${halfWidth * (1 - 2 * x)}px)`,
      top: `calc(${y * 100}% + ${topInset * (1 - y) - tailSpace * y}px)`,
    };
  };
  return (
    <View style={[styles.mapFallback, style]} accessibilityLabel="תצוגת מפה בדפדפן">
      {[18, 38, 58, 78].map((top) => <View key={`h${top}`} style={[styles.mapGridLine, { left: 0, right: 0, top: `${top}%`, height: 1 }]} />)}
      {[18, 38, 58, 78].map((left) => <View key={`v${left}`} style={[styles.mapGridLine, { top: 0, bottom: 0, left: `${left}%`, width: 1 }]} />)}
      {points.map(({ stop, point, number }) => (
        <TouchableOpacity
          key={stop.id}
          onPress={() => onSelectStop?.(stop.id)}
          accessibilityRole="button"
          accessibilityLabel={`${number}. ${stop.title}`}
          accessibilityState={{ selected: selectedStopId === stop.id }}
          style={[styles.webStopMarker, !interactive && styles.webStopMarkerCompact, position(point), { zIndex: selectedStopId === stop.id ? stops.length + 1 : number }]}
        ><RouteStopMarker stop={stop} displayNumber={number} selected={selectedStopId === stop.id} compact={!interactive}
          imageUrl={getRecommendationImageUrls(stop, 'thumb')[0]} /></TouchableOpacity>
      ))}
      {interactive && <View style={styles.webMapNote}><AppText style={styles.webMapNoteText}>באתר מוצג קו תכנון · ניווט חי זמין באפליקציה</AppText></View>}
    </View>
  );
}

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { MaterialIcons } from '@expo/vector-icons';
import { tripMapCamera } from '../../tripPlanner/utils/tripMapCamera';
import { communityPalette as c } from '../../../styles/communityDiscovery';

const mapStyle = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];
const CityMarker = memo(function CityMarker({ item, selected, onSelect, styles, fontReady }) {
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), 200);
    return () => clearTimeout(timer);
  }, [selected, fontReady, item.visual.icon]);
  return <Marker coordinate={{ latitude: item.coordinates.lat, longitude: item.coordinates.lng }}
    tracksViewChanges={tracking} anchor={{ x: 0.5, y: 0.5 }} stopPropagation zIndex={selected ? 2 : 1}
    onPress={() => onSelect(item.id)} accessibilityLabel={`המלצה: ${item.title}`} testID={`city-marker-${item.id}`}>
    <View collapsable={false} style={[styles.mapMarker, { backgroundColor: item.visual.color || c.navy }, selected && styles.mapMarkerSelected]}>
      <MaterialIcons name={item.visual.icon} size={22} color={selected ? c.navy : c.white} />
    </View>
  </Marker>;
});

export default function CityMapCanvas({ region, items, selectedId, onSelect, onReady, onRegionChange, onMapPress, interactive = false, styles }) {
  const mapRef = useRef(null);
  const nativeReady = useRef(false);
  const nativeSize = useRef(null);
  const loaded = useRef(false);
  const applied = useRef('');
  // The supplied region is the initial fit. A search of the user's current
  // viewport updates the query, never fits those already-visible bounds again.
  const initialRegion = useRef(region);
  const [layout, setLayout] = useState(null);
  const [fontReady, setFontReady] = useState(false);
  const camera = useMemo(() => layout ? tripMapCamera(initialRegion.current, layout) : null, [layout]);
  const cameraKey = JSON.stringify(camera);
  const latest = useRef({ camera, cameraKey, onReady, layout });
  latest.current = { camera, cameraKey, onReady, layout };
  useEffect(() => {
    let active = true;
    Promise.resolve(MaterialIcons.loadFont?.()).catch(() => {}).finally(() => { if (active) setFontReady(true); });
    return () => { active = false; };
  }, []);
  const initialize = useCallback(() => {
    const current = latest.current;
    if (!nativeReady.current || !nativeSize.current || !current.camera || !mapRef.current) return;
    const size = nativeSize.current;
    if (!(size.width > 0 && size.height > 0) || Math.abs(size.width - current.layout.width) > 1 || Math.abs(size.height - current.layout.height) > 1) return;
    if (applied.current !== current.cameraKey) {
      try { mapRef.current.setCamera(current.camera); applied.current = current.cameraKey; } catch { return; }
    }
    if (loaded.current) current.onReady?.();
  }, []);
  useEffect(() => { initialize(); }, [cameraKey, initialize]);
  return <View collapsable={false} style={styles.mapCanvas} testID="city-map-host" onLayout={({ nativeEvent }) => {
    const { width, height } = nativeEvent.layout;
    if (width > 0 && height > 0) setLayout((old) => old?.width === width && old?.height === height ? old : { width, height });
  }}>
    {camera && <MapView ref={mapRef} style={styles.mapCanvas} provider={PROVIDER_GOOGLE} initialCamera={camera}
      customMapStyle={mapStyle} showsMyLocationButton={false} toolbarEnabled={false} poiClickEnabled={false}
      scrollEnabled={interactive} zoomEnabled={interactive} zoomTapEnabled={interactive} rotateEnabled={false} pitchEnabled={false}
      onLayout={({ nativeEvent }) => { nativeSize.current = nativeEvent.layout; initialize(); }}
      onMapReady={() => { nativeReady.current = true; initialize(); }}
      onMapLoaded={() => { loaded.current = true; initialize(); }}
      onRegionChangeComplete={(next, details) => { if (interactive && details?.isGesture) onRegionChange?.(next); }}
      onPress={onMapPress} testID="city-map-native" accessibilityLabel="מפת ההמלצות בעיר">
      {items.slice(0, 500).map((item) => <CityMarker key={item.id} item={item} selected={item.id === selectedId}
        onSelect={onSelect} styles={styles} fontReady={fontReady} />)}
    </MapView>}
  </View>;
}

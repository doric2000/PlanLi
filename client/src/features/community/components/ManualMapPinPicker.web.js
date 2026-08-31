import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { FormInput } from '../../../components/FormInput';
import AppText from '../../../components/AppText';
import { getMapTilerStyleUrl } from '../../../config/mapConfig';
import { colors, recommendationComposerStyles as styles } from '../../../styles';

const MAP_LOAD_TIMEOUT_MS = 10000;
const FALLBACK_COORDINATE = Object.freeze({ latitude: 32.0853, longitude: 34.7818 });
const MAPLIBRE_ESSENTIAL_CSS = `
.planli-manual-map.maplibregl-map{font:12px/20px sans-serif;position:relative;overflow:hidden;-webkit-tap-highlight-color:transparent}
.planli-manual-map .maplibregl-canvas{position:absolute;left:0;top:0}
.planli-manual-map .maplibregl-canvas-container.maplibregl-interactive{cursor:grab;user-select:none}
.planli-manual-map .maplibregl-canvas-container.maplibregl-interactive:active{cursor:grabbing}
.planli-manual-map .maplibregl-marker{position:absolute;left:0;top:0;will-change:transform}
.planli-manual-map .maplibregl-ctrl-top-left{position:absolute;left:10px;top:10px;z-index:2}
.planli-manual-map .maplibregl-ctrl-group{border-radius:8px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.28);overflow:hidden}
.planli-manual-map .maplibregl-ctrl-group button{display:block;width:32px;height:32px;border:0;background:#fff;cursor:pointer}
.planli-manual-map .maplibregl-ctrl-group button+button{border-top:1px solid #d8dee6}
.planli-manual-map .maplibregl-ctrl-icon{display:block;width:100%;height:100%;background-position:center;background-repeat:no-repeat}
.planli-manual-map .maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon:after{content:'+';font-size:22px;line-height:30px;color:#1e3a5f}
.planli-manual-map .maplibregl-ctrl-zoom-out .maplibregl-ctrl-icon:after{content:'−';font-size:22px;line-height:30px;color:#1e3a5f}
.planli-manual-map .maplibregl-ctrl-bottom-right{position:absolute;right:6px;bottom:4px;z-index:2}
.planli-manual-map .maplibregl-ctrl-attrib{background:rgba(255,255,255,.82);font-size:10px;padding:0 4px}
`;

export function normalizeWebPinCoordinate(value) {
  const latitude = Number(value?.latitude ?? value?.lat);
  const longitude = Number(value?.longitude ?? value?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function CoordinateFallback({ destination, value, onChange }) {
  const [focusedField, setFocusedField] = useState('');
  const latitude = value?.latitude ?? value?.lat ?? '';
  const longitude = value?.longitude ?? value?.lng ?? '';
  const update = (field, nextValue) => onChange?.({
    latitude: field === 'latitude' ? nextValue : latitude,
    longitude: field === 'longitude' ? nextValue : longitude,
  });
  return (
    <View style={styles.coordinateFields} testID="recommendation-manual-coordinate-fallback">
      <FormInput
        label="קו רוחב"
        value={String(latitude)}
        onChangeText={(next) => update('latitude', next)}
        placeholder={focusedField === 'latitude' ? '' : String(destination?.coordinates?.lat || FALLBACK_COORDINATE.latitude)}
        onFocus={() => setFocusedField('latitude')}
        onBlur={() => setFocusedField('')}
        keyboardType="decimal-pad"
        rtl
        testID="recommendation-manual-latitude"
      />
      <FormInput
        label="קו אורך"
        value={String(longitude)}
        onChangeText={(next) => update('longitude', next)}
        placeholder={focusedField === 'longitude' ? '' : String(destination?.coordinates?.lng || FALLBACK_COORDINATE.longitude)}
        onFocus={() => setFocusedField('longitude')}
        onBlur={() => setFocusedField('')}
        keyboardType="decimal-pad"
        rtl
        testID="recommendation-manual-longitude"
      />
    </View>
  );
}

export default function ManualMapPinPicker({ destination, value, onChange }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const styleUrl = getMapTilerStyleUrl();
  const destinationIdentity = `${destination?.countryId || ''}:${destination?.cityId || ''}`;
  const initialCoordinate = useMemo(() => (
    normalizeWebPinCoordinate(value) ||
    normalizeWebPinCoordinate(destination?.coordinates) ||
    FALLBACK_COORDINATE
  ), [destination?.coordinates, value]);
  const currentCoordinate = normalizeWebPinCoordinate(value);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!mapContainerRef.current || !styleUrl) {
      setMapError('המפה אינה זמינה כרגע. אפשר להזין קואורדינטות ידנית.');
      return undefined;
    }
    let disposed = false;
    let loadTimer = null;
    let map = null;
    let marker = null;
    setMapReady(false);
    setMapError('');

    import('maplibre-gl').then((module) => {
      if (disposed || !mapContainerRef.current) return;
      const MapClass = module.Map || module.default?.Map;
      const MarkerClass = module.Marker || module.default?.Marker;
      const NavigationControlClass = module.NavigationControl || module.default?.NavigationControl;
      if (!MapClass || !MarkerClass) throw new Error('MapLibre is unavailable.');
      map = new MapClass({
        container: mapContainerRef.current,
        style: styleUrl,
        center: [initialCoordinate.longitude, initialCoordinate.latitude],
        zoom: 16,
        attributionControl: true,
      });
      marker = new MarkerClass({ color: colors.primary, draggable: true })
        .setLngLat([initialCoordinate.longitude, initialCoordinate.latitude])
        .addTo(map);
      mapRef.current = map;
      markerRef.current = marker;

      const emitCoordinate = (lngLat) => {
        const next = normalizeWebPinCoordinate({ latitude: lngLat?.lat, longitude: lngLat?.lng });
        if (!next) return;
        onChangeRef.current?.({
          latitude: Number(next.latitude.toFixed(6)),
          longitude: Number(next.longitude.toFixed(6)),
        });
      };
      marker.on('dragend', () => emitCoordinate(marker.getLngLat()));
      map.on('click', (event) => {
        marker.setLngLat(event.lngLat);
        map.easeTo({ center: event.lngLat, duration: 250 });
        emitCoordinate(event.lngLat);
      });
      if (NavigationControlClass) {
        map.addControl(new NavigationControlClass({ showCompass: false }), 'top-left');
      }
      map.on('load', () => {
        if (disposed) return;
        if (loadTimer) clearTimeout(loadTimer);
        setMapReady(true);
        map.resize();
      });
      loadTimer = setTimeout(() => {
        if (!disposed) setMapError('לא הצלחנו לטעון את המפה. אפשר להזין קואורדינטות ידנית.');
      }, MAP_LOAD_TIMEOUT_MS);
    }).catch(() => {
      if (!disposed) setMapError('לא הצלחנו לטעון את המפה. אפשר להזין קואורדינטות ידנית.');
    });

    return () => {
      disposed = true;
      if (loadTimer) clearTimeout(loadTimer);
      marker?.remove?.();
      map?.remove?.();
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [destinationIdentity, styleUrl]);

  useEffect(() => {
    if (!currentCoordinate || !markerRef.current) return;
    const previous = markerRef.current.getLngLat();
    if (Math.abs(previous.lat - currentCoordinate.latitude) < 0.000001 &&
        Math.abs(previous.lng - currentCoordinate.longitude) < 0.000001) return;
    markerRef.current.setLngLat([currentCoordinate.longitude, currentCoordinate.latitude]);
  }, [currentCoordinate?.latitude, currentCoordinate?.longitude]);

  return (
    <View>
      {React.createElement('style', {
        dangerouslySetInnerHTML: { __html: MAPLIBRE_ESSENTIAL_CSS },
      })}
      <View style={styles.webMapPickerShell}>
        {React.createElement('div', {
          ref: mapContainerRef,
          className: 'planli-manual-map',
          role: 'application',
          'aria-label': 'מפה לבחירת נקודה מדויקת',
          'data-testid': 'recommendation-manual-map-web',
          style: StyleSheet.flatten(styles.manualMap),
        })}
        {!mapReady && !mapError ? (
          <View style={styles.webMapLoading} pointerEvents="none">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}
      </View>
      <AppText style={styles.fieldHint}>
        לחיצה על המפה או גרירת הסיכה מעדכנות את המקום המדויק.
      </AppText>
      {mapError ? (
        <View>
          <AppText style={styles.fieldError}>{mapError}</AppText>
          <CoordinateFallback destination={destination} value={value} onChange={onChange} />
        </View>
      ) : null}
    </View>
  );
}

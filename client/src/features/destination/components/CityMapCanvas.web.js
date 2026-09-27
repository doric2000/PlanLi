import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getMapTilerStyleUrl } from '../../../config/mapConfig';

// Same installed MapLibre runtime and worker as the existing place picker.
const css = `.planli-city-map{position:absolute;inset:0;overflow:hidden;font:12px sans-serif}.planli-city-map canvas{position:absolute;inset:0}.planli-city-map .maplibregl-marker{position:absolute;left:0;top:0}.planli-city-map .maplibregl-ctrl-bottom-right{position:absolute;right:0;bottom:0}.planli-city-map .maplibregl-ctrl-attrib{background:#ffffffed;padding:2px 6px;font-size:10px}.planli-city-map .maplibregl-ctrl-attrib a{color:#1e3a5f}.planli-city-marker{width:44px;height:44px;border:3px solid white;border-radius:50%;color:white;font-weight:bold;cursor:pointer;box-shadow:0 2px 6px #0003}`;

export default function CityMapCanvas({ region, items, selectedId, onSelect, onReady, onError, onRegionChange, onMapPress, interactive = false, styles }) {
  const host = useRef(null); const map = useRef(null); const markerClass = useRef(null);
  const callbacks = useRef({ onReady, onError, onSelect, onRegionChange, onMapPress });
  callbacks.current = { onReady, onError, onSelect, onRegionChange, onMapPress };
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false; let instance; let resize;
    const style = getMapTilerStyleUrl();
    if (!style) { callbacks.current.onError?.(); return undefined; }
    import('maplibre-gl').then((module) => {
      if (cancelled) return;
      const api = module.Map ? module : module.default;
      api.setWorkerUrl(new URL('/maplibre/6.4.1/maplibre-gl-worker.mjs', window.location.origin).href);
      markerClass.current = api.Marker;
      MaterialIcons.loadFont().catch(() => {});
      instance = new api.Map({ container: host.current, style, center: [region.longitude, region.latitude],
        zoom: Math.max(2, Math.min(16, Math.log2(360 / region.longitudeDelta))), interactive,
        attributionControl: { compact: false } });
      map.current = instance;
      instance.on('load', () => { if (!cancelled) { instance.resize(); setReady(true); callbacks.current.onReady?.(); } });
      instance.on('error', () => { if (!cancelled && !instance.loaded()) callbacks.current.onError?.(); });
      instance.on('click', () => callbacks.current.onMapPress?.());
      instance.on('moveend', (event) => {
        if (!event.originalEvent || !interactive) return;
        const b = instance.getBounds(); const center = instance.getCenter();
        callbacks.current.onRegionChange?.({ latitude: center.lat, longitude: center.lng,
          latitudeDelta: b.getNorth() - b.getSouth(), longitudeDelta: b.getEast() - b.getWest() });
      });
      if (typeof ResizeObserver !== 'undefined') { resize = new ResizeObserver(() => instance.resize()); resize.observe(host.current); }
    }).catch(() => { if (!cancelled) callbacks.current.onError?.(); });
    return () => { cancelled = true; resize?.disconnect(); instance?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!ready || !map.current || !markerClass.current) return undefined;
    const markers = items.slice(0, 500).map((item) => {
      const el = document.createElement('button');
      el.className = 'planli-city-marker'; el.type = 'button';
      const glyph = MaterialIcons.getRawGlyphMap()[item.visual.icon];
      el.textContent = glyph ? String.fromCodePoint(glyph) : '●';
      el.style.fontFamily = MaterialIcons.getFontFamily(); el.style.fontSize = '22px';
      el.dataset.testid = `city-marker-${item.id}`;
      el.setAttribute('aria-label', `המלצה: ${item.title}`);
      el.setAttribute('aria-pressed', String(item.id === selectedId));
      el.style.backgroundColor = item.id === selectedId ? '#FF9F1C' : item.visual.color || '#1E3A5F';
      el.onclick = (event) => { event.stopPropagation(); callbacks.current.onSelect?.(item.id); };
      return new markerClass.current({ element: el }).setLngLat([item.coordinates.lng, item.coordinates.lat]).addTo(map.current);
    });
    return () => markers.forEach((marker) => marker.remove());
  }, [ready, items, selectedId]);
  return <View style={styles.mapCanvas}>
    {React.createElement('style', null, css)}
    {React.createElement('div', { ref: host, className: 'planli-city-map', role: 'region', 'aria-label': 'מפת ההמלצות בעיר' })}
  </View>;
}

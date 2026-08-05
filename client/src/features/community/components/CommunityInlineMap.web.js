import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

import '../../../styles/leaflet.css';

import { community } from '../../../styles';
import RecommendationMapPreviewCard from './RecommendationMapPreviewCard';
import { normalizeRecommendationMapItems } from '../utils/recommendationMap';

const MAX_MARKERS_RENDER = 200;
const GLYPH_MAP = MaterialIcons.getRawGlyphMap();

function createRecommendationMarkerIcon(visual, selected) {
  const size = selected ? 52 : 44;
  const iconCode = GLYPH_MAP[visual.icon] || GLYPH_MAP.place;
  const selectedClass = selected ? ' is-selected' : '';

  return L.divIcon({
    className: 'planli-marker-wrap',
    html: `<div class="planli-marker-bubble${selectedClass}" style="--marker-color:${visual.color}"><span class="planli-marker-glyph">&#${iconCode};</span><span class="planli-marker-tail"></span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}

function FitBounds({ coordinates, enabled }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || !coordinates?.length) return;
    try {
      const bounds = L.latLngBounds(coordinates);
      map.fitBounds(bounds, { padding: [40, 40] });
    } catch {
      // Keep the existing viewport if Leaflet rejects malformed bounds.
    }
  }, [coordinates, enabled, map]);

  return null;
}

function CenterOnPoint({ center, zoom, enabled }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled || !center) return;
    try {
      map.setView(center, zoom, { animate: true });
    } catch {
      // Keep the existing viewport if geolocation is no longer valid.
    }
  }, [center, enabled, zoom, map]);
  return null;
}

function ClearSelectionOnMapPress({ onClear }) {
  useMapEvents({ click: onClear });
  return null;
}

function PositionAttribution() {
  const map = useMap();
  useEffect(() => {
    map.attributionControl?.setPosition?.('topright');
  }, [map]);
  return null;
}

export default function CommunityInlineMap({
  recommendations,
  focusOnPins = false,
  onOpenRecommendation,
  overlayBottomInset = 16,
}) {
  const mapItems = useMemo(
    () => normalizeRecommendationMapItems(recommendations).slice(0, MAX_MARKERS_RENDER),
    [recommendations]
  );
  const [selectedRecommendationId, setSelectedRecommendationId] = useState(null);
  const [userCenter, setUserCenter] = useState(null);
  const [iconFontReady, setIconFontReady] = useState(false);

  const selectedMapItem = useMemo(
    () => mapItems.find((entry) => entry.id === selectedRecommendationId) || null,
    [mapItems, selectedRecommendationId]
  );

  useEffect(() => {
    let active = true;
    MaterialIcons.loadFont()
      .catch(() => {})
      .finally(() => {
        if (active) setIconFontReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedRecommendationId || selectedMapItem) return;
    setSelectedRecommendationId(null);
  }, [selectedMapItem, selectedRecommendationId]);

  const markerPositions = useMemo(
    () => mapItems.map((entry) => [entry.coordinates.lat, entry.coordinates.lng]),
    [mapItems]
  );

  useEffect(() => {
    let cancelled = false;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return () => {};

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        const lat = position?.coords?.latitude;
        const lng = position?.coords?.longitude;
        if (Number.isFinite(lat) && Number.isFinite(lng)) setUserCenter([lat, lng]);
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 }
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={community.inlineMapWrap}>
      {mapItems.length === 0 ? (
        <View style={community.inlineMapEmpty}>
          <MaterialIcons name="location-off" size={36} color="#9CA3AF" />
          <Text style={community.inlineMapEmptyText}>
            אין כרגע המלצות עם מיקום במסננים שבחרת.
          </Text>
        </View>
      ) : (
        <View style={community.inlineLeafletMapWrap}>
          <MapContainer
            center={userCenter || [community.defaultMapRegion.latitude, community.defaultMapRegion.longitude]}
            zoom={userCenter ? 12 : 10}
            style={community.leafletMap}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <PositionAttribution />
            <CenterOnPoint center={userCenter} zoom={12} enabled={!focusOnPins} />
            <FitBounds coordinates={markerPositions} enabled={focusOnPins || !userCenter} />
            <ClearSelectionOnMapPress onClear={() => setSelectedRecommendationId(null)} />

            {mapItems.map((mapItem) => {
              const selected = mapItem.id === selectedRecommendationId;
              return (
                <Marker
                  key={`${mapItem.id}:${selected}:${iconFontReady}`}
                  position={[mapItem.coordinates.lat, mapItem.coordinates.lng]}
                  icon={createRecommendationMarkerIcon(mapItem.visual, selected)}
                  title={`${mapItem.title}, ${mapItem.visual.label}`}
                  alt={`${mapItem.title}, ${mapItem.visual.label}`}
                  keyboard
                  riseOnHover
                  zIndexOffset={selected ? 1000 : 0}
                  eventHandlers={{
                    click: () => setSelectedRecommendationId(mapItem.id),
                  }}
                />
              );
            })}
          </MapContainer>

        </View>
      )}

      {!!selectedMapItem && (
        <RecommendationMapPreviewCard
          item={selectedMapItem.recommendation}
          bottomInset={overlayBottomInset}
          onClose={() => setSelectedRecommendationId(null)}
          onOpenRecommendation={onOpenRecommendation}
        />
      )}
    </View>
  );
}

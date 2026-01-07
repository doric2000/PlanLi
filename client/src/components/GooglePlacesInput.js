import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { buttons, colors, common, googlePlacesInput, spacing } from '../styles';
import { searchCities } from '../services/LocationService';
import WebPortal from './WebPortal';

export default function GooglePlacesInput({
  onSelect,
  mode = 'google',
  value,
  onChangeValue,
  hasLocalResults,
  onRequestGoogleSearch,
  seedQuery,
}) {
  const isGoogleMode = mode === 'google';
  const isControlled = typeof value === 'string' && typeof onChangeValue === 'function';

  const [query, setQuery] = useState(value ?? '');
  const [predictions, setPredictions] = useState([]);
  const [showList, setShowList] = useState(false);
  const [loading, setLoading] = useState(false);

  const [settledQuery, setSettledQuery] = useState('');

  // Aggressive call reduction:
  // - Debounce (wait for user to pause typing)
  // - Cooldown (hard limit max request rate)
  // - Cache (reuse results for repeated queries)
  // - Abort in-flight requests when query changes
  const debounceTimer = useRef(null);
  const lastRequestedQuery = useRef('');
  const lastRequestAt = useRef(0);
  const cacheRef = useRef(new Map());
  const abortRef = useRef(null);

  const inputWrapperRef = useRef(null);
  const [dropdownAnchor, setDropdownAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const MIN_QUERY_LENGTH = 3;
  const DEBOUNCE_MS = 650;
  const COOLDOWN_MS = 1200;

  // Keep internal query in sync when controlled from above.
  useEffect(() => {
    if (!isControlled) return;
    setQuery(value);
  }, [isControlled, value]);

  // When switching to Google mode, optionally seed the query.
  useEffect(() => {
    if (!isGoogleMode) return;
    if (typeof seedQuery !== 'string') return;
    const next = seedQuery;
    // Even if the text didn't change, force opening the dropdown and
    // allow an immediate request when transitioning from filter->google.
    lastRequestedQuery.current = '';
    setShowList(true);
    if (next === query) return;
    setQuery(next);
  }, [isGoogleMode, seedQuery]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const handleTextChange = (text) => {
    if (isControlled) {
      onChangeValue(text);
    } else {
      setQuery(text);
    }
    setShowList(true);
  };

  // For developer filter mode: decide when "search ended" (debounced) so we can show the fallback button.
  useEffect(() => {
    if (isGoogleMode) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setSettledQuery(query.trim());
    }, 400);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [isGoogleMode, query]);

  useEffect(() => {
    if (!isGoogleMode) {
      setLoading(false);
      setPredictions([]);
      return;
    }

    const text = query.trim();

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!showList || text.length < MIN_QUERY_LENGTH) {
      if (abortRef.current) abortRef.current.abort();
      setPredictions([]);
      setLoading(false);
      return;
    }

    if (text === lastRequestedQuery.current) {
      return;
    }

    // Cache hit -> no network call
    const cached = cacheRef.current.get(text);
    if (cached) {
      setPredictions(cached);
      setLoading(false);
      lastRequestedQuery.current = text;
      return;
    }

    setLoading(true);

    const now = Date.now();
    const timeSinceLast = now - lastRequestAt.current;
    const delay = Math.max(DEBOUNCE_MS, timeSinceLast < COOLDOWN_MS ? COOLDOWN_MS - timeSinceLast : 0);

    debounceTimer.current = setTimeout(async () => {
      try {
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        lastRequestAt.current = Date.now();
        lastRequestedQuery.current = text;

        const results = await searchCities(text, { signal: abortRef.current.signal });
        cacheRef.current.set(text, results);
        setPredictions(results);
      } catch (e) {
        // Abort is expected when user keeps typing.
      } finally {
        setLoading(false);
      }
    }, delay);
  }, [isGoogleMode, query, showList]);

  const showDropdown = isGoogleMode && showList && query.trim().length >= MIN_QUERY_LENGTH;

  const shouldShowGoogleFallbackButton =
    !isGoogleMode &&
    typeof onRequestGoogleSearch === 'function' &&
    settledQuery.length >= MIN_QUERY_LENGTH &&
    hasLocalResults === false;

  // On web, zIndex often fails due to stacking contexts in ScrollView.
  // We position the dropdown using window coordinates.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!showDropdown) return;
    if (!inputWrapperRef.current?.measureInWindow) return;

    const timer = setTimeout(() => {
      inputWrapperRef.current.measureInWindow((x, y, width, height) => {
        if (typeof x === 'number' && typeof y === 'number' && typeof width === 'number' && typeof height === 'number') {
          setDropdownAnchor({ x, y, width, height });
        }
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [showDropdown, query]);

  const handleSelect = (place) => {
    if (isControlled) {
      onChangeValue(place.description);
    } else {
      setQuery(place.description);
    }
    setShowList(false);
    onSelect(place.place_id); // Pass the ID back to HomeScreen
  };

  return (
    <View style={googlePlacesInput.container}>
      {/* Input Field */}
      <View ref={inputWrapperRef} style={[common.homeSearchBar, googlePlacesInput.inputWrapper]}>
        <Ionicons
          name="search"
          size={20}
          color={colors.textSecondary}
          style={googlePlacesInput.searchIcon}
        />
        <TextInput
          style={[common.homeSearchInput, googlePlacesInput.input]}
          placeholder="חפש עיר..."
          value={query}
          onChangeText={handleTextChange}
          autoCorrect={false}
          autoCapitalize="none"
          placeholderTextColor={colors.placeholder}
        />
        {loading && (
          <ActivityIndicator
            size="small"
            color={colors.primary}
            style={googlePlacesInput.loader}
          />
        )}
      </View>

      {shouldShowGoogleFallbackButton && (
        <View style={googlePlacesInput.fallbackContainer}>
          <TouchableOpacity
            style={[buttons.primarySmall, googlePlacesInput.fallbackButton]}
            onPress={() => onRequestGoogleSearch(settledQuery)}
          >
            <Text style={[buttons.primarySmallText, googlePlacesInput.fallbackButtonText]}>
              חפש ב-Google
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Suggestions List */}
      {Platform.OS !== 'web' && showDropdown && (
        <View style={googlePlacesInput.listContainer}>
          {loading ? (
            <View style={googlePlacesInput.dropdownStatusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={googlePlacesInput.dropdownStatusText}>טוען...</Text>
            </View>
          ) : predictions.length > 0 ? (
            <ScrollView keyboardShouldPersistTaps="handled">
              {predictions.map((item) => (
                <TouchableOpacity
                  key={item.place_id}
                  style={googlePlacesInput.listItem}
                  onPress={() => handleSelect(item)}
                >
                  <Ionicons
                    name="location-outline"
                    size={18}
                    color={colors.textSecondary}
                    style={googlePlacesInput.locationIcon}
                  />
                  <Text style={googlePlacesInput.listText}>{item.description}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={googlePlacesInput.dropdownStatusRow}>
              <Ionicons name="search" size={16} color={colors.textSecondary} />
              <Text style={googlePlacesInput.dropdownStatusText}>לא נמצאו תוצאות</Text>
            </View>
          )}
        </View>
      )}

      {Platform.OS === 'web' && showDropdown && (
        <WebPortal>
          <View
            style={[
              googlePlacesInput.listContainer,
              {
                position: 'fixed',
                top: dropdownAnchor.y + dropdownAnchor.height + spacing.sm,
                left: dropdownAnchor.x,
                right: undefined,
                width: dropdownAnchor.width,
                zIndex: 100000,
              },
            ]}
          >
            {loading ? (
              <View style={googlePlacesInput.dropdownStatusRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={googlePlacesInput.dropdownStatusText}>טוען...</Text>
              </View>
            ) : predictions.length > 0 ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                {predictions.map((item) => (
                  <TouchableOpacity
                    key={item.place_id}
                    style={googlePlacesInput.listItem}
                    onPress={() => handleSelect(item)}
                  >
                    <Ionicons
                      name="location-outline"
                      size={18}
                      color={colors.textSecondary}
                      style={googlePlacesInput.locationIcon}
                    />
                    <Text style={googlePlacesInput.listText}>{item.description}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={googlePlacesInput.dropdownStatusRow}>
                <Ionicons name="search" size={16} color={colors.textSecondary} />
                <Text style={googlePlacesInput.dropdownStatusText}>לא נמצאו תוצאות</Text>
              </View>
            )}
          </View>
        </WebPortal>
      )}
    </View>
  );
}

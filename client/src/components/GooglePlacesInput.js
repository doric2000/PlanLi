import React, { useEffect, useRef, useState } from 'react';
import {
	ActivityIndicator,
	TouchableOpacity,
	View,
	ScrollView,
} from 'react-native';
import AppText from "./AppText";
import AppTextInput from "./AppTextInput";
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { buttons, colors, common, googlePlacesInput, spacing } from '../styles';
import { searchCities } from '../services/LocationService';
import WebPortal from './WebPortal';
import { compactDestinationText } from '../utils/destinationSearch';
import { locationErrorMessage } from '../utils/locationErrors';

export default function GooglePlacesInput({
  onSelect,
  mode = 'google',
  value,
  onChangeValue,
  hasLocalResults,
  onRequestGoogleSearch,
  seedQuery,
  localResults,
  idleLocalResults,
  idleLocalTitle = 'חיפושים אחרונים',
  onSelectLocal,
  localResultsLoading = false,
  googleFallbackDelayMs = 2000,
  googleSearchFn,
  placeholder = 'חפש עיר...',
  inputTestID,
  containerStyle,
  inputWrapperStyle,
  inputStyle,
  searchIconColor,
  searchIconStyle,
  placeholderTextColor,
  loaderColor,
  loaderStyle,
  rightAccessory,
  listContainerStyle,
}) {
  const isGoogleMode = mode === 'google';
  const isControlled = typeof value === 'string' && typeof onChangeValue === 'function';

  const normalizedLocalResults = Array.isArray(localResults) ? localResults : [];
  const normalizedIdleLocalResults = Array.isArray(idleLocalResults)
    ? idleLocalResults.slice(0, 5)
    : [];

  const [query, setQuery] = useState(value ?? '');
  const [predictions, setPredictions] = useState([]);
  const [showList, setShowList] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [settledQuery, setSettledQuery] = useState('');

  // In local-first mode, we only hit Google if:
  // - user stopped typing for googleFallbackDelayMs
  // - query is long enough
  // - no local matches
  const googleFallbackTimerRef = useRef(null);
  const [googleTriggerQuery, setGoogleTriggerQuery] = useState('');

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
  const blurTimerRef = useRef(null);

  const inputWrapperRef = useRef(null);
  const [dropdownAnchor, setDropdownAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const MIN_QUERY_LENGTH = 3;
  const DEBOUNCE_MS = 650;
  const COOLDOWN_MS = 1200;
  const LOCAL_MIN_QUERY_LENGTH = 2;

  const resolvedGoogleSearchFn = typeof googleSearchFn === 'function' ? googleSearchFn : searchCities;

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
    setSearchError(null);
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
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
      }
    };
  }, []);

  const handleTextChange = (text) => {
    setSearchError(null);
    if (isControlled) {
      onChangeValue(text);
    } else {
      setQuery(text);
    }
    setShowList(true);
  };

  const handleFocus = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    setInputFocused(true);
    setShowList(true);
  };

  const handleBlur = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => {
      setInputFocused(false);
      setShowList(false);
    }, 180);
  };

  const settleSearchAfterSelection = () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    if (googleFallbackTimerRef.current) {
      clearTimeout(googleFallbackTimerRef.current);
      googleFallbackTimerRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLoading(false);
    setSearchError(null);
    setPredictions([]);
    setGoogleTriggerQuery('');
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

  // Local-first: automatically enable Google fallback only after user stops typing for a while
  // and there are no local matches.
  useEffect(() => {
    const text = query.trim();
    const searchKey = compactDestinationText(text);

    if (googleFallbackTimerRef.current) {
      clearTimeout(googleFallbackTimerRef.current);
      googleFallbackTimerRef.current = null;
    }

    setGoogleTriggerQuery('');
    if (abortRef.current) abortRef.current.abort();
    setPredictions([]);
    setLoading(false);

    if (!showList) return;
    if (searchKey.length < MIN_QUERY_LENGTH) return;
    if (localResultsLoading) return;
    if (normalizedLocalResults.length > 0) return;
    if (typeof onSelect !== 'function') return;

    googleFallbackTimerRef.current = setTimeout(() => {
      setGoogleTriggerQuery(text);
    }, googleFallbackDelayMs);

    return () => {
      if (googleFallbackTimerRef.current) {
        clearTimeout(googleFallbackTimerRef.current);
        googleFallbackTimerRef.current = null;
      }
    };
  }, [query, showList, normalizedLocalResults.length, localResultsLoading, googleFallbackDelayMs, onSelect]);

  useEffect(() => {
    if (!isGoogleMode) {
      setLoading(false);
      setPredictions([]);
      return;
    }

    const text = googleTriggerQuery.trim();
    const searchKey = compactDestinationText(text);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!showList || searchKey.length < MIN_QUERY_LENGTH) {
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
    if (cached && cached.expiresAt > Date.now()) {
      setSearchError(null);
      setPredictions(cached.results);
      setLoading(false);
      lastRequestedQuery.current = text;
      return;
    }
    if (cached) cacheRef.current.delete(text);

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

        const results = await resolvedGoogleSearchFn(text, { signal: abortRef.current.signal });
        const providerExpiry = Date.parse(results?.[0]?.expiresAt || '');
        const expiresAt = Number.isFinite(providerExpiry)
          ? providerExpiry
          : Date.now() + (5 * 60 * 1000);
        cacheRef.current.set(text, { results, expiresAt });
        setSearchError(null);
        setPredictions(results);
      } catch (e) {
        if (e?.name !== 'AbortError') {
          lastRequestedQuery.current = '';
          setPredictions([]);
          setSearchError(locationErrorMessage(e));
        }
      } finally {
        setLoading(false);
      }
    }, delay);
  }, [isGoogleMode, googleTriggerQuery, showList]);

  const showIdleLocalResults =
    showList &&
    inputFocused &&
    query.trim().length === 0 &&
    normalizedIdleLocalResults.length > 0;

  const shouldShowAnyDropdown = showIdleLocalResults || (
    showList &&
    query.trim().length >= (
      localResultsLoading
        ? LOCAL_MIN_QUERY_LENGTH
        : (normalizedLocalResults.length > 0 ? LOCAL_MIN_QUERY_LENGTH : MIN_QUERY_LENGTH)
    )
  );

  const showDropdown = isGoogleMode && shouldShowAnyDropdown;

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
    settleSearchAfterSelection();
    if (isControlled) {
      onChangeValue(place.description);
    } else {
      setQuery(place.description);
    }
    setInputFocused(false);
    setShowList(false);
    onSelect(place.place_id); // Pass the ID back to HomeScreen
  };

  const handleSelectLocal = (city) => {
    settleSearchAfterSelection();
    const label = city?.name || city?.description || '';
    if (isControlled) {
      onChangeValue(label);
    } else {
      setQuery(label);
    }
    setInputFocused(false);
    setShowList(false);
    if (typeof onSelectLocal === 'function') {
      onSelectLocal(city);
    }
  };

  const handleSelectIdleLocal = (city) => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    settleSearchAfterSelection();
    setInputFocused(false);
    setShowList(false);
    if (typeof onSelectLocal === 'function') {
      onSelectLocal(city);
    }
  };

  return (
    <View style={[googlePlacesInput.container, containerStyle]}>
      {/* Input Field */}
      <View
        ref={inputWrapperRef}
        style={[common.homeSearchBar, googlePlacesInput.inputWrapper, inputWrapperStyle]}
      >
        <Ionicons
          name="search"
          size={20}
          color={searchIconColor || colors.textSecondary}
          style={[googlePlacesInput.searchIcon, searchIconStyle]}
        />
        <AppTextInput
          style={[common.homeSearchInput, googlePlacesInput.input, inputStyle]}
          placeholder={placeholder}
          value={query}
          onChangeText={handleTextChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoCorrect={false}
          autoCapitalize="none"
          placeholderTextColor={placeholderTextColor || colors.placeholder}
          testID={inputTestID}
        />
        {rightAccessory}
        {loading && (
          <ActivityIndicator
            testID="google-places-loading"
            size="small"
            color={loaderColor || colors.primary}
            style={[googlePlacesInput.loader, loaderStyle]}
          />
        )}
      </View>

      {shouldShowGoogleFallbackButton && (
        <View style={googlePlacesInput.fallbackContainer}>
          <TouchableOpacity
            style={[buttons.primarySmall, googlePlacesInput.fallbackButton]}
            onPress={() => onRequestGoogleSearch(settledQuery)}
          >
            <AppText style={[buttons.primarySmallText, googlePlacesInput.fallbackButtonText]}>
              חפש ב-Google
            </AppText>
          </TouchableOpacity>
        </View>
      )}

      {/* Suggestions List */}
      {Platform.OS !== 'web' && shouldShowAnyDropdown && (
        <View style={[googlePlacesInput.listContainer, listContainerStyle]}>
          {showIdleLocalResults ? (
            <ScrollView keyboardShouldPersistTaps="handled">
              <AppText style={googlePlacesInput.groupTitle}>{idleLocalTitle}</AppText>
              {normalizedIdleLocalResults.map((city) => (
                <TouchableOpacity
                  key={`recent:${city.countryId || 'country'}:${city.id || city.cityId}`}
                  testID={`recent-destination-${city.countryId || 'country'}-${city.id || city.cityId}`}
                  style={googlePlacesInput.listItem}
                  onPress={() => handleSelectIdleLocal(city)}
                >
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={colors.textSecondary}
                    style={googlePlacesInput.locationIcon}
                  />
                  <View style={{ flex: 1 }}>
                    <AppText style={googlePlacesInput.mainText} numberOfLines={1}>
                      {city.name || city.label}
                    </AppText>
                    {!!city.countryName && (
                      <AppText style={googlePlacesInput.subText} numberOfLines={1}>
                        {city.countryName}
                      </AppText>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : normalizedLocalResults.length > 0 ? (
            <ScrollView keyboardShouldPersistTaps="handled">
              {normalizedLocalResults.map((city) => (
                <TouchableOpacity
                  key={`${city.countryId || 'country'}:${city.id}`}
                  style={googlePlacesInput.listItem}
                  onPress={() => handleSelectLocal(city)}
                >
                  <Ionicons
                    name="location-outline"
                    size={18}
                    color={colors.textSecondary}
                    style={googlePlacesInput.locationIcon}
                  />
                  <View style={{ flex: 1 }}>
                    <AppText style={googlePlacesInput.mainText} numberOfLines={1}>
                      {city.name}
                    </AppText>
                    {!!city.description && (
                      <AppText style={googlePlacesInput.subText} numberOfLines={1}>
                        {city.description}
                      </AppText>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : localResultsLoading ? (
            <View style={googlePlacesInput.dropdownStatusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <AppText style={googlePlacesInput.dropdownStatusText}>טוען...</AppText>
            </View>
          ) : loading ? (
            <View style={googlePlacesInput.dropdownStatusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <AppText style={googlePlacesInput.dropdownStatusText}>טוען...</AppText>
            </View>
          ) : searchError ? (
            <View style={googlePlacesInput.dropdownStatusRow}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.error || '#991B1B'} />
              <AppText style={googlePlacesInput.dropdownStatusText}>{searchError}</AppText>
            </View>
          ) : predictions.length > 0 ? (
            <ScrollView keyboardShouldPersistTaps="handled">
              {predictions.map((item) => (
                <TouchableOpacity
                  key={item.place_id}
                  testID={`google-place-result-${item.place_id}`}
                  style={googlePlacesInput.listItem}
                  onPress={() => handleSelect(item)}
                >
                  <Ionicons
                    name="location-outline"
                    size={18}
                    color={colors.textSecondary}
                    style={googlePlacesInput.locationIcon}
                  />
                  <AppText style={googlePlacesInput.listText}>{item.description}</AppText>
                </TouchableOpacity>
              ))}
              <AppText style={googlePlacesInput.googleAttribution}>Google Maps</AppText>
            </ScrollView>
          ) : (
            <View style={googlePlacesInput.dropdownStatusRow}>
              <Ionicons name="search" size={16} color={colors.textSecondary} />
              <AppText style={googlePlacesInput.dropdownStatusText}>לא נמצאו תוצאות</AppText>
            </View>
          )}
        </View>
      )}

      {Platform.OS === 'web' && showDropdown && (
        <WebPortal>
          <View
            style={[
              googlePlacesInput.listContainer,
              listContainerStyle,
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
            {showIdleLocalResults ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                <AppText style={googlePlacesInput.groupTitle}>{idleLocalTitle}</AppText>
                {normalizedIdleLocalResults.map((city) => (
                  <TouchableOpacity
                    key={`recent:${city.countryId || 'country'}:${city.id || city.cityId}`}
                    testID={`recent-destination-${city.countryId || 'country'}-${city.id || city.cityId}`}
                    style={googlePlacesInput.listItem}
                    onPress={() => handleSelectIdleLocal(city)}
                  >
                    <Ionicons
                      name="time-outline"
                      size={18}
                      color={colors.textSecondary}
                      style={googlePlacesInput.locationIcon}
                    />
                    <View style={{ flex: 1 }}>
                      <AppText style={googlePlacesInput.mainText} numberOfLines={1}>
                        {city.name || city.label}
                      </AppText>
                      {!!city.countryName && (
                        <AppText style={googlePlacesInput.subText} numberOfLines={1}>
                          {city.countryName}
                        </AppText>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : normalizedLocalResults.length > 0 ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                {normalizedLocalResults.map((city) => (
                  <TouchableOpacity
                    key={`${city.countryId || 'country'}:${city.id}`}
                    style={googlePlacesInput.listItem}
                    onPress={() => handleSelectLocal(city)}
                  >
                    <Ionicons
                      name="location-outline"
                      size={18}
                      color={colors.textSecondary}
                      style={googlePlacesInput.locationIcon}
                    />
                    <View style={{ flex: 1 }}>
                      <AppText style={googlePlacesInput.mainText} numberOfLines={1}>
                        {city.name}
                      </AppText>
                      {!!city.description && (
                        <AppText style={googlePlacesInput.subText} numberOfLines={1}>
                          {city.description}
                        </AppText>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : localResultsLoading ? (
              <View style={googlePlacesInput.dropdownStatusRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <AppText style={googlePlacesInput.dropdownStatusText}>טוען...</AppText>
              </View>
            ) : loading ? (
              <View style={googlePlacesInput.dropdownStatusRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <AppText style={googlePlacesInput.dropdownStatusText}>טוען...</AppText>
              </View>
            ) : searchError ? (
              <View style={googlePlacesInput.dropdownStatusRow}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.error || '#991B1B'} />
                <AppText style={googlePlacesInput.dropdownStatusText}>{searchError}</AppText>
              </View>
            ) : predictions.length > 0 ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                {predictions.map((item) => (
                  <TouchableOpacity
                    key={item.place_id}
                    testID={`google-place-result-${item.place_id}`}
                    style={googlePlacesInput.listItem}
                    onPress={() => handleSelect(item)}
                  >
                    <Ionicons
                      name="location-outline"
                      size={18}
                      color={colors.textSecondary}
                      style={googlePlacesInput.locationIcon}
                    />
                    <AppText style={googlePlacesInput.listText}>{item.description}</AppText>
                  </TouchableOpacity>
                ))}
                <AppText style={googlePlacesInput.googleAttribution}>Google Maps</AppText>
              </ScrollView>
            ) : (
              <View style={googlePlacesInput.dropdownStatusRow}>
                <Ionicons name="search" size={16} color={colors.textSecondary} />
                <AppText style={googlePlacesInput.dropdownStatusText}>לא נמצאו תוצאות</AppText>
              </View>
            )}
          </View>
        </WebPortal>
      )}
    </View>
  );
}

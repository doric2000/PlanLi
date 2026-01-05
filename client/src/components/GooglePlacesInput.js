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
import { colors, common, googlePlacesInput } from '../styles';
import { searchCities } from '../services/LocationService';

export default function GooglePlacesInput({ onSelect }) {
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState([]);
  const [showList, setShowList] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Timeout for debouncing (preventing too many API calls)
  const debounceTimer = useRef(null);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  const handleTextChange = (text) => {
    setQuery(text);
    setShowList(true);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (text.length < 2) {
      setPredictions([]);
      return;
    }

    setLoading(true);
    debounceTimer.current = setTimeout(async () => {
      const results = await searchCities(text);
      setPredictions(results);
      setLoading(false);
    }, 400); // Wait 400ms after typing stops
  };

  const handleSelect = (place) => {
    setQuery(place.description); // Update input to show selected name
    setShowList(false);
    onSelect(place.place_id); // Pass the ID back to HomeScreen
  };

  return (
    <View style={googlePlacesInput.container}>
      {/* Input Field */}
      <View style={[common.homeSearchBar, googlePlacesInput.inputWrapper]}>
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

      {/* Suggestions List */}
      {showList && predictions.length > 0 && (
        <View style={googlePlacesInput.listContainer}>
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
        </View>
      )}
    </View>
  );
}

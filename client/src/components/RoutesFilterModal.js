import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import FilterModal from "./FilterModal";
import { common, spacing } from "../styles";

// Single Source of Truth - Import all constants
import * as Constants from "../constants/Constants"; 
import ChipSelector from "../features/community/components/ChipSelector";
import { FormInput } from "./FormInput";
import MinMaxInputs from "./MinMaxInputs";

export default function RoutesFilterModal({ visible, onClose, filters, onApply, onClear }) {
  const current = filters || {};

  // --- 1. Filter Values State ---
  const [tempQuery, setTempQuery] = useState('');
  const [tempDifficulty, setTempDifficulty] = useState(''); // Single Select (String)
  const [tempTravelStyle, setTempTravelStyle] = useState(''); // Single Select (String)
  const [tempRoadTripTags, setTempRoadTripTags] = useState([]); // Multi Select (Array)
  const [tempExperienceTags, setTempExperienceTags] = useState([]); // Multi Select (Array)
  
  const [tempMinDays, setTempMinDays] = useState('');
  const [tempMaxDays, setTempMaxDays] = useState('');
  const [tempMinDistance, setTempMinDistance] = useState('');
  const [tempMaxDistance, setTempMaxDistance] = useState('');

  // --- 2. UI State ---
  // Tracks which parent categories are expanded (using their Hebrew labels)
  const [activeDimensions, setActiveDimensions] = useState([]);

  // --- 3. Configuration Map ---
  // Connects Constant IDs to local state and data sources
  const DIMENSIONS_CONFIG = {
    difficulty: { 
      data: Constants.DIFFICULTY_TAGS, 
      state: tempDifficulty, 
      setter: setTempDifficulty, 
      isMulti: false 
    },
    style: { 
      data: Constants.TRAVEL_STYLE_TAGS, 
      state: tempTravelStyle, 
      setter: setTempTravelStyle, 
      isMulti: false 
    },
    roadtrip: { 
      data: Constants.ROAD_TRIP_TAGS, 
      state: tempRoadTripTags, 
      setter: setTempRoadTripTags, 
      isMulti: true 
    },
    experience: { 
      data: Constants.EXPERIENCE_TAGS, 
      state: tempExperienceTags, 
      setter: setTempExperienceTags, 
      isMulti: true 
    },
  };

  // --- 4. Sync Effect ---
  useEffect(() => {
    if (!visible) return;

    // A. Load values into local state
    setTempQuery(current.query || '');
    setTempDifficulty(current.difficulty || '');
    setTempTravelStyle(current.travelStyle || '');
    setTempRoadTripTags(Array.isArray(current.roadTripTags) ? current.roadTripTags : []);
    setTempExperienceTags(Array.isArray(current.experienceTags) ? current.experienceTags : []);
    setTempMinDays(current.minDays ?? '');
    setTempMaxDays(current.maxDays ?? '');
    setTempMinDistance(current.minDistance ?? '');
    setTempMaxDistance(current.maxDistance ?? '');

    // B. Restore UI State (Expand categories that have active values)
    const initialActive = [];
    Constants.ROUTE_PARENT_CATEGORIES.forEach(parent => {
      // Map parent IDs to the corresponding keys in the incoming filters object
      const keyMap = { 
        difficulty: current.difficulty, 
        style: current.travelStyle, 
        roadtrip: current.roadTripTags, 
        experience: current.experienceTags 
      };
      
      const val = keyMap[parent.id];
      // If value exists (non-empty string or non-empty array), expand the category
      if (val && (Array.isArray(val) ? val.length > 0 : val !== '')) {
        initialActive.push(parent.label);
      }
    });
    setActiveDimensions(initialActive);
  }, [visible, filters]);

  // --- 5. Handlers ---

  const handleApply = () => {
    const output = {};

    // Build clean output object - only include fields with actual values
    if (tempQuery.trim()) output.query = tempQuery.trim();
    if (tempDifficulty) output.difficulty = tempDifficulty;
    if (tempTravelStyle) output.travelStyle = tempTravelStyle;
    if (tempRoadTripTags.length > 0) output.roadTripTags = tempRoadTripTags;
    if (tempExperienceTags.length > 0) output.experienceTags = tempExperienceTags;
    
    if (tempMinDays !== "") output.minDays = tempMinDays;
    if (tempMaxDays !== "") output.maxDays = tempMaxDays;
    if (tempMinDistance !== "") output.minDistance = tempMinDistance;
    if (tempMaxDistance !== "") output.maxDistance = tempMaxDistance;

    onApply?.(output);
  };

  const toggleTag = (val, config) => {
    if (config.isMulti) {
      config.setter(prev => 
        prev.includes(val) ? prev.filter(i => i !== val) : [...prev, val]
      );
    } else {
      // Single select toggle logic
      config.setter(config.state === val ? '' : val);
    }
  };

  const toggleDimension = (label) => {
    setActiveDimensions(prev => 
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    );
  };

  return (
    <FilterModal
      visible={visible}
      title="מסננים"
      onClose={onClose}
      onClear={onClear}
      onApply={handleApply}
    >
      {/* Scrollable content to prevent overflow when all categories are open */}
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Free Text Search */}
        <View style={styles.section}>
          <Text style={[common.modalLabel, { textAlign: 'right' }]}>חיפוש חופשי</Text>
          <FormInput
            placeholder='חפש בכותרת / תיאור...'
            value={tempQuery}
            onChangeText={setTempQuery}
            textAlign="right"
          />
        </View>

        {/* Parent Category Selector */}
        <ChipSelector 
          label="מה תרצו לסנן?" 
          items={Constants.ROUTE_PARENT_CATEGORIES.map(d => d.label)} 
          selectedValue={activeDimensions} 
          onSelect={toggleDimension} 
          multiSelect={true} 
        />

        {/* Dynamic Sub-Categories Sections */}
        {activeDimensions.length > 0 && (
          <View style={styles.dynamicSection}>
            {Constants.ROUTE_PARENT_CATEGORIES.map(parent => {
              if (!activeDimensions.includes(parent.label)) return null;
              
              const config = DIMENSIONS_CONFIG[parent.id];
              if (!config) return null;

              // Ensure we only render strings, even if constants are objects
              const displayItems = config.data.map(item => 
                typeof item === 'object' ? item.label : item
              );

              return (
                <ChipSelector 
                  key={parent.id}
                  label={`בחר ${parent.label}`} 
                  items={displayItems} 
                  selectedValue={config.state} 
                  onSelect={(val) => toggleTag(val, config)} 
                  multiSelect={config.isMulti} 
                />
              );
            })}
          </View>
        )}

        {/* Numeric Ranges (Days and Distance) */}
        <View style={styles.rangeSection}>
          <MinMaxInputs
            label="טווח ימים"
            minValue={tempMinDays} maxValue={tempMaxDays}
            onChangeMin={setTempMinDays} onChangeMax={setTempMaxDays}
          />
          <MinMaxInputs
            label="טווח מרחק" unitSuffix='ק"מ'
            minValue={tempMinDistance} maxValue={tempMaxDistance}
            onChangeMin={setTempMinDistance} onChangeMax={setTempMaxDistance}
          />
        </View>
      </ScrollView>
    </FilterModal>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.md,
  },
  dynamicSection: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  rangeSection: {
    marginTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  scrollContent: {
    paddingBottom: spacing.md,
  }
});
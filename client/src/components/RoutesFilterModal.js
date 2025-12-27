import React, { useEffect, useState } from "react";
import { View, Text, TextInput } from "react-native";

import FilterModal from "./FilterModal";
import MinMaxInputs from "./MinMaxInputs";
import { TagSelector } from "./TagSelector";

import { common, spacing } from "../styles";
import {
  DIFFICULTY_TAGS,
  TRAVEL_STYLE_TAGS,
  ROAD_TRIP_TAGS,
  EXPERIENCE_TAGS,
} from "../constants/Constatns";



export default function RoutesFilterModal({
  visible,
  onClose,
  filters,
  onApply,
  onClear,
}) {
  const current = filters || {};

  const [tempQuery, setTempQuery] = useState('');
  const [tempDifficulty, setTempDifficulty] = useState('');
  const [tempTravelStyle, setTempTravelStyle] = useState('');
  const [tempRoadTripTags, setTempRoadTripTags] = useState([]);
  const [tempExperienceTags, setTempExperienceTags] = useState([]);
  const [tempMinDays, setTempMinDays] = useState('');
  const [tempMaxDays, setTempMaxDays] = useState('');
  const [tempMinDistance, setTempMinDistance] = useState('');
  const [tempMaxDistance, setTempMaxDistance] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTempQuery(current.query || '');
    setTempDifficulty(current.difficulty || '');
    setTempTravelStyle(current.travelStyle || '');
    setTempRoadTripTags(Array.isArray(current.roadTripTags) ? current.roadTripTags : []);
    setTempExperienceTags(Array.isArray(current.experienceTags) ? current.experienceTags : []);
    setTempMinDays(current.minDays ?? '');
    setTempMaxDays(current.maxDays ?? '');
    setTempMinDistance(current.minDistance ?? '');
    setTempMaxDistance(current.maxDistance ?? '');
  }, [visible]);

  const handleApply = () => {
    onApply?.({
      query: tempQuery,
      difficulty: tempDifficulty,
      travelStyle: tempTravelStyle,
      roadTripTags: tempRoadTripTags,
      experienceTags: tempExperienceTags,
      minDays: tempMinDays,
      maxDays: tempMaxDays,
      minDistance: tempMinDistance,
      maxDistance: tempMaxDistance,
    });
  };

  return (
    <FilterModal
      visible={visible}
      title="מסננים"
      tall
      onClose={onClose}
      onClear={onClear}
      onApply={handleApply}
    >
      <Text style={common.modalLabel}>חיפוש</Text>
      <TextInput
        style={[common.modalInput, { textAlign: 'right' }]}
        placeholder='חיפוש בכותרת / תיאור / מקומות / תגיות... (אפשר גם "תצפית, רומנטי")'
        value={tempQuery}
        onChangeText={setTempQuery}
      />

      <View style={{ marginTop: spacing.lg }}>
        <TagSelector label="רמת קושי" tags={DIFFICULTY_TAGS} selected={tempDifficulty} onSelect={setTempDifficulty} />
        <TagSelector label="סגנון טיול" tags={TRAVEL_STYLE_TAGS} selected={tempTravelStyle} onSelect={setTempTravelStyle} />
        <TagSelector label="תגיות רואדטריפ" tags={ROAD_TRIP_TAGS} selected={tempRoadTripTags} onSelect={setTempRoadTripTags} multi />
        <TagSelector label="חוויה" tags={EXPERIENCE_TAGS} selected={tempExperienceTags} onSelect={setTempExperienceTags} multi />
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <MinMaxInputs
          label="טווח ימים"
          minValue={tempMinDays}
          maxValue={tempMaxDays}
          onChangeMin={setTempMinDays}
          onChangeMax={setTempMaxDays}
        />

        <MinMaxInputs
          label="טווח מרחק"
          unitSuffix='ק"מ'
          minValue={tempMinDistance}
          maxValue={tempMaxDistance}
          onChangeMin={setTempMinDistance}
          onChangeMax={setTempMaxDistance}
        />
      </View>
    </FilterModal>
  );
}

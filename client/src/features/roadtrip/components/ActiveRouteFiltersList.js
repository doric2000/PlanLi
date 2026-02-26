import React from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../../../styles";

/**
 * Horizontal chips row that mirrors the community ActiveFiltersList visuals,
 * but supports the routes filter shape.
 */
const ActiveRouteFiltersList = ({ filters, onRemove }) => {
  const {
    query,
    difficulty,
    travelStyle,
    roadTripTags = [],
    experienceTags = [],
    minDays,
    maxDays,
    minDistance,
    maxDistance,
  } = filters || {};

  const hasFilters =
    query ||
    difficulty ||
    travelStyle ||
    roadTripTags.length > 0 ||
    experienceTags.length > 0 ||
    minDays ||
    maxDays ||
    minDistance ||
    maxDistance;

  if (!hasFilters) return null;

  const renderRangeChip = (label, minVal, maxVal, onClearMin, onClearMax) => {
    if (!minVal && !maxVal) return null;

    const text =
      minVal && maxVal
        ? `${label}: ${minVal}-${maxVal}`
        : minVal
        ? `${label}: מינימום ${minVal}`
        : `${label}: מקסימום ${maxVal}`;

    return (
      <View style={styles.chip}>
        <TouchableOpacity onPress={onClearMin && onClearMax ? onClearMin : onClearMax}>
          <Ionicons name="close-circle" size={18} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.chipText}>{text}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {query ? (
          <View style={styles.chip}>
            <TouchableOpacity onPress={() => onRemove?.("query")}>
              <Ionicons name="close-circle" size={18} color={colors.white} />
            </TouchableOpacity>
            <Text style={styles.chipText}>{query}</Text>
          </View>
        ) : null}

        {difficulty ? (
          <View style={styles.chip}>
            <TouchableOpacity onPress={() => onRemove?.("difficulty")}>
              <Ionicons name="close-circle" size={18} color={colors.white} />
            </TouchableOpacity>
            <Text style={styles.chipText}>{difficulty}</Text>
          </View>
        ) : null}

        {travelStyle ? (
          <View style={styles.chip}>
            <TouchableOpacity onPress={() => onRemove?.("travelStyle")}>
              <Ionicons name="close-circle" size={18} color={colors.white} />
            </TouchableOpacity>
            <Text style={styles.chipText}>{travelStyle}</Text>
          </View>
        ) : null}

        {roadTripTags.map((tag) => (
          <View key={`roadtrip-${tag}`} style={styles.chip}>
            <TouchableOpacity onPress={() => onRemove?.("roadTripTag", tag)}>
              <Ionicons name="close-circle" size={18} color={colors.white} />
            </TouchableOpacity>
            <Text style={styles.chipText}>#{tag}</Text>
          </View>
        ))}

        {experienceTags.map((tag) => (
          <View key={`experience-${tag}`} style={styles.chip}>
            <TouchableOpacity onPress={() => onRemove?.("experienceTag", tag)}>
              <Ionicons name="close-circle" size={18} color={colors.white} />
            </TouchableOpacity>
            <Text style={styles.chipText}>#{tag}</Text>
          </View>
        ))}

        {renderRangeChip(
          "ימים",
          minDays,
          maxDays,
          minDays ? () => onRemove?.("minDays") : null,
          maxDays ? () => onRemove?.("maxDays") : null
        )}

        {renderRangeChip(
          "מרחק",
          minDistance,
          maxDistance,
          minDistance ? () => onRemove?.("minDistance") : null,
          maxDistance ? () => onRemove?.("maxDistance") : null
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    flexDirection: "row-reverse",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  chipText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "600",
  },
});

export default ActiveRouteFiltersList;

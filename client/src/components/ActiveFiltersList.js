import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, activeFiltersListStyles as styles } from '../styles';

/**
 * Displays a horizontal list of currently active filters.
 * Now supports: destination, categories, tags, and budgets.
 * * @param {Object} filters - The current filters state { destination, categories, tags, budgets }
 * @param {Function} onRemove - Callback when a filter is removed (type, value)
 */
const ActiveFiltersList = ({ filters, onRemove }) => {
  // FIXED: Added tags to the existence check
  const hasFilters = 
    filters.destination || 
    (filters.categories?.length > 0) || 
    (filters.tags?.length > 0) || // Added this line
    (filters.budgets?.length > 0);

  if (!hasFilters) return null;

  return (
    <View style={styles.container}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
      >
        {/* 1. Destination Chip */}
        {filters.destination ? (
          <View style={styles.chip}>
            <TouchableOpacity onPress={() => onRemove('destination')}>
              <Ionicons name="close-circle" size={18} color={colors.white} />
            </TouchableOpacity>
            <Text style={styles.chipText}>{filters.destination}</Text>
          </View>
        ) : null}

        {/* 2. Category Chips */}
        {filters.categories?.map((cat) => (
          <View key={`cat-${cat}`} style={styles.chip}>
            <TouchableOpacity onPress={() => onRemove('category', cat)}>
              <Ionicons name="close-circle" size={18} color={colors.white} />
            </TouchableOpacity>
            <Text style={styles.chipText}>{cat}</Text>
          </View>
        ))}

        {/* 3. Tag Chips (Sub-categories) */}
        {filters.tags?.map((tag) => (
          <View key={`tag-${tag}`} style={styles.chip}>
            <TouchableOpacity onPress={() => onRemove('tag', tag)}>
              <Ionicons name="close-circle" size={18} color={colors.white} />
            </TouchableOpacity>
            <Text style={styles.chipText}>{tag}</Text>
          </View>
        ))}

        {/* 4. Budget Chips */}
        {filters.budgets?.map((budget) => (
          <View key={`budget-${budget}`} style={styles.chip}>
            <TouchableOpacity onPress={() => onRemove('budget', budget)}>
              <Ionicons name="close-circle" size={18} color={colors.white} />
            </TouchableOpacity>
            <Text style={styles.chipText}>{budget}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};



export default ActiveFiltersList;
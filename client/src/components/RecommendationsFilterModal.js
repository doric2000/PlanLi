import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import FilterModal from './FilterModal';
import { common, spacing } from '../styles';

// --- Import constants for hierarchical logic ---
import { PARENT_CATEGORIES, TAGS_BY_CATEGORY, PRICE_TAGS } from '../constants/Constants';

// --- Import Modular Components ---
import ChipSelector from '../features/community/components/ChipSelector';
import { FormInput } from './FormInput';

export default function RecommendationsFilterModal({
  visible,
  onClose,
  filters,
  onApply,
  onClear,
}) {
  const current = filters || {};

  // --- 1. Local State ---
  const [tempDestination, setTempDestination] = useState('');
  const [tempCategories, setTempCategories] = useState([]); // Stores parent category IDs
  const [tempTags, setTempTags] = useState([]);           // Stores sub-tag labels
  const [tempBudgets, setTempBudgets] = useState([]);

  // --- 2. Sync state when modal opens ---
  useEffect(() => {
    if (!visible) return;
    
    setTempDestination(current.destination || '');
    
    // Map Hebrew labels back to IDs for internal modal logic
    const initialCategoryIds = (current.categories || []).map(label => 
      PARENT_CATEGORIES.find(c => c.label === label)?.id
    ).filter(Boolean);
    
    setTempCategories(initialCategoryIds);
    setTempTags(Array.isArray(current.tags) ? current.tags : []);
    setTempBudgets(Array.isArray(current.budgets) ? current.budgets : []);
  }, [visible, filters]);

  // --- 3. Toggle Handlers ---

  const toggleCategory = (id) => {
    setTempCategories((prev) => {
      if (prev.includes(id)) {
        // Cleanup: Remove sub-tags belonging to this category when category is unselected
        const tagsToRemove = TAGS_BY_CATEGORY[id] || [];
        setTempTags(currentTags => currentTags.filter(t => !tagsToRemove.includes(t)));
        return prev.filter((i) => i !== id);
      }
      return [...prev, id];
    });
  };

  const toggleTag = (tag) => {
    setTempTags((prev) => 
      prev.includes(tag) ? prev.filter((i) => i !== tag) : [...prev, tag]
    );
  };

  const toggleBudget = (item) => {
    setTempBudgets((prev) => 
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  // --- 4. Final Apply Logic ---
  const handleApply = () => {
    // Map internal category IDs back to Hebrew Labels for the main screen bar
    const categoryLabels = tempCategories.map(id => 
      PARENT_CATEGORIES.find(c => c.id === id)?.label
    ).filter(Boolean);

    const finalFilters = {
      destination: tempDestination.trim(),
      categories: categoryLabels, // Sending labels (e.g., "טבע ומסלולים")
      tags: tempTags,             // Sending tags (e.g., "טיול רגלי")
      budgets: tempBudgets,
    };

    // DEBUG LOG: Verification of the payload sent back to the main screen
    console.log("PlanLi Debug - Modal Export:", JSON.stringify(finalFilters, null, 2));

    onApply?.(finalFilters);
  };

  return (
    <FilterModal
      visible={visible}
      title="סינון המלצות"
      onClose={onClose}
      onClear={onClear}
      onApply={handleApply}
    >
      {/* 5. ScrollView wrapper: Allows content to grow and ensures scrollability */}
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Destination Section */}
        <View style={styles.section}>
          <Text style={[common.modalLabel, { textAlign: 'right' }]}>יעד / עיר / מדינה</Text>
          <FormInput
            placeholder="תל אביב, יוון, תאילנד..."
            value={tempDestination}
            onChangeText={setTempDestination}
            textAlign="right"
          />
        </View>

        {/* Parent Category Selection */}
        <ChipSelector
          label="קטגוריה"
          items={PARENT_CATEGORIES.map(c => c.label)} 
          selectedValue={tempCategories.map(id => PARENT_CATEGORIES.find(c => c.id === id)?.label)} 
          onSelect={(label) => {
            const id = PARENT_CATEGORIES.find(c => c.label === label)?.id;
            toggleCategory(id);
          }}
          multiSelect={true}
        />

        {/* Dynamic Tags - Rendered based on selected parent categories */}
        {tempCategories.length > 0 && (
          <View style={styles.dynamicSection}>
            {tempCategories.map(catId => {
              const category = PARENT_CATEGORIES.find(c => c.id === catId);
              return (
                <ChipSelector
                  key={catId}
                  label={`תגיות ל${category?.label}`}
                  items={TAGS_BY_CATEGORY[catId]}
                  selectedValue={tempTags}
                  onSelect={toggleTag}
                  multiSelect={true}
                />
              );
            })}
          </View>
        )}

        {/* Budget Section */}
        <View style={styles.lastSection}>
          <ChipSelector
            label="תקציב"
            items={PRICE_TAGS}
            selectedValue={tempBudgets}
            onSelect={toggleBudget}
            multiSelect={true}
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
    marginTop: spacing.xs,
  },
  lastSection: {
    marginBottom: spacing.lg,
  },
  scrollContent: {
    paddingBottom: spacing.xl, // Extra padding ensures bottom content is not hidden
  }
});
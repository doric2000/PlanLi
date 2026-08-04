import React, { useEffect, useState } from 'react';
import FilterModal from './FilterModal';
import { common, spacing, recommendationsFilterModalStyles as styles } from '../styles';
import { View, Text, ScrollView, Dimensions } from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// --- Import constants for hierarchical logic ---
import { PARENT_CATEGORIES, POST_BUDGETS, TAG_OPTIONS_BY_CATEGORY } from '../constants/Constants';
import {
  normalizeBudgetId,
  normalizeCategoryId,
  normalizeTagIds,
} from '../constants/travelTaxonomy';
import { getBudgetTheme } from '../utils/getBudgetTheme';

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

    const initialCategoryIds = (current.categories || []).map(normalizeCategoryId).filter(Boolean);

    setTempCategories(initialCategoryIds);
    setTempTags(normalizeTagIds(current.tags));
    setTempBudgets((current.budgets || [])
      .map((value) => normalizeBudgetId(value, { allowFlexible: false }))
      .filter(Boolean));
  }, [visible, filters]);

  // --- 3. Toggle Handlers ---

  const toggleCategory = (id) => {
    setTempCategories((prev) => {
      if (prev.includes(id)) {
        // Cleanup: Remove sub-tags belonging to this category when category is unselected
        const tagsToRemove = (TAG_OPTIONS_BY_CATEGORY[id] || []).map((item) => item.id);
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
    const finalFilters = {
      destination: tempDestination.trim(),
      categories: tempCategories,
      tags: tempTags,
      budgets: tempBudgets,
    };

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
      style={styles.scrollWrapper}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      bounces={true}
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
                  items={(TAG_OPTIONS_BY_CATEGORY[catId] || []).map((item) => item.label)}
                  selectedValue={(TAG_OPTIONS_BY_CATEGORY[catId] || [])
                    .filter((item) => tempTags.includes(item.id))
                    .map((item) => item.label)}
                  onSelect={(label) => {
                    const tagId = (TAG_OPTIONS_BY_CATEGORY[catId] || [])
                      .find((item) => item.label === label)?.id;
                    if (tagId) toggleTag(tagId);
                  }}
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
            items={POST_BUDGETS.map((item) => item.postLabel)}
            selectedValue={POST_BUDGETS.filter((item) => tempBudgets.includes(item.value)).map((item) => item.postLabel)}
            onSelect={(label) => {
              const budgetId = POST_BUDGETS.find((item) => item.postLabel === label)?.value;
              if (budgetId) toggleBudget(budgetId);
            }}
            multiSelect={true}
            getItemTheme={getBudgetTheme}
          />
        </View>
      </ScrollView>
    </FilterModal>
  );
}

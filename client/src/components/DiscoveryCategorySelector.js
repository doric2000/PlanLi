import React, { useEffect, useMemo, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import AppText from "./AppText";
import { MaterialIcons } from '@expo/vector-icons';
import DiscoveryOptionGroup from './DiscoveryOptionGroup';
import {
  CATEGORIES,
  SERVICE_GROUPS,
  SERVICE_TAG_OPTIONS_BY_GROUP,
  TAG_OPTIONS_BY_CATEGORY,
} from '../constants/travelTaxonomy';
import { colors, discoveryFilterStyles as styles } from '../styles';
import { toggleDiscoveryCategory } from '../utils/progressiveDiscoveryFilters';

export default function DiscoveryCategorySelector({ filters, onChange }) {
  const selectedCategoryIds = Array.isArray(filters?.categoryIds) ? filters.categoryIds : [];
  const selectedSubcategoryIds = Array.isArray(filters?.subcategoryIds) ? filters.subcategoryIds : [];
  const [activeCategoryId, setActiveCategoryId] = useState(selectedCategoryIds[0] || '');
  const [activeServiceGroupId, setActiveServiceGroupId] = useState(SERVICE_GROUPS[0]?.value || '');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!selectedCategoryIds.length) {
      setActiveCategoryId('');
      return;
    }
    if (!selectedCategoryIds.includes(activeCategoryId)) setActiveCategoryId(selectedCategoryIds[0]);
  }, [activeCategoryId, selectedCategoryIds.join('|')]);

  useEffect(() => {
    if (activeCategoryId !== 'services') return;
    const selectedGroup = SERVICE_GROUPS.find((group) => (
      (SERVICE_TAG_OPTIONS_BY_GROUP[group.value] || []).some((tag) => selectedSubcategoryIds.includes(tag.id))
    ));
    if (selectedGroup && !SERVICE_GROUPS.some((group) => group.value === activeServiceGroupId && (
      SERVICE_TAG_OPTIONS_BY_GROUP[group.value] || []
    ).some((tag) => selectedSubcategoryIds.includes(tag.id)))) {
      setActiveServiceGroupId(selectedGroup.value);
    }
  }, [activeCategoryId, activeServiceGroupId, selectedSubcategoryIds.join('|')]);

  const activeCategory = CATEGORIES.find((category) => category.id === activeCategoryId);
  const activeSubcategories = useMemo(() => (
    activeCategoryId === 'services'
      ? SERVICE_TAG_OPTIONS_BY_GROUP[activeServiceGroupId] || []
      : TAG_OPTIONS_BY_CATEGORY[activeCategoryId] || []
  ), [activeCategoryId, activeServiceGroupId]);

  const toggleCategory = (categoryId) => {
    const wasSelected = selectedCategoryIds.includes(categoryId);
    const result = toggleDiscoveryCategory(filters, categoryId, 3);
    if (result.blocked) {
      setNotice('אפשר לבחור עד שלוש קטגוריות. הסירו קטגוריה כדי לבחור אחרת.');
      return;
    }
    if (!wasSelected) setActiveCategoryId(categoryId);
    setNotice(result.removedSubcategoryCount
      ? `הוסרו ${result.removedSubcategoryCount} תתי־קטגוריות שלא שייכות עוד לבחירה.`
      : '');
    onChange?.(result.filters);
  };

  const toggleSubcategory = (id) => {
    const current = selectedSubcategoryIds;
    onChange?.({
      ...filters,
      subcategoryIds: current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id].slice(0, 20),
    });
  };

  return (
    <View style={styles.categorySection}>
      <AppText style={styles.primarySectionTitle}>מה מחפשים?</AppText>
      <AppText style={styles.primarySectionHelper}>בחרו עד שלוש קטגוריות</AppText>
      <View style={styles.categoryGrid}>
        {CATEGORIES.map((category, index) => {
          const selected = selectedCategoryIds.includes(category.id);
          const disabled = !selected && selectedCategoryIds.length >= 3;
          return (
            <TouchableOpacity
              key={category.id}
              disabled={disabled}
              style={[
                styles.categoryTile,
                selected && styles.categoryTileSelected,
                disabled && styles.categoryTileDisabled,
              ]}
              onPress={() => toggleCategory(category.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected, disabled }}
              testID={`discovery-category-${index}`}
            >
              <MaterialIcons
                name={category.icon || 'place'}
                size={22}
                color={selected ? colors.white : colors.primary}
              />
              <AppText style={[styles.categoryTileText, selected && styles.categoryTileTextSelected]}>
                {category.label}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>
      {!!notice && <AppText style={styles.inlineNotice}>{notice}</AppText>}

      {!!selectedCategoryIds.length && (
        <View style={styles.subcategoryPanel}>
          {selectedCategoryIds.length > 1 && (
            <View style={styles.categoryTabs}>
              {selectedCategoryIds.map((categoryId) => {
                const category = CATEGORIES.find((item) => item.id === categoryId);
                const active = categoryId === activeCategoryId;
                return (
                  <TouchableOpacity
                    key={categoryId}
                    style={[styles.categoryTab, active && styles.categoryTabActive]}
                    onPress={() => setActiveCategoryId(categoryId)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    testID={`discovery-category-tab-${categoryId}`}
                  >
                    <AppText style={[styles.categoryTabText, active && styles.categoryTabTextActive]}>
                      {category?.label || categoryId}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {!!activeCategory && (
            <>
              <AppText style={styles.subcategoryTitle}>תתי־קטגוריות · {activeCategory.label}</AppText>
              {activeCategoryId === 'services' && (
                <View style={styles.serviceGroupTabs}>
                  {SERVICE_GROUPS.map((group) => {
                    const active = group.value === activeServiceGroupId;
                    const selectedCount = (SERVICE_TAG_OPTIONS_BY_GROUP[group.value] || [])
                      .filter((tag) => selectedSubcategoryIds.includes(tag.id)).length;
                    return (
                      <TouchableOpacity
                        key={group.value}
                        style={[styles.serviceGroupTab, active && styles.serviceGroupTabActive]}
                        onPress={() => setActiveServiceGroupId(group.value)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        testID={`discovery-service-group-${group.value}`}
                      >
                        <AppText style={[styles.serviceGroupTabText, active && styles.serviceGroupTabTextActive]}>
                          {group.label}{selectedCount ? ` (${selectedCount})` : ''}
                        </AppText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              <DiscoveryOptionGroup
                options={activeSubcategories}
                selectedIds={selectedSubcategoryIds}
                onToggle={toggleSubcategory}
                alwaysShowAll
                testIDPrefix={`discovery-subcategory-${activeCategoryId}`}
              />
            </>
          )}
        </View>
      )}
    </View>
  );
}

import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { tags as tagsStyle, spacing } from "../styles";

/**
 * TagSelector - A reusable component for selecting tags/categories.
 * 
 * This component displays a horizontal scrollable list of selectable tags.
 * Supports both single selection (radio-style) and multi-selection (checkbox-style).
 * 
 * USE THIS COMPONENT when users need to select categories, filters, or tags,
 * such as difficulty levels, travel styles, food categories, etc.
 * 
 * @param {string} label - Section label shown above the tags (optional)
 * @param {Array} tags - Array of tag strings to display, e.g. ['Easy', 'Medium', 'Hard']
 * @param {string|Array} selected - Currently selected tag(s). String for single, Array for multi.
 * @param {function} onSelect - Function called when selection changes
 * @param {boolean} multi - If true, allows selecting multiple tags (default: false)
 * 
 * @example
 * // Single selection (only one can be selected)
 * <TagSelector
 *   label="Difficulty"
 *   tags={['Easy', 'Medium', 'Hard']}
 *   selected={difficulty}
 *   onSelect={setDifficulty}
 * />
 * 
 * // Multi selection (multiple can be selected)
 * <TagSelector
 *   label="Interests"
 *   tags={['Nature', 'Food', 'Culture', 'Adventure']}
 *   selected={interests}
 *   onSelect={setInterests}
 *   multi={true}
 * />
 */
export const TagSelector = ({ 
    label, 
    tags, 
    selected, 
    onSelect, 
    multi = false 
}) => {
    
    const isSelected = (tag) => {
        if (multi) {
            return Array.isArray(selected) && selected.includes(tag);
        }
        return selected === tag;
    };

    const handlePress = (tag) => {
        if (multi) {
            const currentSelected = Array.isArray(selected) ? selected : [];
            if (currentSelected.includes(tag)) {
                onSelect(currentSelected.filter(t => t !== tag));
            } else {
                onSelect([...currentSelected, tag]);
            }
        } else {
            onSelect(tag);
        }
    };

    return (
        <View style={tagsStyle.container}>
            {label && <Text style={tagsStyle.sectionLabel}>{label}</Text>}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                    paddingLeft: spacing.screenHorizontal,
                    flexDirection: "row-reverse",
                }}
            >
                {tags.map((tag) => (
                    <TouchableOpacity
                        key={tag}
                        style={[
                            tagsStyle.chip,
                            isSelected(tag) && tagsStyle.chipSelected,
                        ]}
                        onPress={() => handlePress(tag)}
                    >
                        <Text
                            style={[
                                tagsStyle.chipText,
                                isSelected(tag) && tagsStyle.chipTextSelected,
                            ]}
                        >
                            {tag}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
};

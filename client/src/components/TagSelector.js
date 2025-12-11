import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { tags as tagsStyle, spacing } from "../styles";

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
                contentContainerStyle={{ paddingRight: spacing.screenHorizontal }}
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

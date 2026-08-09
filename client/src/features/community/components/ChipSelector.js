import React from 'react';
import { View, ScrollView } from 'react-native';
import AppText from "../../../components/AppText";
import CompactChip from '../../../components/CompactChip';
import { chipSelectorStyles as styles } from '../../../styles';

const ChipSelector = ({
  label,
  items,
  selectedValue,
  onSelect,
  multiSelect = false,
  getItemTheme,
  testIDPrefix,
  getItemTestId,
}) => {

  const safeItems = Array.isArray(items) ? items : []; 
  

  const isSelected = (item) => {
    if (multiSelect) {
      return Array.isArray(selectedValue) && selectedValue.includes(item);
    }
    return selectedValue === item;
  };

  return (
    <View style={styles.inputWrapper}>
      {label && <AppText style={styles.label}>{label}</AppText>}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipScroll}
      >
        {safeItems.map((item, index) => {
          const active = isSelected(item);
          const resolvedTestId = typeof getItemTestId === 'function'
            ? getItemTestId(item, index)
            : (testIDPrefix ? `${testIDPrefix}-${index}` : undefined);
          return (
            <CompactChip
              key={String(item)}
              label={item}
              selected={active}
              onPress={() => onSelect(item)}
              testID={resolvedTestId}
            />
          );
        })}
      </ScrollView>
    </View>
  );
};



export default ChipSelector;

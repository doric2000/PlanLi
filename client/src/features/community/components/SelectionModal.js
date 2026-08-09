import React from 'react';
import { Modal, View, TouchableOpacity, FlatList } from 'react-native';
import AppText from "../../../components/AppText";
import { Ionicons } from '@expo/vector-icons';
import { colors, selectionModalStyles as styles } from '../../../styles';


const SelectionModal = ({ 
  visible, 
  onClose, 
  title, 
  data, 
  onSelect, 
  selectedId,
  emptyText = "אין נתונים להצגה" 
}) => {
  
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
            <AppText style={styles.title}>{title}</AppText>
          </View>

          {/* List */}
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isSelected = selectedId === item.id;
              return (
                <TouchableOpacity
                  style={styles.item}
                  onPress={() => onSelect(item)}
                >
                  <AppText style={[styles.itemText, isSelected && styles.selectedText]}>
                    {item.name || item.id}
                  </AppText>
                  
                  {/* show checkmark if selected */}
                  {isSelected && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <AppText style={styles.emptyText}>{emptyText}</AppText>
            }
          />
        </View>
      </View>
    </Modal>
  );
};



export default SelectionModal;
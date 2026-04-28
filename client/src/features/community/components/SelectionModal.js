import React from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList } from 'react-native';
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
            <Text style={styles.title}>{title}</Text>
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
                  <Text style={[styles.itemText, isSelected && styles.selectedText]}>
                    {item.name || item.id}
                  </Text>
                  
                  {/* show checkmark if selected */}
                  {isSelected && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>{emptyText}</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
};



export default SelectionModal;
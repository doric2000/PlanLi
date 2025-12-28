import React from 'react';
import { 
  Modal, 
  View, 
  Text, 
  TouchableOpacity, 
  FlatList, 
  StyleSheet 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors} from '../../../styles';


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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxHeight: '70%',
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    padding: 5,
  },
  title: {
    flex: 1,
    textAlign: 'right',
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  item: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemText: {
    fontSize: 16,
    color: colors.text,
  },
  selectedText: {
    color: colors.primary,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    color: colors.muted,
    fontSize: 16,
  }
});

export default SelectionModal;
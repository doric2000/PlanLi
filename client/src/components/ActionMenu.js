import React from "react";
import { TouchableOpacity, Alert, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../styles";

export const ActionMenu = ({ onEdit, onDelete, title = "Manage", iconColor = colors.textLight }) => {
  const handleMenuPress = () => {
    Alert.alert(
      title,
      "Choose an action",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Edit", onPress: onEdit },
        { text: "Delete", onPress: onDelete, style: "destructive" },
      ]
    );
  };

  return (
    <TouchableOpacity onPress={handleMenuPress} style={styles.menuButton}>
      <Ionicons name="ellipsis-horizontal" size={24} color={iconColor} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  menuButton: {
    padding: 4,
  },
});

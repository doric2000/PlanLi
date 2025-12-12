import React from "react";
import { TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, common } from "../styles";

/**
 * ActionMenu - A reusable "..." menu button for edit/delete actions.
 * 
 * This component displays a three-dot icon that, when pressed, shows an
 * action sheet with Edit and Delete options.
 * 
 * USE THIS COMPONENT on cards or list items where users can manage content,
 * such as their own posts, routes, or recommendations.
 * 
 * @param {function} onEdit - Function to call when user selects "Edit"
 * @param {function} onDelete - Function to call when user selects "Delete"
 * @param {string} title - Title shown in the action sheet (default: "Manage")
 * @param {string} iconColor - Color of the three-dot icon (default: textLight)
 * 
 * @example
 * <ActionMenu
 *   onEdit={() => navigation.navigate('Edit', { id: item.id })}
 *   onDelete={() => handleDelete(item.id)}
 *   title="Manage Route"
 * />
 */
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
    <TouchableOpacity onPress={handleMenuPress} style={common.menuButton}>
      <Ionicons name="ellipsis-horizontal" size={24} color={iconColor} />
    </TouchableOpacity>
  );
};

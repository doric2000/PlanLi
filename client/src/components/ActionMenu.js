import React, { useState } from "react";
import { Modal, View, Text, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, actionMenuStyles as styles } from "../styles";

export const ActionMenu = ({
  onEdit,
  onDelete,
  title = "ניהול",
  iconColor = colors.primary,
}) => {
  const [visible, setVisible] = useState(false);

  const open = (e) => {
    // מונע דליפת טאץ' לכרטיס (שלא יפתח פרטים)
    if (e?.stopPropagation) e.stopPropagation();
    setVisible(true);
  };

  const close = () => setVisible(false);

  const run = async (fn) => {
    close();
    if (typeof fn === "function") {
      await fn();
    }
  };

  return (
    <>
      {/* כפתור 3 נקודות */}
      <Pressable
        onPress={open}
        hitSlop={12}
        style={styles.menuBtn}
        onStartShouldSetResponder={() => true}
      >
        <Ionicons name="ellipsis-horizontal" size={22} color={iconColor} />
      </Pressable>

      {/* Bottom Sheet */}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable
            style={styles.sheet}
            onPress={() => {}}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <Pressable onPress={close} hitSlop={10} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color="#111827" />
              </Pressable>
            </View>

            <Pressable style={styles.actionBtn} onPress={() => run(onEdit)}>
              <View style={styles.row}>
                <Ionicons name="create-outline" size={18} color="#111827" />
                <Text style={styles.actionText}>עריכה</Text>
              </View>
            </Pressable>

            <Pressable style={[styles.actionBtn, styles.destructiveBtn]} onPress={() => run(onDelete)}>
              <View style={styles.row}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
                <Text style={[styles.actionText, styles.destructiveText]}>מחיקה</Text>
              </View>
            </Pressable>

            <Pressable style={[styles.actionBtn, styles.cancelBtn]} onPress={close}>
              <Text style={styles.cancelText}>ביטול</Text>
            </Pressable>

            {Platform.OS === "ios" ? <View style={{ height: 6 }} /> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

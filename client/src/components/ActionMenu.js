import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../styles";

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

const styles = StyleSheet.create({
  menuBtn: {
    padding: 6,
    borderRadius: 999,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "white",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    textAlign: "right",
    flex: 1,
  },
  closeBtn: { padding: 6, marginLeft: 8 },

  actionBtn: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    marginBottom: 10,
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actionText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    textAlign: "right",
  },

  destructiveBtn: { backgroundColor: "#FEF2F2" },
  destructiveText: { color: "#EF4444" },

  cancelBtn: { backgroundColor: "#E5E7EB", marginBottom: 0 },
  cancelText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
    textAlign: "center",
  },
});

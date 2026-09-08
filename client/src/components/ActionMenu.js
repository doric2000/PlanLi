import React, { useRef, useState } from "react";
import { Modal, View, Pressable, Platform } from "react-native";
import AppText from "./AppText";
import { Ionicons } from "@expo/vector-icons";
import { colors, actionMenuStyles as styles } from "../styles";

export const ActionMenu = ({
  onEdit,
  onDelete,
  onReport,
  reportLabel = 'דיווח על התוכן',
  title = "ניהול",
  iconColor = colors.primary,
}) => {
  const [visible, setVisible] = useState(false);
  const pendingReport = useRef(null);

  if (!onEdit && !onDelete && !onReport) return null;

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

  const finishReportTransition = () => {
    const report = pendingReport.current;
    pendingReport.current = null;
    report?.();
  };

  const report = () => {
    pendingReport.current = onReport;
    close();
    // Native iOS cannot present the reporting sheet until this modal is dismissed.
    if (Platform.OS !== 'ios') finishReportTransition();
  };

  return (
    <>
      {/* כפתור 3 נקודות */}
      <Pressable
        onPress={open}
        hitSlop={12}
        style={styles.menuBtn}
        accessibilityRole="button"
        accessibilityLabel={title}
        testID="content-action-menu"
        onStartShouldSetResponder={() => true}
      >
        <Ionicons name="ellipsis-horizontal" size={22} color={iconColor} />
      </Pressable>

      {/* Bottom Sheet */}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={close} onDismiss={finishReportTransition}>
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable
            style={styles.sheet}
            onPress={() => {}}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.header}>
              <AppText style={styles.title}>{title}</AppText>
              <Pressable onPress={close} hitSlop={10} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color="#111827" />
              </Pressable>
            </View>

            {onEdit ? <Pressable accessibilityRole="button" style={styles.actionBtn} onPress={() => run(onEdit)}>
              <View style={styles.row}>
                <Ionicons name="create-outline" size={18} color="#111827" />
                <AppText style={styles.actionText}>עריכה</AppText>
              </View>
            </Pressable> : null}

            {onDelete ? <Pressable accessibilityRole="button" style={[styles.actionBtn, styles.destructiveBtn]} onPress={() => run(onDelete)}>
              <View style={styles.row}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
                <AppText style={[styles.actionText, styles.destructiveText]}>מחיקה</AppText>
              </View>
            </Pressable> : null}

            {onReport ? (
              <Pressable accessibilityRole="button" accessibilityLabel={reportLabel} style={styles.actionBtn} onPress={report}>
                <View style={styles.row}>
                  <Ionicons name="flag-outline" size={18} color={colors.primary} />
                  <AppText style={styles.actionText}>{reportLabel}</AppText>
                </View>
              </Pressable>
            ) : null}

            <Pressable style={[styles.actionBtn, styles.cancelBtn]} onPress={close}>
              <AppText style={styles.cancelText}>ביטול</AppText>
            </Pressable>

            {Platform.OS === "ios" ? <View style={{ height: 6 }} /> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

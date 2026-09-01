import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import { colors } from '../../../styles';
import { notificationCenterStyles as styles } from '../styles/notificationCenterStyles';

function SheetFrame({ visible, onClose, children, accessibilityLabel }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          accessible={false}
          onPress={onClose}
          style={styles.sheetBackdrop}
          testID="notification-sheet-backdrop"
        />
        <View
          accessible={false}
          accessibilityLabel={accessibilityLabel}
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={styles.sheet}
        >
          <View style={styles.sheetHandle} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

function SheetAction({ icon, label, onPress, destructive = false, busy = false, testID }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.sheetAction, pressed && styles.sheetActionPressed]}
      testID={testID}
    >
      {busy ? (
        <ActivityIndicator size="small" color={destructive ? colors.error : colors.brand} />
      ) : (
        <Ionicons name={icon} size={22} color={destructive ? colors.error : colors.brand} />
      )}
      <AppText style={[styles.sheetActionText, destructive && styles.destructiveText]}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function NotificationOverflowMenu({
  notification,
  visible,
  busy,
  onClose,
  onToggleRead,
  onDelete,
}) {
  if (!notification) return null;
  return (
    <SheetFrame visible={visible} onClose={onClose} accessibilityLabel="אפשרויות להתראה">
      <AppText style={styles.sheetTitle} numberOfLines={2}>אפשרויות להתראה</AppText>
      <SheetAction
        icon={notification.isRead ? 'mail-unread-outline' : 'checkmark-circle-outline'}
        label={notification.isRead ? 'סימון כלא נקראה' : 'סימון כנקראה'}
        onPress={onToggleRead}
        busy={busy}
        testID="notification-toggle-read"
      />
      <SheetAction
        icon="trash-outline"
        label="מחיקת ההתראה"
        onPress={onDelete}
        destructive
        busy={busy}
        testID="notification-delete"
      />
    </SheetFrame>
  );
}

export function NotificationChannelMenu({
  channelLabel,
  visible,
  readBusy,
  deleteBusy,
  unreadCount,
  itemCount,
  onClose,
  onMarkAllRead,
  onClear,
}) {
  return (
    <SheetFrame visible={visible} onClose={onClose} accessibilityLabel={`אפשרויות ${channelLabel}`}>
      <AppText style={styles.sheetTitle}>ניהול {channelLabel}</AppText>
      <SheetAction
        icon="checkmark-done-outline"
        label="סימון כל ההתראות כנקראו"
        onPress={onMarkAllRead}
        busy={readBusy}
        testID="notification-mark-all-read"
      />
      <SheetAction
        icon="trash-outline"
        label="מחיקת כל ההתראות בערוץ"
        onPress={onClear}
        destructive
        busy={deleteBusy}
        testID="notification-clear-channel"
      />
      {!unreadCount && !itemCount ? (
        <AppText style={styles.sheetMessage}>אין כרגע התראות לניהול בערוץ הזה.</AppText>
      ) : null}
    </SheetFrame>
  );
}

export function NotificationStatusSheet({ action, visible, onClose, onRetry }) {
  const primaryAction = action?.onAction || (action?.retryable ? onRetry : null);
  const primaryLabel = action?.actionLabel || (action?.retryable ? 'ניסיון נוסף' : '');
  return (
    <SheetFrame visible={visible} onClose={onClose} accessibilityLabel={action?.title || 'מצב ההתראה'}>
      <AppText style={styles.sheetTitle}>{action?.title || 'לא ניתן לפתוח את ההתראה'}</AppText>
      <AppText style={styles.sheetMessage}>
        {action?.message || 'אפשר לחזור להתראות ולנסות שוב מאוחר יותר.'}
      </AppText>
      {primaryAction && primaryLabel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          onPress={primaryAction}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.rowPressed]}
          testID={action?.actionTestID || 'notification-status-retry'}
        >
          <AppText style={styles.primaryButtonText}>{primaryLabel}</AppText>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="סגירה"
        onPress={onClose}
        style={({ pressed }) => [styles.closeButton, pressed && styles.rowPressed]}
        testID="notification-status-close"
      >
        <AppText style={styles.closeButtonText}>הבנתי</AppText>
      </Pressable>
    </SheetFrame>
  );
}

import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOperations } from './OperationState';
import { operationStore } from './operationService';
import { RESOLVED_STATES, selectBanner, SUCCESS_VISIBLE_MS, TERMINAL_STATES } from './operationModel';
import OperationCard, { OperationButton } from './OperationCard';
import OperationRegionAction from './OperationRegionAction';
import styles from '../../styles/operations';

export default function OperationBanner({ onActivity, onOpen, onChooseRegion, hidden: routeHidden = false }) {
  const { entries, active, noticeActive } = useOperations();
  const hidden = routeHidden || noticeActive;
  const insets = useSafeAreaInsets();
  const entry = selectBanner(entries);
  useEffect(() => {
    if (!entry || !active || hidden || !RESOLVED_STATES.has(entry.status)) return undefined;
    const started = Date.now();
    const remaining = SUCCESS_VISIBLE_MS - (entry.visibleMs || 0);
    const timer = setTimeout(() => {
      operationStore.update({ ...entry, visibleMs: SUCCESS_VISIBLE_MS, acknowledged: true }).catch(() => {});
    }, remaining);
    return () => {
      clearTimeout(timer);
      const current = operationStore.getSnapshot().find((value) => value.id === entry.id && value.ownerUid === entry.ownerUid);
      if (!current || current.acknowledged || current.status !== entry.status) return;
      operationStore.update({ ...current, visibleMs: Math.min(SUCCESS_VISIBLE_MS, (entry.visibleMs || 0) + Date.now() - started) }).catch(() => {});
    };
  }, [entry?.id, entry?.status, active, hidden]);
  if (!entry || hidden) return null;
  return <View style={[styles.banner, { bottom: Math.max(insets.bottom, 10) + 82 }]}
    accessibilityLiveRegion="polite" testID="operation-banner">
    <OperationCard entry={entry}>
      <View style={styles.actions}>
        <OperationRegionAction entry={entry} onChooseRegion={onChooseRegion} />
        <OperationButton onPress={onActivity} testID="operation-activity">הפעילות שלי</OperationButton>
        {TERMINAL_STATES.has(entry.status) && <OperationButton onPress={() => onOpen?.(entry)} testID="operation-open">צפייה</OperationButton>}
        {TERMINAL_STATES.has(entry.status) && <OperationButton
          onPress={() => operationStore.update({ ...entry, acknowledged: true, dismissed: true }).catch(() => {})}
          label="סגירת ההודעה, הפעולה נשארת בהיסטוריה" testID="operation-dismiss">סגירה</OperationButton>}
      </View>
    </OperationCard>
  </View>;
}

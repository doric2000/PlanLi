import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import AppText from '../../components/AppText';
import styles from '../../styles/operations';
import { OperationButton } from './OperationCard';
import { operationStore } from './operationService';

function DismissAttempt({ entry, children, testID, label }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const dismiss = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await operationStore.dismiss(entry.id, entry.ownerUid, entry);
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return <View>
    <OperationButton onPress={dismiss} busy={busy} testID={testID} label={label}>
      {failed ? 'ניסיון נוסף לסגירה' : children}
    </OperationButton>
    {failed && <AppText style={[styles.detail, styles.error]} accessibilityLiveRegion="polite">
      לא הצלחנו לשמור את סגירת ההודעה. אפשר לנסות שוב.
    </AppText>}
  </View>;
}

export default function OperationDismissButton(props) {
  const { entry } = props;
  return <DismissAttempt key={`${entry.ownerUid}:${entry.id}:${entry.attempt || 1}:${entry.status}`} {...props} />;
}

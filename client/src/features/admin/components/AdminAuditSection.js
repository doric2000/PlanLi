import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import AppText from '../../../components/AppText';
import { listModerationAudit } from '../../../services/AdminService';
import { adminStyles as styles } from '../../../styles';
import { safeAdminError } from '../adminErrors';
import { AUDIT_LABELS, formatRelativeAge } from '../adminLabels';
import AdminAction from './AdminAction';
import AdminAsyncState from './AdminAsyncState';

export default function AdminAuditSection() {
  const [state, setState] = useState({ loading: true, loadingMore: false, error: '', items: [], nextCursor: null });
  const load = useCallback(async ({ append = false } = {}) => {
    setState((current) => ({ ...current, loading: !append, loadingMore: append, error: '' }));
    try {
      const result = await listModerationAudit(append && state.nextCursor ? { cursor: state.nextCursor } : {});
      setState((current) => ({ loading: false, loadingMore: false, error: '', items: append ? [...current.items, ...(result.items || [])] : (result.items || []), nextCursor: result.nextCursor || null }));
    } catch (error) { setState((current) => ({ ...current, loading: false, loadingMore: false, error: safeAdminError(error) })); }
  }, [state.nextCursor]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View testID="admin-audit-content">
      <View style={styles.sectionHeading}><AppText style={styles.sectionTitle}>יומן פעילות</AppText><AppText style={styles.sectionDescription}>תיעוד כרונולוגי של החלטות, הקצאות, אכיפות ותהליכי מערכת.</AppText></View>
      <AdminAsyncState loading={state.loading} error={state.error} empty={!state.loading && !state.error && !state.items.length} onRetry={() => load()} testID="admin-audit" />
      {!state.loading && !state.error ? <View style={styles.auditList}>{state.items.map((item) => <View key={item.id} style={styles.auditRow}><View style={styles.timelineDot} /><View style={styles.auditBody}><View style={styles.row}><AppText style={styles.contextStrong}>{AUDIT_LABELS[item.action] || 'פעולת ניהול'}</AppText><AppText style={styles.helpText}>{formatRelativeAge(item.createdAt)}</AppText></View><AppText style={styles.body}>{item.reason || 'ללא פירוט נוסף'}</AppText><AppText style={styles.helpText}>בוצע על ידי {item.actorName || 'מערכת PlanLi'}</AppText></View></View>)}{state.nextCursor ? <AdminAction label="פעילות קודמת" busy={state.loadingMore} onPress={() => load({ append: true })} testID="admin-audit-load-more" /> : null}</View> : null}
    </View>
  );
}

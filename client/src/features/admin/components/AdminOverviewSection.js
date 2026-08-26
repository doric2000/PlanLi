import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import { getModerationDashboard } from '../../../services/AdminService';
import { adminStyles as styles } from '../../../styles';
import { safeAdminError } from '../adminErrors';
import AdminAsyncState from './AdminAsyncState';

const METRICS = Object.freeze([
  { key: 'openCases', label: 'דורש טיפול', view: 'needs_action', icon: 'file-tray-full-outline' },
  { key: 'urgentCases', label: 'דחופים', view: 'urgent', icon: 'alert-circle-outline', tone: 'urgent' },
  { key: 'overdueCases', label: 'באיחור', view: 'overdue', icon: 'timer-outline', tone: 'urgent' },
  { key: 'unassignedCases', label: 'לא מוקצים', view: 'unassigned', icon: 'person-add-outline' },
  { key: 'myCases', label: 'שלי', view: 'mine', icon: 'person-circle-outline' },
  { key: 'heldContent', label: 'תוכן מוחזק', view: 'held', icon: 'pause-circle-outline' },
  { key: 'pendingDestinations', label: 'בדיקות מקום', section: 'destinations', icon: 'location-outline' },
  { key: 'failedJobs', label: 'תהליכים שנכשלו', section: 'audit', icon: 'warning-outline', tone: 'urgent' },
]);

export default function AdminOverviewSection({ onNavigate }) {
  const [state, setState] = useState({ loading: true, error: '', data: null });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const data = await getModerationDashboard();
      setState({ loading: false, error: '', data });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: safeAdminError(error) }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const asyncState = <AdminAsyncState loading={state.loading} error={state.error} onRetry={load} testID="admin-overview" />;
  if (state.loading || state.error) return asyncState;

  return (
    <View testID="admin-overview-content">
      <View style={styles.sectionHeading}>
        <AppText style={styles.sectionTitle}>עבודה להיום</AppText>
        <AppText style={styles.sectionDescription}>תמונה תפעולית קצרה. כל כרטיס פותח את העבודה המדויקת שמאחוריו.</AppText>
      </View>
      <View style={styles.metrics}>
        {METRICS.map((metric) => (
          <Pressable
            key={metric.key}
            accessibilityRole="button"
            accessibilityLabel={`${metric.label}: ${state.data?.[metric.key] || 0}`}
            testID={`admin-metric-${metric.key}`}
            style={({ pressed }) => [styles.metric, metric.tone === 'urgent' && styles.metricUrgent, pressed && styles.cardPressed]}
            onPress={() => onNavigate(metric.section || 'queue', metric.view ? { view: metric.view } : undefined)}
          >
            <View style={styles.metricIcon}><Ionicons name={metric.icon} size={22} color={metric.tone === 'urgent' ? '#B42318' : '#3448C5'} /></View>
            <AppText style={styles.metricValue}>{state.data?.[metric.key] || 0}</AppText>
            <AppText style={styles.metricLabel}>{metric.label}</AppText>
            <AppText style={styles.metricLink}>פתיחת תור</AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

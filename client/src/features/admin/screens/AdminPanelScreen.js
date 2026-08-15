import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';

import AppText from '../../../components/AppText';
import { useAdminClaim } from '../../../hooks/useAdminClaim';
import { useBackButton } from '../../../hooks/useBackButton';
import {
  deleteUserAsAdmin,
  getModerationCase,
  getModerationDashboard,
  listAdminUsers,
  listModerationAudit,
  listModerationCases,
  listHeldContent,
  moderateContent,
  setUserAdmin,
  setUserEmailVerified,
  setUserSuspension,
} from '../../../services/AdminService';
import { adminStyles as styles, colors } from '../../../styles';
import { auth } from '../../../config/firebase';
import { safeAdminError } from '../adminErrors';

const TABS = [
  { id: 'overview', label: 'סקירה' },
  { id: 'reports', label: 'דיווחים' },
  { id: 'content', label: 'תוכן בהמתנה' },
  { id: 'users', label: 'משתמשים' },
  { id: 'audit', label: 'יומן פעילות' },
];
const TARGET_LABELS = { recommendation: 'המלצה', route: 'מסלול', trip: 'טיול', comment: 'תגובה', profile: 'פרופיל' };
const CATEGORY_LABELS = {
  inaccurate_or_unsafe_travel_info: 'מידע שגוי או מסוכן',
  spam_scam_commercial: 'ספאם או הונאה',
  harassment_hate_threat: 'הטרדה, שנאה או איום',
  nudity_sexual: 'תוכן מיני',
  child_safety: 'בטיחות ילדים',
  violence_dangerous_illegal: 'אלימות או סכנה',
  privacy_personal_data: 'פרטיות',
  copyright_image_rights: 'זכויות יוצרים',
  impersonation: 'התחזות',
  other: 'אחר',
};

function Action({ label, onPress, danger = false, disabled = false }) {
  return (
    <Pressable style={[styles.action, danger && styles.danger]} onPress={onPress} disabled={disabled}>
      <AppText style={[styles.actionText, danger && styles.dangerText]}>{label}</AppText>
    </Pressable>
  );
}

export default function AdminPanelScreen({ navigation }) {
  const { isAdmin, loading: adminLoading } = useAdminClaim();
  const [tab, setTab] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [cases, setCases] = useState([]);
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useBackButton(navigation, { title: '', color: colors.primary });
  useEffect(() => navigation.setOptions({ headerTitle: 'ניהול פלאן לי' }), [navigation]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !isAdmin) return undefined;
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => signOut(auth), 30 * 60 * 1000);
    };
    ['pointerdown', 'keydown', 'scroll'].forEach((event) => window.addEventListener(event, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      ['pointerdown', 'keydown', 'scroll'].forEach((event) => window.removeEventListener(event, reset));
    };
  }, [isAdmin]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError('');
    try {
      if (tab === 'overview') setDashboard(await getModerationDashboard());
      if (tab === 'reports') {
        const result = await listModerationCases(); setCases(result.items || []); setNextCursor(result.nextCursor || null);
      }
      if (tab === 'content') {
        const result = await listHeldContent(); setCases(result.items || []); setNextCursor(null);
      }
      if (tab === 'users') {
        const result = await listAdminUsers(activeQuery ? { query: activeQuery } : {}); setUsers(result.items || []); setNextCursor(result.nextCursor || null);
      }
      if (tab === 'audit') {
        const result = await listModerationAudit(); setAudit(result.items || []); setNextCursor(result.nextCursor || null);
      }
    } catch (loadError) {
      setError(safeAdminError(loadError));
    } finally {
      setLoading(false);
    }
  }, [activeQuery, isAdmin, tab]);

  useEffect(() => { load(); }, [load]);

  const askReason = (title, message, onConfirm, destructive = false) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const reason = window.prompt(`${title}\n${message}`);
      if (reason?.trim().length >= 3) onConfirm(reason.trim());
      else if (reason != null) setError('יש להזין סיבה קצרה לתיעוד.');
      return;
    }
    if (typeof Alert.prompt === 'function') {
      Alert.prompt(title, message, async (reason) => {
        if (reason?.trim().length < 3) return Alert.alert('חסרה סיבה', 'יש להזין סיבה קצרה לתיעוד.');
        await onConfirm(reason.trim());
      }, 'plain-text');
      return;
    }
    Alert.alert(title, `${message}\nהפעולה תירשם ביומן.`, [
      { text: 'ביטול', style: 'cancel' },
      { text: 'אישור', style: destructive ? 'destructive' : 'default', onPress: () => onConfirm('פעולת מנהל מאושרת') },
    ]);
  };

  const run = async (operation) => {
    setBusy(true);
    setError('');
    try {
      await operation();
      await load();
    } catch (operationError) {
      setError(safeAdminError(operationError));
    } finally {
      setBusy(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      if (tab === 'reports') {
        const result = await listModerationCases({ cursor: nextCursor }); setCases((current) => [...current, ...(result.items || [])]); setNextCursor(result.nextCursor || null);
      }
      if (tab === 'users' && !activeQuery) {
        const result = await listAdminUsers({ cursor: nextCursor }); setUsers((current) => [...current, ...(result.items || [])]); setNextCursor(result.nextCursor || null);
      }
      if (tab === 'audit') {
        const result = await listModerationAudit({ cursor: nextCursor }); setAudit((current) => [...current, ...(result.items || [])]); setNextCursor(result.nextCursor || null);
      }
    } catch (loadError) {
      setError(safeAdminError(loadError));
    } finally {
      setLoading(false);
    }
  };

  const moderate = (item, action) => askReason(
    action === 'restore' ? 'החזרת תוכן' : action === 'delete' ? 'מחיקה מלאה' : 'השארה בהמתנה',
    'כתבו סיבה ברורה להחלטה.',
    (reason) => run(() => moderateContent({
      ...(item.id?.startsWith('content_') ? {} : { caseId: item.id }),
      target: item.target,
      action,
      reason,
    })),
    action === 'delete'
  );

  const showReportDetails = async (item) => {
    setBusy(true);
    setError('');
    try {
      const details = await getModerationCase(item.id);
      const reportLines = (details.reports || []).slice(0, 20).map((report, index) => {
        const category = CATEGORY_LABELS[report.category] || 'אחר';
        const note = typeof report.details === 'string' && report.details.trim() ? ` — ${report.details.trim()}` : '';
        return `${index + 1}. ${category}${note}`;
      });
      const message = reportLines.length ? reportLines.join('\n') : 'לא נמצאו פרטי דיווח להצגה.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(message);
      else Alert.alert('פרטי הדיווחים', message);
    } catch (detailsError) {
      setError(safeAdminError(detailsError));
    } finally {
      setBusy(false);
    }
  };

  if (adminLoading) return <SafeAreaView style={styles.screen}><ActivityIndicator style={styles.loading} color={colors.primary} /></SafeAreaView>;
  if (!isAdmin) return <SafeAreaView style={styles.screen}><View style={styles.empty}><Ionicons name="lock-closed" size={42} color={colors.textSecondary} /><AppText style={styles.emptyText}>אין הרשאת מנהל לחשבון זה.</AppText></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <View style={styles.header}>
          <View><AppText style={styles.title}>מרכז הבקרה</AppText><AppText style={styles.subtitle}>דיווחים, תוכן, משתמשים ופעולות מנהל במקום אחד</AppText></View>
          {busy ? <ActivityIndicator color={colors.primary} /> : null}
        </View>
        <View style={styles.tabs}>
          {TABS.map((item) => <Pressable key={item.id} style={[styles.tab, tab === item.id && styles.tabActive]} onPress={() => setTab(item.id)}><AppText style={[styles.tabText, tab === item.id && styles.tabTextActive]}>{item.label}</AppText></Pressable>)}
        </View>
        {error ? <View style={styles.error}><AppText style={styles.errorText}>{error}</AppText></View> : null}
        {loading && !dashboard && !cases.length && !users.length ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : null}

        {tab === 'overview' && dashboard ? <View style={styles.metrics}>{[
          ['דיווחים פתוחים', dashboard.openCases], ['דחופים', dashboard.urgentCases], ['תוכן בהמתנה', dashboard.heldContent],
        ].map(([label, value]) => <View key={label} style={styles.metric}><AppText style={styles.metricValue}>{value ?? 0}</AppText><AppText style={styles.metricLabel}>{label}</AppText></View>)}</View> : null}

        {(tab === 'reports' || tab === 'content') && cases.map((item) => <View key={item.id} style={styles.card}>
          <View style={styles.row}><AppText style={styles.cardTitle}>{TARGET_LABELS[item.target?.type] || 'תוכן'} · {item.target?.id}</AppText><View style={styles.badge}><AppText style={styles.badgeText}>{item.priority === 'urgent' ? 'דחוף' : `${item.uniqueCount24h || 0} מדווחים`}</AppText></View></View>
          <AppText style={styles.body}>סטטוס: {item.status} · סך דיווחים: {item.reportCount || 0}</AppText>
          {item.categoryCounts ? <AppText style={styles.body}>{Object.entries(item.categoryCounts).filter(([, count]) => count > 0).map(([category, count]) => `${CATEGORY_LABELS[category] || category}: ${count}`).join(' · ')}</AppText> : null}
          <View style={styles.actions}>
            {tab === 'reports' ? <Action label="פרטי הדיווחים" onPress={() => showReportDetails(item)} disabled={busy} /> : null}
            <Action label="החזרה לפרסום" onPress={() => moderate(item, 'restore')} disabled={busy} />
            <Action label="השארה בהמתנה" onPress={() => moderate(item, 'hold')} disabled={busy} />
            <Action label="מחיקה מלאה" onPress={() => moderate(item, 'delete')} danger disabled={busy} />
          </View>
        </View>)}

        {tab === 'users' ? <>
          <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="חיפוש לפי אימייל או מזהה משתמש" autoCapitalize="none" onSubmitEditing={() => setActiveQuery(query.trim())} />
          <View style={styles.actions}><Action label="חיפוש" onPress={() => setActiveQuery(query.trim())} /><Action label="ניקוי" onPress={() => { setQuery(''); setActiveQuery(''); }} /></View>
          {users.map((item) => <View key={item.uid} style={styles.card}>
            <AppText style={styles.cardTitle}>{item.displayName || 'ללא שם'}</AppText><AppText style={styles.body}>{item.email || item.uid}</AppText>
            <AppText style={styles.body}>{item.disabled ? 'מושעה' : 'פעיל'} · {item.emailVerified ? 'אימייל מאומת' : 'אימייל לא מאומת'} · {item.admin ? 'מנהל' : 'משתמש'}</AppText>
            <View style={styles.actions}>
              <Action label={item.disabled ? 'ביטול השעיה' : 'השעיה'} danger={!item.disabled} disabled={busy} onPress={() => askReason('שינוי מצב משתמש', 'כתבו את סיבת הפעולה.', (reason) => run(() => setUserSuspension(item.uid, !item.disabled, reason)), !item.disabled)} />
              <Action label={item.emailVerified ? 'ביטול אימות' : 'אימות אימייל'} disabled={busy} onPress={() => askReason('שינוי אימות אימייל', 'כתבו את סיבת הפעולה.', (reason) => run(() => setUserEmailVerified(item.uid, !item.emailVerified, reason)))} />
              <Action label={item.admin ? 'הסרת מנהל' : 'מתן הרשאת מנהל'} disabled={busy} onPress={() => askReason('שינוי הרשאת מנהל', 'כתבו את סיבת הפעולה.', (reason) => run(() => setUserAdmin(item.uid, !item.admin, reason)), item.admin)} />
              <Action label="מחיקת משתמש מלאה" danger disabled={busy} onPress={() => askReason('מחיקת משתמש מלאה', 'פעולה זו מוחקת חשבון, תוכן ומדיה ואינה ניתנת לביטול.', (reason) => run(() => deleteUserAsAdmin(item.uid, reason)), true)} />
            </View>
          </View>)}
        </> : null}

        {tab === 'audit' && audit.map((item) => <View key={item.id} style={styles.card}><AppText style={styles.cardTitle}>{item.action}</AppText><AppText style={styles.body}>{item.reason}</AppText><AppText style={styles.body}>מנהל: {item.actorUid}</AppText></View>)}
        {nextCursor ? <Action label="טעינת פריטים נוספים" onPress={loadMore} disabled={loading} /> : null}
        {!loading && ((['reports', 'content'].includes(tab) && !cases.length) || (tab === 'audit' && !audit.length)) ? <View style={styles.empty}><AppText style={styles.emptyText}>אין פריטים להצגה כרגע.</AppText></View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

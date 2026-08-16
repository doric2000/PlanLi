import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';

import AppText from '../../../components/AppText';
import { useAdminClaim } from '../../../hooks/useAdminClaim';
import { useBackButton } from '../../../hooks/useBackButton';
import { useImagePickerWithUpload } from '../../../hooks/useImagePickerWithUpload';
import {
  approveDestination, deactivateDestination, deleteUserAsAdmin, getAirportCandidates,
  getDestinationImageCandidates, getDestinationReview, getModerationCase, getModerationDashboard,
  listAdminUsers, listDestinationReviews, listHeldContent, listModerationAudit, listModerationCases,
  moderateContent, recheckDestination, selectDestinationImageCandidate, setDestinationAirport,
  setDestinationUploadedImage, setUserAdmin, setUserEmailVerified, setUserSuspension,
} from '../../../services/AdminService';
import { adminStyles as styles, colors } from '../../../styles';
import { auth } from '../../../config/firebase';
import { safeAdminError } from '../adminErrors';
import ModerationTargetPreview from '../components/ModerationTargetPreview';

const TABS = [
  { id: 'overview', label: 'סקירה' }, { id: 'reports', label: 'דיווחים' },
  { id: 'content', label: 'תוכן בהמתנה' }, { id: 'destinations', label: 'בקרת ערים' },
  { id: 'users', label: 'משתמשים' }, { id: 'audit', label: 'יומן פעילות' },
];
const TARGET_LABELS = { recommendation: 'המלצה', route: 'מסלול', trip: 'טיול', comment: 'תגובה', profile: 'פרופיל' };
const CATEGORY_LABELS = {
  inaccurate_or_unsafe_travel_info: 'מידע שגוי או מסוכן', spam_scam_commercial: 'ספאם או הונאה',
  harassment_hate_threat: 'הטרדה, שנאה או איום', nudity_sexual: 'תוכן מיני', child_safety: 'בטיחות ילדים',
  violence_dangerous_illegal: 'אלימות או סכנה', privacy_personal_data: 'פרטיות',
  copyright_image_rights: 'זכויות יוצרים', impersonation: 'התחזות', other: 'אחר',
};
const INITIAL_TAB_STATE = Object.fromEntries(TABS.map(({ id }) => [id, { loading: false, loadingMore: false, error: '', nextCursor: null }]));

const DESTINATION_STATUS_ORDER = Object.freeze({ blocked: 0, open: 1, ready: 2, approved_with_warnings: 3, approved: 3, inactive: 4 });

function sortDestinationReviews(items) {
  return [...items].sort((left, right) => {
    const rank = (DESTINATION_STATUS_ORDER[left.status] ?? 2) - (DESTINATION_STATUS_ORDER[right.status] ?? 2);
    if (rank) return rank;
    return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
  });
}

function Action({ label, onPress, danger = false, disabled = false, busy = false, testID }) {
  const unavailable = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: unavailable }}
      testID={testID}
      style={({ pressed }) => [styles.action, danger && styles.danger, unavailable && styles.actionDisabled, pressed && !unavailable && styles.actionPressed]}
      onPress={onPress}
      disabled={unavailable}
    >
      {busy ? <ActivityIndicator size="small" color={danger ? '#B91C1C' : colors.primary} /> : null}
      <AppText style={[styles.actionText, danger && styles.dangerText]}>{busy ? `${label}…` : label}</AppText>
    </Pressable>
  );
}

function destinationFromDetails(previous, details) {
  const city = details?.city || {};
  const country = details?.country || {};
  const review = details?.review || {};
  return {
    ...previous,
    countryId: details?.countryId || previous.countryId,
    cityId: details?.cityId || previous.cityId,
    names: city.googleCache?.names || city.identity?.names || previous.names,
    countryNames: country.names || previous.countryNames,
    destinationStatus: city.status || previous.destinationStatus,
    status: city.status === 'inactive' ? 'inactive' : review.status || previous.status,
    issues: details?.issues || [],
    image: city.destinationImage || null,
    closestAirport: city.travelFacts?.closestAirport || null,
    recommendationCount: Math.max(0, Number(city.stats?.recommendationCount || 0)),
    job: details?.job || {},
  };
}

export default function AdminPanelScreen({ navigation }) {
  const { isAdmin, loading: adminLoading } = useAdminClaim();
  const [tab, setTab] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [reportCases, setReportCases] = useState([]);
  const [heldCases, setHeldCases] = useState([]);
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [reportDetails, setReportDetails] = useState({});
  const [expandedReports, setExpandedReports] = useState({});
  const [imageCandidates, setImageCandidates] = useState({});
  const [airportCandidates, setAirportCandidates] = useState({});
  const [query, setQuery] = useState('');
  const [tabState, setTabState] = useState(INITIAL_TAB_STATE);
  const [pendingActions, setPendingActions] = useState({});
  const [pendingScopes, setPendingScopes] = useState({});
  const [actionErrors, setActionErrors] = useState({});
  const pendingScopesRef = useRef({});
  const requestIds = useRef(Object.fromEntries(TABS.map(({ id }) => [id, 0])));
  const activeQueryRef = useRef('');
  const tabStateRef = useRef(INITIAL_TAB_STATE);
  const destinationUploader = useImagePickerWithUpload({ kind: 'route', aspect: [16, 9], normalizeToAspect: true, normalizeAspect: [16, 9] });

  const updateTabState = useCallback((targetTab, patch) => {
    setTabState((current) => {
      const next = { ...current, [targetTab]: { ...current[targetTab], ...patch } };
      tabStateRef.current = next;
      return next;
    });
  }, []);

  useBackButton(navigation, { title: '', color: colors.primary });
  useEffect(() => navigation.setOptions({ headerTitle: 'ניהול פלאן לי' }), [navigation]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !isAdmin) return undefined;
    let timer;
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => signOut(auth), 30 * 60 * 1000); };
    ['pointerdown', 'keydown', 'scroll'].forEach((event) => window.addEventListener(event, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      ['pointerdown', 'keydown', 'scroll'].forEach((event) => window.removeEventListener(event, reset));
    };
  }, [isAdmin]);

  const loadTab = useCallback(async (targetTab, { append = false, searchQuery = activeQueryRef.current } = {}) => {
    if (!isAdmin) return;
    const requestId = ++requestIds.current[targetTab];
    updateTabState(targetTab, append
      ? { loadingMore: true, error: '' }
      : { loading: true, loadingMore: false, error: '' });
    try {
      const cursor = append ? tabStateRef.current[targetTab]?.nextCursor : null;
      if (targetTab === 'overview') {
        const result = await getModerationDashboard();
        if (requestIds.current[targetTab] === requestId) setDashboard(result);
      } else if (targetTab === 'reports') {
        const result = await listModerationCases(cursor ? { cursor } : {});
        if (requestIds.current[targetTab] !== requestId) return;
        if (!append) {
          setReportDetails({});
          setExpandedReports({});
        }
        setReportCases((current) => append ? [...current, ...(result.items || [])] : (result.items || []));
        updateTabState(targetTab, { nextCursor: result.nextCursor || null });
      } else if (targetTab === 'content') {
        const result = await listHeldContent();
        if (requestIds.current[targetTab] !== requestId) return;
        setHeldCases(result.items || []);
        updateTabState(targetTab, { nextCursor: null });
      } else if (targetTab === 'destinations') {
        const result = await listDestinationReviews(cursor ? { cursor } : {});
        if (requestIds.current[targetTab] !== requestId) return;
        setDestinations((current) => sortDestinationReviews(append ? [...current, ...(result.items || [])] : (result.items || [])));
        updateTabState(targetTab, { nextCursor: result.nextCursor || null });
      } else if (targetTab === 'users') {
        const payload = searchQuery ? { query: searchQuery } : (cursor ? { cursor } : {});
        const result = await listAdminUsers(payload);
        if (requestIds.current[targetTab] !== requestId) return;
        setUsers((current) => append ? [...current, ...(result.items || [])] : (result.items || []));
        updateTabState(targetTab, { nextCursor: result.nextCursor || null });
      } else if (targetTab === 'audit') {
        const result = await listModerationAudit(cursor ? { cursor } : {});
        if (requestIds.current[targetTab] !== requestId) return;
        setAudit((current) => append ? [...current, ...(result.items || [])] : (result.items || []));
        updateTabState(targetTab, { nextCursor: result.nextCursor || null });
      }
    } catch (loadError) {
      if (requestIds.current[targetTab] === requestId) updateTabState(targetTab, { error: safeAdminError(loadError) });
    } finally {
      if (requestIds.current[targetTab] === requestId) updateTabState(targetTab, append ? { loadingMore: false } : { loading: false });
    }
  }, [isAdmin, updateTabState]);

  useEffect(() => { loadTab(tab); }, [loadTab, tab]);

  const setInlineError = (scope, message) => setActionErrors((current) => ({ ...current, [scope]: message }));

  const askReason = (title, message, onConfirm, destructive = false, errorScope = tab) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const reason = window.prompt(`${title}\n${message}`);
      if (reason?.trim().length >= 3) onConfirm(reason.trim());
      else if (reason != null) setInlineError(errorScope, 'יש להזין סיבה קצרה לתיעוד.');
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

  const runAction = async ({ key, scope = key, operation, onSuccess, releaseBeforeSuccess = false }) => {
    if (pendingScopesRef.current[scope]) return null;
    pendingScopesRef.current = { ...pendingScopesRef.current, [scope]: true };
    setPendingScopes(pendingScopesRef.current);
    setPendingActions((current) => ({ ...current, [key]: true }));
    setActionErrors((current) => ({ ...current, [scope]: '' }));
    let released = false;
    const release = () => {
      setPendingActions((current) => ({ ...current, [key]: false }));
      pendingScopesRef.current = { ...pendingScopesRef.current, [scope]: false };
      setPendingScopes(pendingScopesRef.current);
      released = true;
    };
    try {
      const result = await operation();
      if (releaseBeforeSuccess) release();
      if (onSuccess) await onSuccess(result);
      return result;
    } catch (operationError) {
      setInlineError(scope, safeAdminError(operationError, { operationMayContinue: true }));
      return null;
    } finally {
      if (!released) release();
    }
  };

  const refreshDestination = async (item) => {
    const details = await getDestinationReview(item.countryId, item.cityId);
    setDestinations((current) => sortDestinationReviews(
      current.map((entry) => entry.id === item.id ? destinationFromDetails(entry, details) : entry)
    ));
  };
  const runDestinationMutation = (item, actionName, operation) => runAction({
    key: `${actionName}:${item.id}`, scope: `destination:${item.id}`, operation, onSuccess: () => refreshDestination(item),
  });

  const moderate = (item, action) => askReason(
    action === 'dismiss'
      ? 'סגירת הדיווח'
      : action === 'restore'
        ? 'החזרת תוכן לפרסום'
        : action === 'delete'
          ? 'מחיקה מלאה'
          : 'הסרה זמנית מהפרסום',
    'כתבו סיבה ברורה להחלטה.',
    (reason) => runAction({
      key: `moderate:${item.id}:${action}`, scope: `case:${item.id}`,
      operation: () => moderateContent({ ...(item.id?.startsWith('content_') ? {} : { caseId: item.id }), target: item.target, action, reason }),
      onSuccess: () => tab === 'reports'
        ? setReportCases((current) => current.filter((entry) => entry.id !== item.id))
        : action === 'hold'
          ? undefined
          : setHeldCases((current) => current.filter((entry) => entry.id !== item.id)),
    }),
    action === 'delete', `case:${item.id}`
  );

  const toggleReportDetails = (item) => {
    if (expandedReports[item.id]) {
      setExpandedReports((current) => ({ ...current, [item.id]: false }));
      return;
    }
    if (reportDetails[item.id]) {
      setExpandedReports((current) => ({ ...current, [item.id]: true }));
      return;
    }
    runAction({
      key: `details:${item.id}`, scope: `case:${item.id}`, operation: () => getModerationCase(item.id),
      onSuccess: (details) => {
        setReportDetails((current) => ({ ...current, [item.id]: details }));
        setExpandedReports((current) => ({ ...current, [item.id]: true }));
      },
    });
  };

  const loadImageCandidates = (item) => runAction({
    key: `image-candidates:${item.id}`, scope: `destination:${item.id}`,
    operation: () => getDestinationImageCandidates(item.countryId, item.cityId),
    onSuccess: (result) => setImageCandidates((current) => ({ ...current, [item.id]: result.items || [] })),
  });
  const loadAirportCandidates = (item) => runAction({
    key: `airport-candidates:${item.id}`, scope: `destination:${item.id}`,
    operation: () => getAirportCandidates(item.countryId, item.cityId),
    onSuccess: (result) => setAirportCandidates((current) => ({ ...current, [item.id]: result.items || [] })),
  });
  const uploadDestinationImage = (item) => runAction({
    key: `pick-image:${item.id}`, scope: `destination:${item.id}`,
    releaseBeforeSuccess: true,
    operation: async () => {
      const uri = await destinationUploader.pickFromGallery();
      return uri ? destinationUploader.uploadImageAsset(uri) : null;
    },
    onSuccess: (asset) => {
      if (!asset) return;
      askReason('החלפת תמונת עיר', 'כתבו מדוע התמונה הידנית מתאימה לעיר.', (reason) => runAction({
        key: `upload-image:${item.id}`, scope: `destination:${item.id}`,
        operation: () => setDestinationUploadedImage(item.countryId, item.cityId, asset, reason, item.names?.he || item.names?.en || ''),
        onSuccess: () => refreshDestination(item),
      }), false, `destination:${item.id}`);
    },
  });

  const patchUser = (uid, patch) => setUsers((current) => current.map((item) => item.uid === uid ? { ...item, ...patch } : item));
  const searchUsers = () => { activeQueryRef.current = query.trim(); loadTab('users', { searchQuery: activeQueryRef.current }); };
  const currentState = tabState[tab];
  const currentCases = tab === 'reports' ? reportCases : heldCases;
  const currentItems = tab === 'reports' ? reportCases : tab === 'content' ? heldCases : tab === 'destinations' ? destinations : tab === 'users' ? users : tab === 'audit' ? audit : dashboard ? [dashboard] : [];

  if (adminLoading) return <SafeAreaView style={styles.screen}><ActivityIndicator style={styles.loading} color={colors.primary} /></SafeAreaView>;
  if (!isAdmin) return <SafeAreaView style={styles.screen}><View style={styles.empty}><Ionicons name="lock-closed" size={42} color={colors.textSecondary} /><AppText style={styles.emptyText}>אין הרשאת מנהל לחשבון זה.</AppText></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']} testID="admin-panel-screen">
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={currentState.loading} onRefresh={() => loadTab(tab)} />}>
        <View style={styles.header}><View><AppText style={styles.title}>מרכז הבקרה</AppText><AppText style={styles.subtitle}>דיווחים, תוכן, ערים ומשתמשים במקום אחד</AppText></View></View>
        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} testID={`admin-tab-${item.id}`} style={[styles.tab, tab === item.id && styles.tabActive]} onPress={() => setTab(item.id)}><AppText style={[styles.tabText, tab === item.id && styles.tabTextActive]}>{item.label}</AppText></Pressable>)}
        </View>
        {currentState.error ? <View style={styles.error} testID={`admin-${tab}-error`}><AppText style={styles.errorText}>{currentState.error}</AppText><Action label="ניסיון נוסף" testID={`admin-${tab}-retry`} onPress={() => loadTab(tab)} /></View> : null}
        {currentState.loading && !currentItems.length ? <View style={styles.stateBlock} testID={`admin-${tab}-loading`}><ActivityIndicator color={colors.primary} /><AppText style={styles.stateText}>טוען נתונים…</AppText></View> : null}

        {tab === 'overview' && dashboard ? <View style={styles.metrics}>{[['דיווחים פתוחים', dashboard.openCases], ['דחופים', dashboard.urgentCases], ['תוכן בהמתנה', dashboard.heldContent], ['ערים ממתינות לאישור', dashboard.pendingDestinations]].map(([label, value]) => <View key={label} style={styles.metric}><AppText style={styles.metricValue}>{value ?? 0}</AppText><AppText style={styles.metricLabel}>{label}</AppText></View>)}</View> : null}

        {(tab === 'reports' || tab === 'content') && currentCases.map((item) => {
          const available = item.targetPreview?.available !== false;
          const held = tab === 'content' || item.status === 'auto_held' || item.targetPreview?.status === 'moderation_hold';
          const details = reportDetails[item.id];
          return <View key={item.id} style={styles.card} testID={`admin-case-${item.id}`}>
          <View style={styles.row}><AppText style={styles.cardTitle}>{TARGET_LABELS[item.target?.type] || 'תוכן'}</AppText><View style={styles.badge}><AppText style={styles.badgeText}>{item.priority === 'urgent' ? 'דחוף' : `${item.uniqueCount24h || 0} מדווחים`}</AppText></View></View>
          <ModerationTargetPreview preview={item.targetPreview} />
          <AppText style={styles.technicalId}>מזהה טכני: {item.target?.id}</AppText>
          <AppText style={styles.body}>סטטוס: {item.status} · סך דיווחים: {item.reportCount || 0}</AppText>
          {item.categoryCounts ? <AppText style={styles.body}>{Object.entries(item.categoryCounts).filter(([, count]) => count > 0).map(([category, count]) => `${CATEGORY_LABELS[category] || category}: ${count}`).join(' · ')}</AppText> : null}
          {tab === 'reports' && expandedReports[item.id] ? <View style={styles.reportDetails} testID={`admin-case-details-panel-${item.id}`}>
            <AppText style={styles.cardTitle}>פרטי הדיווחים</AppText>
            {(details?.reports || []).length ? details.reports.map((report, index) => <View key={report.id || `${item.id}-${index}`} style={styles.reportDetailRow}>
              <AppText style={styles.body}>{index + 1}. {CATEGORY_LABELS[report.category] || 'אחר'}</AppText>
              {report.details?.trim() ? <AppText style={styles.reportDetailText}>{report.details.trim()}</AppText> : null}
            </View>) : <AppText style={styles.body}>לא נמצאו פרטים נוספים לדיווח.</AppText>}
          </View> : null}
          {actionErrors[`case:${item.id}`] ? <AppText style={styles.inlineError}>{actionErrors[`case:${item.id}`]}</AppText> : null}
          <View style={styles.actions}>
            {tab === 'reports' ? <Action label={expandedReports[item.id] ? 'הסתרת פרטי הדיווחים' : 'הצגת פרטי הדיווחים'} testID={`admin-case-details-${item.id}`} busy={pendingActions[`details:${item.id}`]} disabled={pendingScopes[`case:${item.id}`]} onPress={() => toggleReportDetails(item)} /> : null}
            {tab === 'reports' && available && !held ? <Action label="סגירת הדיווח — השארה בפרסום" testID={`admin-case-dismiss-${item.id}`} busy={pendingActions[`moderate:${item.id}:dismiss`]} disabled={pendingScopes[`case:${item.id}`]} onPress={() => moderate(item, 'dismiss')} /> : null}
            {available && held ? <Action label="החזרה לפרסום" testID={`admin-case-restore-${item.id}`} busy={pendingActions[`moderate:${item.id}:restore`]} disabled={pendingScopes[`case:${item.id}`]} onPress={() => moderate(item, 'restore')} /> : null}
            {tab === 'reports' && available && !held ? <Action label="הסרה זמנית מהפרסום" testID={`admin-case-hold-${item.id}`} busy={pendingActions[`moderate:${item.id}:hold`]} disabled={pendingScopes[`case:${item.id}`]} onPress={() => moderate(item, 'hold')} /> : null}
            {available ? <Action label="מחיקה מלאה" testID={`admin-case-delete-${item.id}`} busy={pendingActions[`moderate:${item.id}:delete`]} disabled={pendingScopes[`case:${item.id}`]} danger onPress={() => moderate(item, 'delete')} /> : null}
          </View>
        </View>})}

        {tab === 'destinations' && destinations.map((item) => <View key={item.id} style={styles.card} testID={`admin-destination-${item.id}`}>
          <View style={styles.row}><View><AppText style={styles.cardTitle}>{item.names?.he || item.names?.en || item.cityId}</AppText><AppText style={styles.body}>{item.countryNames?.he || item.countryId} · {item.countryId}/{item.cityId}</AppText></View><View style={styles.badge}><AppText style={styles.badgeText}>{item.status === 'blocked' ? 'חסום' : item.status === 'inactive' ? 'לא פעיל' : item.status === 'approved' ? 'מאושר' : item.status === 'approved_with_warnings' ? 'מאושר עם אזהרות' : 'לבדיקה'}</AppText></View></View>
          {item.image?.urls?.feed ? <Image source={{ uri: item.image.urls.feed }} style={styles.destinationImage} resizeMode="cover" /> : null}
          <AppText style={styles.body}>המלצות: {item.recommendationCount || 0} · שדה תעופה: {item.closestAirport?.iataCode || 'חסר'}</AppText>
          {(item.issues || []).map((issue) => <View key={issue.code} style={[styles.issue, issue.severity === 'error' && styles.issueError]}><AppText style={styles.body}>{issue.severity === 'error' ? 'שגיאה: ' : issue.severity === 'warning' ? 'אזהרה: ' : ''}{issue.label}</AppText></View>)}
          {actionErrors[`destination:${item.id}`] ? <AppText style={styles.inlineError}>{actionErrors[`destination:${item.id}`]}</AppText> : null}
          <View style={styles.actions}>
            <Action label="בדיקה חוזרת" testID={`admin-destination-recheck-${item.id}`} busy={pendingActions[`recheck:${item.id}`]} disabled={pendingScopes[`destination:${item.id}`]} onPress={() => runDestinationMutation(item, 'recheck', () => recheckDestination(item.countryId, item.cityId))} />
            <Action label="אישור העיר" testID={`admin-destination-approve-${item.id}`} busy={pendingActions[`approve:${item.id}`]} disabled={pendingScopes[`destination:${item.id}`] || item.status === 'blocked'} onPress={() => askReason('אישור עיר', 'כתבו את סיבת האישור.', (reason) => runDestinationMutation(item, 'approve', () => approveDestination(item.countryId, item.cityId, reason)), false, `destination:${item.id}`)} />
            <Action label="הצעות לתמונה" testID={`admin-destination-image-candidates-${item.id}`} busy={pendingActions[`image-candidates:${item.id}`]} disabled={pendingScopes[`destination:${item.id}`]} onPress={() => loadImageCandidates(item)} />
            <Action label="העלאת תמונה" testID={`admin-destination-upload-${item.id}`} busy={pendingActions[`pick-image:${item.id}`] || pendingActions[`upload-image:${item.id}`]} disabled={pendingScopes[`destination:${item.id}`]} onPress={() => uploadDestinationImage(item)} />
            <Action label="בחירת שדה תעופה" testID={`admin-destination-airports-${item.id}`} busy={pendingActions[`airport-candidates:${item.id}`]} disabled={pendingScopes[`destination:${item.id}`]} onPress={() => loadAirportCandidates(item)} />
            <Action label="השבתת העיר" testID={`admin-destination-deactivate-${item.id}`} busy={pendingActions[`deactivate:${item.id}`]} danger disabled={pendingScopes[`destination:${item.id}`] || item.destinationStatus === 'inactive'} onPress={() => askReason('השבתת עיר', 'התוכן המקושר יוסתר ויעבור לבדיקה.', (reason) => runDestinationMutation(item, 'deactivate', () => deactivateDestination(item.countryId, item.cityId, reason)), true, `destination:${item.id}`)} />
          </View>
          {(imageCandidates[item.id] || []).map((candidate) => <View key={candidate.id} style={styles.candidate}><Image source={{ uri: candidate.image?.urls?.feed }} style={styles.candidateImage} resizeMode="cover" /><AppText style={styles.body}>{candidate.image?.attribution?.providerName || 'מקור פנימי מאומת'}</AppText><Action label="בחירת התמונה" testID={`admin-image-candidate-${candidate.id}`} busy={pendingActions[`select-image:${item.id}:${candidate.id}`]} disabled={pendingScopes[`destination:${item.id}`]} onPress={() => askReason('בחירת תמונה', 'כתבו מדוע התמונה מתאימה לעיר.', (reason) => runAction({ key: `select-image:${item.id}:${candidate.id}`, scope: `destination:${item.id}`, operation: () => selectDestinationImageCandidate(item.countryId, item.cityId, candidate.id, reason), onSuccess: () => refreshDestination(item) }), false, `destination:${item.id}`)} /></View>)}
          {(airportCandidates[item.id] || []).map((airport) => <View key={airport.ident || airport.iataCode} style={styles.candidate}><AppText style={styles.cardTitle}>{airport.iataCode} · {airport.name}</AppText><AppText style={styles.body}>{airport.distanceKm} ק״מ מהעיר · מקור: מאגר שדות התעופה הפתוח</AppText><Action label="בחירת שדה התעופה" testID={`admin-airport-candidate-${airport.iataCode}`} busy={pendingActions[`select-airport:${item.id}:${airport.iataCode}`]} disabled={pendingScopes[`destination:${item.id}`]} onPress={() => askReason('בחירת שדה תעופה', 'כתבו את סיבת הבחירה.', (reason) => runAction({ key: `select-airport:${item.id}:${airport.iataCode}`, scope: `destination:${item.id}`, operation: () => setDestinationAirport(item.countryId, item.cityId, airport.iataCode, reason), onSuccess: () => refreshDestination(item) }), false, `destination:${item.id}`)} /></View>)}
        </View>)}

        {tab === 'users' ? <>
          <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="חיפוש לפי שם מלא, אימייל או מזהה משתמש" autoCapitalize="none" onSubmitEditing={searchUsers} testID="admin-user-search-input" />
          <View style={styles.actions}><Action label="חיפוש" testID="admin-user-search" busy={currentState.loading && users.length > 0} onPress={searchUsers} /><Action label="ניקוי" testID="admin-user-search-clear" onPress={() => { setQuery(''); activeQueryRef.current = ''; loadTab('users', { searchQuery: '' }); }} /></View>
          {users.map((item) => <View key={item.uid} style={styles.card} testID={`admin-user-${item.uid}`}>
            <AppText style={styles.cardTitle}>{item.displayName || 'ללא שם'}</AppText><AppText style={styles.body}>{item.email || item.uid}</AppText><AppText style={styles.body}>{item.disabled ? 'מושעה' : 'פעיל'} · {item.emailVerified ? 'אימייל מאומת' : 'אימייל לא מאומת'} · {item.admin ? 'מנהל' : 'משתמש'}</AppText>
            {actionErrors[`user:${item.uid}`] ? <AppText style={styles.inlineError}>{actionErrors[`user:${item.uid}`]}</AppText> : null}
            <View style={styles.actions}>
              <Action label={item.disabled ? 'ביטול השעיה' : 'השעיה'} testID={`admin-user-suspend-${item.uid}`} danger={!item.disabled} busy={pendingActions[`suspend:${item.uid}`]} disabled={pendingScopes[`user:${item.uid}`]} onPress={() => askReason('שינוי מצב משתמש', 'כתבו את סיבת הפעולה.', (reason) => runAction({ key: `suspend:${item.uid}`, scope: `user:${item.uid}`, operation: () => setUserSuspension(item.uid, !item.disabled, reason), onSuccess: (result) => patchUser(result.uid, { disabled: result.suspended }) }), !item.disabled, `user:${item.uid}`)} />
              <Action label={item.emailVerified ? 'ביטול אימות' : 'אימות אימייל'} testID={`admin-user-verify-${item.uid}`} busy={pendingActions[`verify:${item.uid}`]} disabled={pendingScopes[`user:${item.uid}`]} onPress={() => askReason('שינוי אימות אימייל', 'כתבו את סיבת הפעולה.', (reason) => runAction({ key: `verify:${item.uid}`, scope: `user:${item.uid}`, operation: () => setUserEmailVerified(item.uid, !item.emailVerified, reason), onSuccess: (result) => patchUser(result.uid, { emailVerified: result.verified }) }), false, `user:${item.uid}`)} />
              <Action label={item.admin ? 'הסרת מנהל' : 'מתן הרשאת מנהל'} testID={`admin-user-admin-${item.uid}`} busy={pendingActions[`admin:${item.uid}`]} disabled={pendingScopes[`user:${item.uid}`]} onPress={() => askReason('שינוי הרשאת מנהל', 'כתבו את סיבת הפעולה.', (reason) => runAction({ key: `admin:${item.uid}`, scope: `user:${item.uid}`, operation: () => setUserAdmin(item.uid, !item.admin, reason), onSuccess: (result) => patchUser(result.uid, { admin: result.admin }) }), item.admin, `user:${item.uid}`)} />
              <Action label="מחיקת משתמש מלאה" testID={`admin-user-delete-${item.uid}`} danger busy={pendingActions[`delete:${item.uid}`]} disabled={pendingScopes[`user:${item.uid}`]} onPress={() => askReason('מחיקת משתמש מלאה', 'פעולה זו מוחקת חשבון, תוכן ומדיה ואינה ניתנת לביטול.', (reason) => runAction({ key: `delete:${item.uid}`, scope: `user:${item.uid}`, operation: () => deleteUserAsAdmin(item.uid, reason), onSuccess: () => setUsers((current) => current.filter((entry) => entry.uid !== item.uid)) }), true, `user:${item.uid}`)} />
            </View>
          </View>)}
        </> : null}

        {tab === 'audit' && audit.map((item) => <View key={item.id} style={styles.card}><AppText style={styles.cardTitle}>{item.action}</AppText><AppText style={styles.body}>{item.reason}</AppText><AppText style={styles.body}>מנהל: {item.actorName || 'מנהל מערכת'}</AppText></View>)}
        {currentState.nextCursor ? <Action label="טעינת פריטים נוספים" testID={`admin-${tab}-load-more`} busy={currentState.loadingMore} onPress={() => loadTab(tab, { append: true })} /> : null}
        {!currentState.loading && !currentState.error && !currentItems.length ? <View style={styles.empty} testID={`admin-${tab}-empty`}><AppText style={styles.emptyText}>אין פריטים להצגה כרגע.</AppText></View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

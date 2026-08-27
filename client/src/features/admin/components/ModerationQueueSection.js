import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
import {
  bulkUpdateModerationCases,
  deleteAdminSavedView,
  getModerationCase,
  listAdminSavedViews,
  listModerationCases,
  resolveModerationCase,
  saveAdminSavedView,
  updateModerationCase,
} from '../../../services/AdminService';
import { adminStyles as styles } from '../../../styles';
import { safeAdminError } from '../adminErrors';
import {
  CATEGORY_LABELS,
  formatRelativeAge,
  formatSla,
  QUEUE_VIEWS,
  STATUS_LABELS,
  TARGET_LABELS,
} from '../adminLabels';
import AdminAction from './AdminAction';
import AdminAttachedPlaceReview from './AdminAttachedPlaceReview';
import AdminAsyncState from './AdminAsyncState';
import ModerationTargetPreview from './ModerationTargetPreview';

const TARGET_FILTERS = Object.freeze(['recommendation', 'route', 'trip', 'comment', 'profile', 'destination']);
const CONTENT_ACTIONS = Object.freeze([
  { id: 'dismiss', label: 'אין הפרה' },
  { id: 'hold', label: 'הסתרה זמנית' },
  { id: 'restore', label: 'שחזור' },
  { id: 'delete', label: 'מחיקה', danger: true },
]);
const ACCOUNT_ACTIONS = Object.freeze([
  { id: 'none', label: 'ללא פעולה' },
  { id: 'warn', label: 'אזהרה' },
  { id: 'suspend:24', label: 'השעיה ל־24 שעות' },
  { id: 'suspend:168', label: 'השעיה ל־7 ימים' },
  { id: 'suspend:720', label: 'השעיה ל־30 ימים' },
  { id: 'suspend:permanent', label: 'השעיה קבועה', danger: true },
  { id: 'reinstate', label: 'החזרה לפעילות' },
]);

function reasonOf(error) {
  return error?.details?.reason || error?.customData?.details?.reason || '';
}

function ToggleChip({ label, active, onPress, testID, danger = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      testID={testID}
      style={[styles.filterChip, active && styles.filterChipActive, danger && active && styles.filterChipDanger]}
      onPress={onPress}
    >
      <AppText style={[styles.filterChipText, active && styles.filterChipTextActive, danger && active && styles.filterChipDangerText]}>{label}</AppText>
    </Pressable>
  );
}

function CaseRow({ item, active, selected, onOpen, onToggleSelected }) {
  const categories = Object.entries(item.categoryCounts || {})
    .filter(([, count]) => Number(count) > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([category]) => CATEGORY_LABELS[category] || 'דיווח אחר');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`פתיחת תיק ${item.targetPreview?.title || TARGET_LABELS[item.target?.type] || 'תוכן'}`}
      testID={`admin-case-${item.id}`}
      style={({ pressed }) => [styles.queueRow, active && styles.queueRowActive, pressed && styles.cardPressed]}
      onPress={onOpen}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel="בחירת תיק לפעולה מרובה"
        testID={`admin-case-select-${item.id}`}
        style={[styles.checkbox, selected && styles.checkboxSelected]}
        onPress={(event) => { event?.stopPropagation?.(); onToggleSelected(); }}
      >
        {selected ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
      </Pressable>
      <View style={styles.queueRowContent}>
        <View style={styles.row}>
          <AppText numberOfLines={1} style={styles.queueTitle}>{item.targetPreview?.title || 'תוכן ללא כותרת'}</AppText>
          {item.priority === 'urgent' ? <View style={[styles.badge, styles.badgeUrgent]}><AppText style={[styles.badgeText, styles.badgeUrgentText]}>דחוף</AppText></View> : null}
        </View>
        <AppText style={styles.queueMeta}>{TARGET_LABELS[item.target?.type] || 'תוכן'} · {item.targetPreview?.author?.displayName || 'ללא בעלים'} · {item.reportCount || 0} דיווחים</AppText>
        <AppText numberOfLines={1} style={styles.queueReasons}>{categories.join(' · ') || 'תיק שנפתח על ידי המערכת'}</AppText>
        <View style={styles.queueFoot}>
          <AppText style={styles.queueFootText}>{formatRelativeAge(item.lastActivityAt || item.updatedAt)}</AppText>
          <AppText style={[styles.queueFootText, Number(item.dueAtMs) < Date.now() && styles.overdueText]}>{formatSla(item.dueAtMs)}</AppText>
          <AppText style={styles.queueFootText}>{item.assignment?.displayName || (item.assignmentUid ? 'מנהל מוקצה' : 'לא מוקצה')}</AppText>
        </View>
      </View>
    </Pressable>
  );
}

export function DecisionPanel({ details, policy, busy, error, success, onResolve }) {
  const targetType = details?.target?.type;
  const targetSupportsContent = ['recommendation', 'route', 'trip', 'comment'].includes(targetType);
  const [contentAction, setContentAction] = useState('dismiss');
  const [accountChoice, setAccountChoice] = useState('none');
  const [reasonCode, setReasonCode] = useState('');
  const [userDetail, setUserDetail] = useState('');
  const [internalNote, setInternalNote] = useState('');

  useEffect(() => {
    setContentAction('dismiss');
    setAccountChoice('none');
    setReasonCode('');
    setUserDetail('');
    setInternalNote('');
  }, [details?.id, targetSupportsContent]);

  const submit = () => {
    const [accountType, durationValue] = accountChoice.split(':');
    const payload = {
      ...(details.id ? { caseId: details.id } : { target: details.target }),
      expectedRevision: details.revision || 0,
      contentAction,
      accountAction: {
        type: accountType,
        ...(accountType === 'suspend'
          ? { durationHours: durationValue === 'permanent' ? null : Number(durationValue) }
          : {}),
      },
      reasonCode,
      userDetail,
      internalNote,
    };
    const destructive = contentAction === 'delete' || ['suspend'].includes(accountType);
    const targetName = details.targetPreview?.title || details.subjectUser?.displayName || 'היעד';
    if (!destructive) return onResolve(payload);
    const confirm = () => onResolve(payload);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`אישור פעולה רגישה על ״${targetName}״\nהפעולה לא תופעל שוב אוטומטית.`)) confirm();
      return;
    }
    Alert.alert('אישור פעולה רגישה', `היעד: ${targetName}\nיש לבדוק את ההחלטה לפני האישור.`, [
      { text: 'ביטול', style: 'cancel' },
      { text: 'אישור פרטני', style: 'destructive', onPress: confirm },
    ]);
  };

  const reasons = policy?.reasons || [];
  const invalid = !reasonCode || (contentAction === 'none' && accountChoice === 'none');
  return (
    <View style={styles.decisionPanel} testID={`admin-case-decision-${details.id || 'new'}`}>
      <AppText style={styles.subsectionTitle}>החלטה מתועדת</AppText>
      {targetSupportsContent ? <>
        <AppText style={styles.fieldLabel}>פעולת תוכן</AppText>
        <View style={styles.chipRow}>{CONTENT_ACTIONS.map((action) => <ToggleChip key={action.id} label={action.label} danger={action.danger} active={contentAction === action.id} onPress={() => setContentAction(action.id)} testID={`admin-decision-content-${action.id}`} />)}</View>
      </> : <AppText style={styles.helpText}>לתיק הזה אין פעולת תוכן. אפשר לסגור ללא הפרה או לבחור פעולת חשבון.</AppText>}
      {details.subjectUser ? <>
        <AppText style={styles.fieldLabel}>פעולת חשבון</AppText>
        <View style={styles.chipRow}>{ACCOUNT_ACTIONS.map((action) => <ToggleChip key={action.id} label={action.label} danger={action.danger} active={accountChoice === action.id} onPress={() => setAccountChoice(action.id)} testID={`admin-decision-account-${action.id.replace(':', '-')}`} />)}</View>
      </> : null}
      <AppText style={styles.fieldLabel}>סיבת מדיניות — חובה</AppText>
      <View style={styles.chipRow}>{reasons.map((reason) => <ToggleChip key={reason.id} label={reason.label} active={reasonCode === reason.id} onPress={() => {
        setReasonCode(reason.id);
        if (reason.id === 'no_violation') {
          setContentAction('dismiss');
          setAccountChoice('none');
        }
      }} testID={`admin-decision-reason-${reason.id}`} />)}</View>
      <AppTextInput style={styles.textArea} value={userDetail} onChangeText={setUserDetail} placeholder="פירוט אופציונלי שיוצג למשתמש" multiline maxLength={240} accessibilityLabel="פירוט למשתמש" />
      <AppTextInput style={styles.textArea} value={internalNote} onChangeText={setInternalNote} placeholder="הערה פנימית לצוות בלבד" multiline maxLength={1000} accessibilityLabel="הערה פנימית" />
      {error ? <AppText style={styles.inlineError}>{error}</AppText> : null}
      {success ? <AppText style={styles.inlineSuccess}>{success}</AppText> : null}
      {(contentAction === 'delete' || accountChoice.startsWith('suspend')) ? <View style={styles.dangerZone}><Ionicons name="warning-outline" size={20} color="#B42318" /><AppText style={styles.dangerZoneText}>פעולה רגישה. היעד יוצג שוב באישור פרטני לפני הביצוע.</AppText></View> : null}
      <AdminAction label="שמירת ההחלטה" primary danger={contentAction === 'delete' || accountChoice === 'suspend:permanent'} busy={busy} disabled={invalid} onPress={submit} testID="admin-decision-submit" />
    </View>
  );
}

function CaseDetails({ details, loading, error, policy, supportState, actionState, onBack, onUpdate, onResolve, onReload, onReloadSupport }) {
  if (loading || error || !details) {
    return <View style={styles.caseDetailPane}><AdminAsyncState loading={loading} error={error} empty={!loading && !error && !details} onRetry={onReload} testID="admin-case-details" emptyText="בחרו תיק כדי לראות את ההקשר ולקבל החלטה." /></View>;
  }
  const target = details.targetPreview || {};
  return (
    <ScrollView style={styles.caseDetailPane} contentContainerStyle={styles.caseDetailContent} keyboardShouldPersistTaps="handled">
      {onBack ? <AdminAction compact label="חזרה לתור" onPress={onBack} testID="admin-case-back" /> : null}
      <View style={styles.row}>
        <View style={styles.detailTitleBlock}>
          <AppText style={styles.sectionTitle}>{target.title || TARGET_LABELS[details.target?.type] || 'תיק מודרציה'}</AppText>
          <AppText style={styles.queueMeta}>{STATUS_LABELS[details.status] || 'מצב לא מוכר'} · גרסה {details.revision || 0}</AppText>
        </View>
        <View style={styles.badge}><AppText style={styles.badgeText}>{details.priority === 'urgent' ? 'דחוף' : 'רגיל'}</AppText></View>
      </View>
      <ModerationTargetPreview preview={target} />
      {target.imageUrl ? <Image source={{ uri: target.imageUrl }} style={styles.detailImage} resizeMode="cover" accessibilityLabel="תמונת התוכן המדווח" /> : null}
      <View style={styles.actions}>
        <AdminAction compact label={details.assignmentUid ? 'שחרור הקצאה' : 'הקצאה אליי'} busy={actionState.busy === 'assignment'} disabled={Boolean(actionState.busy)} onPress={() => onUpdate(details.assignmentUid ? 'unclaim' : 'claim', {}, 'assignment')} testID="admin-case-assignment" />
        <AdminAction compact label={details.priority === 'urgent' ? 'עדיפות רגילה' : 'סימון כדחוף'} busy={actionState.busy === 'priority'} disabled={Boolean(actionState.busy)} onPress={() => onUpdate('set_priority', { priority: details.priority === 'urgent' ? 'normal' : 'urgent' }, 'priority')} testID="admin-case-priority" />
      </View>
      {actionState.error ? <AppText style={styles.inlineError}>{actionState.error}</AppText> : null}

      <View style={styles.contextGrid}>
        <View style={styles.contextCard}>
          <AppText style={styles.subsectionTitle}>דיווחים ({details.reports?.length || 0})</AppText>
          {(details.reports || []).map((report, index) => <View key={report.id || index} style={styles.timelineItem}><AppText style={styles.contextStrong}>{CATEGORY_LABELS[report.category] || 'אחר'}</AppText>{report.details ? <AppText style={styles.body}>{report.details}</AppText> : null}</View>)}
          {!details.reports?.length ? <AppText style={styles.helpText}>התיק נפתח אוטומטית או מתוכן מוחזק, ללא זהות מדווחים.</AppText> : null}
        </View>
        {details.subjectUser ? <View style={styles.contextCard}>
          <AppText style={styles.subsectionTitle}>המשתמש</AppText>
          <AppText style={styles.contextStrong}>{details.subjectUser.displayName || 'ללא שם'}</AppText>
          <AppText style={styles.body}>{STATUS_LABELS[details.subjectUser.status] || 'פעיל'}</AppText>
          <AppText style={styles.body}>תוכן אחר: {details.recentContent?.length || 0} · אכיפות קודמות: {details.enforcements?.length || 0}</AppText>
        </View> : null}
        {target.place || target.destination ? <View style={styles.contextCard}>
          <AppText style={styles.subsectionTitle}>פרטי מקום</AppText>
          <AppText style={styles.contextStrong}>{target.place?.name || target.destination?.cityName || 'מקום מחובר'}</AppText>
          <AppText style={styles.body}>{target.place?.address || target.destination?.countryName || 'ללא כתובת מלאה'}</AppText>
        </View> : null}
      </View>
      {details.target?.subject?.kind === 'attached_place' ? <AdminAttachedPlaceReview details={details} onUpdated={onReload} /> : null}

      <View style={styles.contextCard}>
        <AppText style={styles.subsectionTitle}>הערה פנימית</AppText>
        <AppTextInput style={styles.textArea} value={actionState.note} onChangeText={actionState.setNote} placeholder="הוספת תיעוד לצוות" multiline maxLength={1000} accessibilityLabel="הערה חדשה לתיק" />
        <AdminAction compact label="שמירת הערה" busy={actionState.busy === 'note'} disabled={!actionState.note.trim() || Boolean(actionState.busy)} onPress={() => onUpdate('add_note', { note: actionState.note }, 'note')} testID="admin-case-note-save" />
      </View>

      <View style={styles.contextCard}>
        <AppText style={styles.subsectionTitle}>ציר זמן</AppText>
        {(details.events || []).map((event) => <View key={event.id} style={styles.timelineItem}><AppText style={styles.contextStrong}>{event.actor?.displayName || 'מערכת'}</AppText><AppText style={styles.body}>{event.type === 'add_note' ? event.note : event.type}</AppText></View>)}
        {!details.events?.length ? <AppText style={styles.helpText}>אין עדיין אירועים מתועדים.</AppText> : null}
      </View>
      {supportState?.loading && !policy
        ? <AdminAsyncState loading testID="admin-case-policy" />
        : supportState?.policyError
          ? <View style={styles.error} testID="admin-case-policy-error"><AppText style={styles.errorText}>{supportState.policyError}</AppText><AdminAction compact label="טעינת מדיניות מחדש" busy={supportState.loading} onPress={onReloadSupport} testID="admin-case-policy-retry" /></View>
          : <DecisionPanel details={details} policy={policy} busy={actionState.busy === 'decision'} error={actionState.decisionError} success={actionState.success} onResolve={onResolve} />}
    </ScrollView>
  );
}

export default function ModerationQueueSection({ policy, initialView = 'needs_action', focusCaseId = '', onFocusHandled }) {
  const { width } = useWindowDimensions();
  const split = width >= 900;
  const [view, setView] = useState(initialView);
  const [filters, setFilters] = useState({
    query: '', targetTypes: [], categories: [], priorities: [], assignee: '', sort: 'updated_desc',
    minimumReports: '', reportedAfter: '', reportedBefore: '',
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [list, setList] = useState({ loading: true, loadingMore: false, error: '', items: [], nextCursor: null });
  const [savedViews, setSavedViews] = useState([]);
  const [savedViewName, setSavedViewName] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [details, setDetails] = useState(null);
  const [detailState, setDetailState] = useState({ loading: false, error: '' });
  const [supportState, setSupportState] = useState({ loading: true, policyError: '', viewsError: '' });
  const [actionState, setActionState] = useState({ busy: '', error: '', decisionError: '', success: '', note: '' });
  const requestId = useRef(0);

  useEffect(() => { setView(initialView); }, [initialView]);

  const payload = useMemo(() => ({
    view,
    ...(filters.query.trim() ? { query: filters.query.trim() } : {}),
    ...(filters.targetTypes.length ? { targetTypes: filters.targetTypes } : {}),
    ...(filters.categories.length ? { categories: filters.categories } : {}),
    ...(filters.priorities.length ? { priorities: filters.priorities } : {}),
    ...(filters.assignee ? { assignee: filters.assignee } : {}),
    ...(filters.sort ? { sort: filters.sort } : {}),
    ...(Number(filters.minimumReports) > 0 ? { minimumReports: Number(filters.minimumReports) } : {}),
    ...(filters.reportedAfter.trim() ? { reportedAfter: filters.reportedAfter.trim() } : {}),
    ...(filters.reportedBefore.trim() ? { reportedBefore: filters.reportedBefore.trim() } : {}),
  }), [filters, view]);

  const load = useCallback(async ({ append = false } = {}) => {
    const id = ++requestId.current;
    setList((current) => ({ ...current, loading: !append, loadingMore: append, error: '' }));
    try {
      const result = await listModerationCases({ ...payload, ...(append && list.nextCursor ? { cursor: list.nextCursor } : {}) });
      if (id !== requestId.current) return;
      setList((current) => ({ loading: false, loadingMore: false, error: '', items: append ? [...current.items, ...(result.items || [])] : (result.items || []), nextCursor: result.nextCursor || null }));
      if (!append) setSelectedIds([]);
    } catch (error) {
      if (id === requestId.current) setList((current) => ({ ...current, loading: false, loadingMore: false, error: safeAdminError(error) }));
    }
  }, [list.nextCursor, payload]);

  const openCase = useCallback(async (caseId) => {
    setDetailState({ loading: true, error: '' });
    setActionState({ busy: '', error: '', decisionError: '', success: '', note: '' });
    try {
      const value = await getModerationCase(caseId);
      setDetails(value);
      setDetailState({ loading: false, error: '' });
    } catch (error) {
      setDetails(null);
      setDetailState({ loading: false, error: safeAdminError(error) });
    }
  }, []);

  const loadSupportData = useCallback(async () => {
    setSupportState((current) => ({ ...current, loading: true, policyError: '', viewsError: '' }));
    const viewsResult = await Promise.resolve()
      .then(() => listAdminSavedViews())
      .then((value) => ({ status: 'fulfilled', value }))
      .catch((reason) => ({ status: 'rejected', reason }));
    let viewsError = '';
    if (viewsResult.status === 'fulfilled') setSavedViews(viewsResult.value?.items || []);
    else viewsError = `התצוגות השמורות לא נטענו: ${safeAdminError(viewsResult.reason)}`;
    setSupportState({ loading: false, policyError: '', viewsError });
  }, []);

  useEffect(() => { load(); }, [payload]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadSupportData(); }, [loadSupportData]);
  useEffect(() => {
    if (!focusCaseId) return;
    openCase(focusCaseId).finally(() => onFocusHandled?.());
  }, [focusCaseId, onFocusHandled, openCase]);

  const patchDetails = (value) => {
    setDetails(value);
    setList((current) => ({ ...current, items: current.items.map((item) => item.id === value.id ? { ...item, ...value } : item) }));
  };
  const updateCase = async (operation, extra, scope) => {
    if (!details || actionState.busy) return;
    setActionState((current) => ({ ...current, busy: scope, error: '', success: '' }));
    try {
      const value = await updateModerationCase({ caseId: details.id, expectedRevision: details.revision || 0, operation, ...extra });
      patchDetails({ ...details, ...value });
      if (operation === 'add_note') {
        await openCase(details.id);
        setActionState((current) => ({ ...current, busy: '', note: '', success: 'ההערה נשמרה בציר הזמן.' }));
      } else {
        setActionState((current) => ({ ...current, busy: '', success: 'התיק עודכן.' }));
      }
    } catch (error) {
      if (reasonOf(error) === 'case_revision_conflict') await openCase(details.id);
      setActionState((current) => ({ ...current, busy: '', error: safeAdminError(error) }));
    }
  };
  const resolveCase = async (decision) => {
    setActionState((current) => ({ ...current, busy: 'decision', decisionError: '', success: '' }));
    try {
      await resolveModerationCase(decision);
      setList((current) => ({ ...current, items: view === 'history' ? current.items : current.items.filter((item) => item.id !== details.id) }));
      await openCase(details.id);
      setActionState((current) => ({ ...current, busy: '', success: 'ההחלטה נשמרה והאכיפה הושלמה.' }));
    } catch (error) {
      if (reasonOf(error) === 'case_revision_conflict') await openCase(details.id);
      setActionState((current) => ({ ...current, busy: '', decisionError: safeAdminError(error, { operationMayContinue: true }) }));
    }
  };
  const toggleSelected = (id) => setSelectedIds((current) => {
    if (current.includes(id)) return current.filter((value) => value !== id);
    if (current.length >= 25) {
      setActionState((value) => ({ ...value, error: 'אפשר לבחור עד 25 תיקים לפעולה מרובה.' }));
      return current;
    }
    return [...current, id];
  });
  const bulk = async (operation, extra = {}) => {
    const cases = list.items.filter((item) => selectedIds.includes(item.id)).map((item) => ({ caseId: item.id, expectedRevision: item.revision || 0 }));
    setActionState((current) => ({ ...current, busy: `bulk:${operation}`, error: '' }));
    try {
      const result = await bulkUpdateModerationCases({ operation, cases, ...extra });
      const succeeded = new Set(result.results?.filter((item) => item.success).map((item) => item.caseId));
      const failed = (result.results || []).length - succeeded.size;
      setList((current) => ({ ...current, items: operation === 'dismiss' ? current.items.filter((item) => !succeeded.has(item.id)) : current.items }));
      setSelectedIds([]);
      await load();
      setActionState((current) => ({
        ...current,
        busy: '',
        error: failed ? `${failed} תיקים השתנו בינתיים ולא עודכנו. יש לבדוק אותם מחדש.` : '',
        success: succeeded.size ? `${succeeded.size} תיקים עודכנו.` : '',
      }));
    } catch (error) {
      setActionState((current) => ({ ...current, busy: '', error: safeAdminError(error) }));
      return;
    }
  };
  const saveView = async () => {
    if (!savedViewName.trim()) return;
    try {
      const saved = await saveAdminSavedView({ name: savedViewName.trim(), filters: payload });
      setSavedViews((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSavedViewName('');
    } catch (error) { setActionState((current) => ({ ...current, error: safeAdminError(error) })); }
  };
  const removeView = async (id) => {
    try { await deleteAdminSavedView(id); setSavedViews((current) => current.filter((item) => item.id !== id)); } catch (error) { setActionState((current) => ({ ...current, error: safeAdminError(error) })); }
  };
  const applySavedView = (saved) => {
    const value = saved?.filters || {};
    if (value.view) setView(value.view);
    setFilters({
      query: value.query || '',
      targetTypes: value.targetTypes || [],
      categories: value.categories || [],
      priorities: value.priorities || [],
      assignee: value.assignee || '',
      sort: value.sort || 'updated_desc',
      minimumReports: value.minimumReports ? String(value.minimumReports) : '',
      reportedAfter: value.reportedAfter?.slice?.(0, 10) || '',
      reportedBefore: value.reportedBefore?.slice?.(0, 10) || '',
    });
  };
  const toggleArrayFilter = (key, value) => setFilters((current) => ({ ...current, [key]: current[key].includes(value) ? current[key].filter((entry) => entry !== value) : [...current[key], value] }));

  const showingMobileDetail = !split && (details || detailState.loading || detailState.error);
  return (
    <View style={styles.queueSection} testID="admin-queue-content">
      {!showingMobileDetail ? <View style={[styles.queueListPane, split && styles.queueListPaneSplit]}>
        <View style={styles.sectionHeading}><AppText style={styles.sectionTitle}>תור בדיקה</AppText><AppText style={styles.sectionDescription}>כל הדיווחים והתוכן המוחזק, עם הקצאה והחלטה באותו מרחב עבודה.</AppText></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.viewTabs}>{QUEUE_VIEWS.map((item) => <ToggleChip key={item.id} label={item.label} active={view === item.id} onPress={() => setView(item.id)} testID={`admin-queue-view-${item.id}`} />)}</ScrollView>
        <View style={styles.searchBar}><Ionicons name="search-outline" size={20} color="#667085" /><AppTextInput value={filters.query} onChangeText={(query) => setFilters((current) => ({ ...current, query }))} placeholder="חיפוש בתוך התור" accessibilityLabel="חיפוש בתוך תור המודרציה" style={styles.searchInput} /><AdminAction compact label="מסננים" onPress={() => setFiltersOpen((current) => !current)} testID="admin-queue-filters-toggle" /></View>
        {filtersOpen ? <View style={styles.filtersPanel} testID="admin-queue-filters">
          <AppText style={styles.fieldLabel}>סוג יעד</AppText><View style={styles.chipRow}>{TARGET_FILTERS.map((type) => <ToggleChip key={type} label={TARGET_LABELS[type]} active={filters.targetTypes.includes(type)} onPress={() => toggleArrayFilter('targetTypes', type)} />)}</View>
          <AppText style={styles.fieldLabel}>קטגוריה</AppText><View style={styles.chipRow}>{Object.entries(CATEGORY_LABELS).map(([id, label]) => <ToggleChip key={id} label={label} active={filters.categories.includes(id)} onPress={() => toggleArrayFilter('categories', id)} />)}</View>
          <AppText style={styles.fieldLabel}>עדיפות</AppText><View style={styles.chipRow}>{['normal', 'urgent'].map((priority) => <ToggleChip key={priority} label={priority === 'urgent' ? 'דחוף' : 'רגיל'} active={filters.priorities.includes(priority)} onPress={() => toggleArrayFilter('priorities', priority)} />)}</View>
          <AppText style={styles.fieldLabel}>הקצאה</AppText><View style={styles.chipRow}>{[
            { id: '', label: 'כולם' }, { id: 'me', label: 'מוקצה לי' }, { id: 'unassigned', label: 'לא מוקצה' },
          ].map((item) => <ToggleChip key={item.id || 'all'} label={item.label} active={filters.assignee === item.id} onPress={() => setFilters((current) => ({ ...current, assignee: item.id }))} />)}</View>
          <AppText style={styles.fieldLabel}>מיון</AppText><View style={styles.chipRow}>{[
            { id: 'updated_desc', label: 'פעילות אחרונה' }, { id: 'due_asc', label: 'SLA הקרוב' }, { id: 'reports_desc', label: 'מספר דיווחים' },
          ].map((item) => <ToggleChip key={item.id} label={item.label} active={filters.sort === item.id} onPress={() => setFilters((current) => ({ ...current, sort: item.id }))} />)}</View>
          <AppTextInput value={filters.minimumReports} onChangeText={(minimumReports) => setFilters((current) => ({ ...current, minimumReports }))} keyboardType="number-pad" placeholder="מספר דיווחים מינימלי" accessibilityLabel="מספר דיווחים מינימלי" style={styles.input} />
          <View style={styles.savedViewEditor}><AppTextInput value={filters.reportedAfter} onChangeText={(reportedAfter) => setFilters((current) => ({ ...current, reportedAfter }))} placeholder="מתאריך YYYY-MM-DD" accessibilityLabel="דיווחים מתאריך" style={styles.savedViewInput} /><AppTextInput value={filters.reportedBefore} onChangeText={(reportedBefore) => setFilters((current) => ({ ...current, reportedBefore }))} placeholder="עד תאריך YYYY-MM-DD" accessibilityLabel="דיווחים עד תאריך" style={styles.savedViewInput} /></View>
          <View style={styles.savedViewEditor}><AppTextInput value={savedViewName} onChangeText={setSavedViewName} placeholder="שם לתצוגה השמורה" accessibilityLabel="שם לתצוגה שמורה" style={styles.savedViewInput} /><AdminAction compact label="שמירה" disabled={!savedViewName.trim()} onPress={saveView} testID="admin-saved-view-save" /></View>
          <View style={styles.chipRow}>{savedViews.map((saved) => <View key={saved.id} style={styles.savedView}><Pressable accessibilityRole="button" onPress={() => applySavedView(saved)}><AppText style={styles.savedViewText}>{saved.name}</AppText></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`מחיקת התצוגה ${saved.name}`} onPress={() => removeView(saved.id)}><Ionicons name="close" size={18} color="#667085" /></Pressable></View>)}</View>
        </View> : null}
        {selectedIds.length ? <View style={styles.bulkBar} testID="admin-bulk-bar"><AppText style={styles.contextStrong}>{selectedIds.length} תיקים נבחרו (עד 25)</AppText><View style={styles.actions}><AdminAction compact label="הקצאה אליי" busy={actionState.busy === 'bulk:claim'} disabled={Boolean(actionState.busy)} onPress={() => bulk('claim')} testID="admin-bulk-claim" /><AdminAction compact label="סימון דחוף" busy={actionState.busy === 'bulk:set_priority'} disabled={Boolean(actionState.busy)} onPress={() => bulk('set_priority', { priority: 'urgent' })} testID="admin-bulk-priority" /><AdminAction compact label="סגירה ללא הפרה" busy={actionState.busy === 'bulk:dismiss'} disabled={Boolean(actionState.busy)} onPress={() => bulk('dismiss')} testID="admin-bulk-dismiss" /></View></View> : null}
        {actionState.error ? <AppText style={styles.inlineError}>{actionState.error}</AppText> : null}
        {actionState.success ? <AppText style={styles.inlineSuccess}>{actionState.success}</AppText> : null}
        {supportState.policyError || supportState.viewsError ? <View style={styles.error} testID="admin-queue-support-error"><AppText style={styles.errorText}>{[supportState.policyError, supportState.viewsError].filter(Boolean).join(' ')}</AppText><AdminAction compact label="טעינה מחדש" busy={supportState.loading} onPress={loadSupportData} testID="admin-queue-support-retry" /></View> : null}
        <AdminAsyncState loading={list.loading} error={list.error} empty={!list.loading && !list.error && !list.items.length} onRetry={() => load()} testID="admin-queue" emptyText="התור הזה נקי כרגע." />
        {!list.loading && !list.error ? <ScrollView style={styles.queueRows} contentContainerStyle={styles.queueRowsContent}>{list.items.map((item) => <CaseRow key={item.id} item={item} active={details?.id === item.id} selected={selectedIds.includes(item.id)} onOpen={() => openCase(item.id)} onToggleSelected={() => toggleSelected(item.id)} />)}{list.nextCursor ? <AdminAction label="טעינת תיקים נוספים" busy={list.loadingMore} onPress={() => load({ append: true })} testID="admin-queue-load-more" /> : null}</ScrollView> : null}
      </View> : null}
      {(split || showingMobileDetail) ? <CaseDetails details={details} loading={detailState.loading} error={detailState.error} policy={policy} supportState={supportState} actionState={{ ...actionState, setNote: (note) => setActionState((current) => ({ ...current, note })) }} onBack={!split ? () => { setDetails(null); setDetailState({ loading: false, error: '' }); } : null} onUpdate={updateCase} onResolve={resolveCase} onReload={() => details?.id && openCase(details.id)} onReloadSupport={loadSupportData} /> : null}
    </View>
  );
}

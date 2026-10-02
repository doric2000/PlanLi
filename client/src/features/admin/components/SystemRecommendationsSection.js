import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Alert, Pressable, View, useWindowDimensions } from 'react-native';

import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
import RtlChoiceGroup from '../../../components/RtlChoiceGroup';
import {
  POST_BUDGETS,
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_SUBCATEGORIES,
} from '../../../constants/travelTaxonomy';
import RecommendationDetailContent from '../../community/components/RecommendationDetailContent';
import {
  advanceRecommendationIngestionStage,
  approveSystemRecommendationCandidate,
  bulkApproveSystemRecommendationCandidates,
  getRecommendationIngestionStatus,
  getSystemRecommendationCandidate,
  listSystemRecommendationCandidates,
  rejectSystemRecommendationCandidate,
  searchSystemRecommendationPlaces,
  startRecommendationIngestionCollection,
  updateRecommendationIngestionGroup,
  updateSystemRecommendationCandidate,
} from '../../../services/AdminService';
import { adminStyles as styles } from '../../../styles';
import { openSafeExternalUrl } from '../../../utils/safeExternalUrl';
import { safeAdminError } from '../adminErrors';
import AdminAction from './AdminAction';
import AdminAsyncState from './AdminAsyncState';

const REVIEW_FILTERS = Object.freeze([
  { id: 'ready', label: 'מוכן לפרסום' },
  { id: 'needs_input', label: 'דורש השלמה' },
  { id: 'published', label: 'פורסם' },
  { id: 'rejected', label: 'נדחה' },
]);
const STAGE_LABELS = Object.freeze({ trial: 'ניסיון ראשון', pilot: 'פיילוט', scale: 'הרחבה' });
const CHECKLIST_LABELS = Object.freeze({
  photos: 'התמונות מוצגות',
  title: 'הכותרת היא שם המקום',
  description: 'התיאור נאמן למקור',
  location: 'המיקום והמפה נכונים',
  budget: 'התקציב נכון',
  author: 'המחבר הוא "המלצות מערכת"',
});
const MISSING_LABELS = Object.freeze({
  title: 'כותרת',
  title_generic: 'כותרת כללית מדי',
  description: 'תיאור',
  description_unverified: 'תיאור שלא אומת מול המקור',
  category: 'קטגוריה',
  subcategories: 'תת־קטגוריה',
  customSubcategoryLabel: 'שם לתת־קטגוריה "אחר"',
  practicalInfo: 'מידע מעשי לא תואם',
  eventSchedule: 'מועד האירוע',
  budget: 'תקציב',
  location: 'מיקום מדויק',
  destination: 'יעד',
  photos: 'תמונה מוכנה',
  source_likes: 'פחות מ־50 לייקים',
  source_filter: 'הפוסט לא עבר סינון',
  blocking_issue: 'בעיה חוסמת',
});
const ISSUE_LABELS = Object.freeze({
  photo_mapping_required: 'יש לבחור ידנית אילו תמונות שייכות להמלצה.',
  some_photos_failed: 'חלק מתמונות הפוסט לא הורדו או לא עובדו.',
  location_ambiguous: 'נמצאו כמה מקומות מתאימים. יש לבחור את הסניף הנכון.',
  location_not_found: 'המקום לא נמצא אוטומטית. יש לחפש ולבחור.',
  description_span_rejected: 'משפט שהמודל הציע נפסל כי אינו מופיע בפוסט.',
  description_missing: 'לא נמצא תיאור מתוך הפוסט.',
  title_unsupported: 'הכותרת שהוצעה אינה מופיעה בפוסט.',
  classification_required: 'יש לבחור קטגוריה ותת־קטגוריה.',
});
const NO_NAVIGATION = Object.freeze({ navigate: () => {} });
// contextCard sizes for row layouts; in this vertical page each card takes its content height.
const cardStyle = [styles.contextCard, styles.destinationContextCard];

function confirmAction(message, onConfirm) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined' && window.confirm(message)) onConfirm();
    return;
  }
  Alert.alert('אישור פעולה', message, [
    { text: 'ביטול', style: 'cancel' },
    { text: 'אישור', onPress: onConfirm },
  ]);
}

function formFromDetail(detail) {
  const content = detail?.candidate?.content || {};
  return {
    title: content.title || '',
    description: content.description || '',
    categoryId: content.categoryId || '',
    subcategoryIds: content.subcategoryIds || [],
    customSubcategoryLabel: content.customSubcategoryLabel || '',
    budget: content.budget || '',
    priceNote: content.details?.priceNote || '',
    phone: content.details?.phone || '',
    externalUrl: content.details?.externalUrl || '',
    photoIds: detail?.candidate?.photoIds || [],
  };
}

// Only validated Facebook source links and PlanLi recommendation links open.
function openExternal(url, policy) {
  openSafeExternalUrl(url, policy).catch(() => {});
}

function formatDate(ms) {
  if (!ms) return 'לא ידוע';
  try {
    return new Date(ms).toLocaleDateString('he-IL');
  } catch {
    return 'לא ידוע';
  }
}

function Chip({ label, active, onPress, disabled, testID }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
      testID={testID}
    >
      <AppText style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</AppText>
    </Pressable>
  );
}

export default function SystemRecommendationsSection() {
  const { width } = useWindowDimensions();
  const split = width >= 900;
  const [status, setStatus] = useState({ loading: true, error: '', data: null });
  const [list, setList] = useState({ loading: true, error: '', items: [], nextCursor: null });
  const [reviewState, setReviewState] = useState('ready');
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState({ loading: false, error: '', data: null });
  const [form, setForm] = useState(formFromDetail(null));
  const [action, setAction] = useState({ busy: '', error: '', success: '', link: '' });
  const [bulk, setBulk] = useState(() => new Set());
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeChoices, setPlaceChoices] = useState([]);
  const [rejectReason, setRejectReason] = useState('');
  const [stage, setStage] = useState({ recommendationId: '', checklist: {} });
  const listRequest = useRef(0);
  const detailRequest = useRef(0);

  const loadStatus = useCallback(async () => {
    setStatus((current) => ({ ...current, loading: true, error: '' }));
    try {
      setStatus({ loading: false, error: '', data: await getRecommendationIngestionStatus() });
    } catch (error) {
      setStatus((current) => ({ ...current, loading: false, error: safeAdminError(error) }));
    }
  }, []);

  const loadList = useCallback(async ({ append = false, state = reviewState } = {}) => {
    const request = listRequest.current + 1;
    listRequest.current = request;
    setList((current) => ({ ...current, loading: !append, error: '' }));
    try {
      const result = await listSystemRecommendationCandidates({
        reviewState: state,
        ...(append && list.nextCursor ? { cursor: list.nextCursor } : {}),
      });
      if (listRequest.current !== request) return;
      setList((current) => ({
        loading: false,
        error: '',
        items: append ? [...current.items, ...(result.items || [])] : (result.items || []),
        nextCursor: result.nextCursor || null,
      }));
    } catch (error) {
      if (listRequest.current !== request) return;
      setList((current) => ({ ...current, loading: false, error: safeAdminError(error) }));
    }
  }, [list.nextCursor, reviewState]);

  const loadDetail = useCallback(async (candidateId) => {
    const request = detailRequest.current + 1;
    detailRequest.current = request;
    setDetail((current) => ({ ...current, loading: true, error: '' }));
    try {
      const data = await getSystemRecommendationCandidate(candidateId);
      if (detailRequest.current !== request) return null;
      setDetail({ loading: false, error: '', data });
      setForm(formFromDetail(data));
      return data;
    } catch (error) {
      if (detailRequest.current !== request) return null;
      setDetail({ loading: false, error: safeAdminError(error), data: null });
      return null;
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { loadList({ state: reviewState }); }, [reviewState]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (candidateId) => {
    setSelectedId(candidateId);
    setAction({ busy: '', error: '', success: '', link: '' });
    setPlaceChoices([]);
    setPlaceQuery('');
    setRejectReason('');
    loadDetail(candidateId);
  };

  const replaceSummary = (candidateId, patch) => setList((current) => ({
    ...current,
    items: current.items.map((item) => (item.candidateId === candidateId ? { ...item, ...patch } : item)),
  }));

  const run = async (scope, operation, { success = '' } = {}) => {
    if (action.busy) return null;
    setAction({ busy: scope, error: '', success: '', link: '' });
    try {
      const result = await operation();
      setAction({ busy: '', error: '', success, link: result?.url || '' });
      return result;
    } catch (error) {
      const reason = error?.details?.reason || error?.customData?.details?.reason;
      setAction({ busy: '', error: safeAdminError(error, { operationMayContinue: true }), success: '', link: '' });
      if (reason === 'candidate_revision_conflict' && selectedId) await loadDetail(selectedId);
      return null;
    }
  };

  const candidate = detail.data?.candidate || null;
  const editable = candidate && !['published', 'publishing', 'rejected'].includes(candidate.reviewState);
  const subcategories = useMemo(
    () => RECOMMENDATION_SUBCATEGORIES.filter((entry) => entry.categoryId === form.categoryId),
    [form.categoryId]
  );
  const pool = detail.data?.photoPool || [];

  const contentPatch = () => {
    const content = candidate?.content || {};
    const details = content.details || {};
    const patch = {};
    ['title', 'description', 'categoryId', 'customSubcategoryLabel', 'budget'].forEach((key) => {
      if ((content[key] || '') !== form[key]) patch[key] = form[key];
    });
    if (JSON.stringify(content.subcategoryIds || []) !== JSON.stringify(form.subcategoryIds)) patch.subcategoryIds = form.subcategoryIds;
    if (JSON.stringify(candidate?.photoIds || []) !== JSON.stringify(form.photoIds)) patch.photoIds = form.photoIds;
    const nextDetails = {};
    ['priceNote', 'phone', 'externalUrl'].forEach((key) => {
      if ((details[key] || '') !== form[key]) nextDetails[key] = form[key];
    });
    if (Object.keys(nextDetails).length) patch.details = nextDetails;
    return patch;
  };

  const save = async (extraPatch = {}) => {
    const patch = { ...contentPatch(), ...extraPatch };
    if (!Object.keys(patch).length) {
      setAction({ busy: '', error: '', success: 'אין שינויים לשמירה.', link: '' });
      return;
    }
    const result = await run('save', () => updateSystemRecommendationCandidate(selectedId, candidate.revision, patch),
      { success: 'השינויים נשמרו.' });
    if (result) {
      replaceSummary(selectedId, { reviewState: result.reviewState, readiness: result.readiness, revision: result.revision });
      await loadDetail(selectedId);
    }
  };

  const approve = () => confirmAction('לפרסם את ההמלצה בדיוק כפי שהיא מוצגת, תחת "המלצות מערכת"?', async () => {
    const result = await run('approve', () => approveSystemRecommendationCandidate(selectedId, candidate.revision),
      { success: 'ההמלצה פורסמה.' });
    if (result) {
      replaceSummary(selectedId, { reviewState: 'published', publishedRecommendationId: result.recommendationId });
      await Promise.all([loadDetail(selectedId), loadStatus()]);
    }
  });

  const reject = () => {
    if (rejectReason.trim().length < 3) {
      setAction({ busy: '', error: 'יש לכתוב סיבה קצרה לדחייה.', success: '', link: '' });
      return;
    }
    confirmAction('לדחות את ההמלצה?', async () => {
      const result = await run('reject', () => rejectSystemRecommendationCandidate(selectedId, candidate.revision, rejectReason.trim()),
        { success: 'ההמלצה נדחתה.' });
      if (result) {
        replaceSummary(selectedId, { reviewState: 'rejected' });
        await loadDetail(selectedId);
      }
    });
  };

  const bulkApprove = () => {
    const items = list.items.filter((item) => bulk.has(item.candidateId))
      .map((item) => ({ candidateId: item.candidateId, expectedRevision: item.revision }));
    if (!items.length) return;
    confirmAction(`לפרסם ${items.length} המלצות מוכנות?`, async () => {
      const result = await run('bulk', () => bulkApproveSystemRecommendationCandidates(items));
      if (!result) return;
      setBulk(new Set());
      setAction({
        busy: '',
        error: result.failed ? `${result.failed} המלצות לא פורסמו. הן נשארו בתור לבדיקה חוזרת.` : '',
        success: `${result.succeeded} המלצות פורסמו.`,
        link: '',
      });
      await Promise.all([loadList(), loadStatus()]);
    });
  };

  const searchPlaces = async () => {
    const result = await run('place-search', () => searchSystemRecommendationPlaces(selectedId, placeQuery.trim()));
    if (result) setPlaceChoices(result.choices || []);
  };

  const togglePhoto = (index) => setForm((current) => {
    if (current.photoIds.includes(index)) return { ...current, photoIds: current.photoIds.filter((id) => id !== index) };
    return current.photoIds.length >= 5 ? current : { ...current, photoIds: [...current.photoIds, index] };
  });
  const movePhoto = (index, offset) => setForm((current) => {
    const ids = [...current.photoIds];
    const from = ids.indexOf(index);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= ids.length) return current;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    return { ...current, photoIds: ids };
  });

  const renderStatus = () => {
    const data = status.data;
    if (!data) return <AdminAsyncState loading={status.loading} error={status.error} onRetry={loadStatus} testID="system-rec-status" />;
    const budget = data.budget || {};
    const nextStage = data.nextStage;
    return (
      <View style={cardStyle} testID="system-rec-status">
        <View style={styles.row}>
          <AppText style={styles.subsectionTitle}>איסוף מקבוצות פייסבוק</AppText>
          <View style={styles.badge}><AppText style={styles.badgeText}>{STAGE_LABELS[data.rolloutStage] || data.rolloutStage}</AppText></View>
        </View>
        {!data.enabled ? <AppText style={styles.inlineError}>האיסוף כבוי בשרת.</AppText> : null}
        {!data.publisherConfigured ? <AppText style={styles.inlineError}>חשבון "המלצות מערכת" עדיין לא הוגדר.</AppText> : null}
        <AppText style={styles.body}>
          תקציב איסוף: ${budget.spentUsd ?? 0} נוצלו · ${budget.reservedUsd ?? 0} שמורים · מתוך ${budget.capUsd} · {budget.collectedPosts ?? 0}/{budget.capPosts} פוסטים
        </AppText>
        <AppText style={styles.body}>
          מגבלות השלב: עד {data.stageLimits?.maxResultsLimit} פוסטים לריצה · {data.stageLimits?.maxEnabledGroups} קבוצות פעילות{data.stageLimits?.bulk ? '' : ' · ללא פרסום מרוכז'}
        </AppText>
        {(data.groups || []).map((group) => (
          <View key={group.groupKey} style={styles.candidate} testID={`system-rec-group-${group.groupKey}`}>
            <AppText style={styles.contextStrong}>{group.label || group.groupKey}</AppText>
            <AppText style={styles.body}>
              {group.verified ? 'מאומתת' : 'לא אומתה'} · {group.enabled ? 'פעילה' : 'כבויה'} · {group.countryId ? `${group.countryId}/${group.cityId}` : 'ללא יעד'} · {group.resultsLimit} פוסטים
            </AppText>
            <View style={styles.actions}>
              <AdminAction compact label="פתיחת הקבוצה" onPress={() => openExternal(group.url, 'facebookSource')} />
              <AdminAction
                compact
                label={group.verified ? 'ביטול אימות' : 'סימון כמאומתת'}
                disabled={Boolean(action.busy) || !group.countryId}
                busy={action.busy === `verify:${group.groupKey}`}
                onPress={async () => { if (await run(`verify:${group.groupKey}`, () => updateRecommendationIngestionGroup({ groupKey: group.groupKey, verified: !group.verified }))) loadStatus(); }}
              />
              <AdminAction
                compact
                label={group.enabled ? 'כיבוי' : 'הפעלה'}
                disabled={Boolean(action.busy)}
                busy={action.busy === `enable:${group.groupKey}`}
                onPress={async () => { if (await run(`enable:${group.groupKey}`, () => updateRecommendationIngestionGroup({ groupKey: group.groupKey, enabled: !group.enabled }))) loadStatus(); }}
                testID={`system-rec-group-toggle-${group.groupKey}`}
              />
              <AdminAction
                compact
                primary
                label="הפעלת איסוף"
                disabled={Boolean(action.busy) || !group.enabled || !data.enabled}
                busy={action.busy === `collect:${group.groupKey}`}
                onPress={() => confirmAction(`להפעיל איסוף בתשלום של עד ${Math.min(group.resultsLimit, data.stageLimits?.maxResultsLimit || 0)} פוסטים?`, async () => {
                  if (await run(`collect:${group.groupKey}`, () => startRecommendationIngestionCollection(group.groupKey), { success: 'ריצת האיסוף התחילה.' })) loadStatus();
                })}
                testID={`system-rec-collect-${group.groupKey}`}
              />
            </View>
          </View>
        ))}
        {(data.runs || []).length ? (
          <View>
            <AppText style={styles.fieldLabel}>ריצות אחרונות</AppText>
            {data.runs.map((entry) => (
              <AppText key={entry.runId} style={styles.body}>
                {formatDate(entry.createdAtMs)} · {entry.status} · {entry.collectedPosts ?? '–'}/{entry.resultsLimit} פוסטים · ${entry.spentUsd ?? entry.reservedUsd}
              </AppText>
            ))}
          </View>
        ) : null}
        {nextStage ? (
          <View style={styles.candidate} testID="system-rec-stage">
            <AppText style={styles.contextStrong}>מעבר לשלב {STAGE_LABELS[nextStage]}</AppText>
            <AppText style={styles.body}>רק לאחר פרסום המלצה אחת ובדיקתה באפליקציה.</AppText>
            <AppTextInput
              style={styles.input}
              value={stage.recommendationId}
              onChangeText={(recommendationId) => setStage((current) => ({ ...current, recommendationId }))}
              placeholder="מזהה ההמלצה שנבדקה"
              accessibilityLabel="מזהה ההמלצה שנבדקה"
            />
            <View style={styles.chipRow}>
              {(data.stageChecklist || []).map((key) => (
                <Chip
                  key={key}
                  label={CHECKLIST_LABELS[key] || key}
                  active={stage.checklist[key] === true}
                  onPress={() => setStage((current) => ({ ...current, checklist: { ...current.checklist, [key]: !current.checklist[key] } }))}
                  testID={`system-rec-check-${key}`}
                />
              ))}
            </View>
            <AdminAction
              label="אישור הבדיקה והרחבה"
              disabled={Boolean(action.busy) || !stage.recommendationId.trim()}
              busy={action.busy === 'stage'}
              onPress={async () => {
                if (await run('stage', () => advanceRecommendationIngestionStage({ targetStage: nextStage, recommendationId: stage.recommendationId.trim(), checklist: stage.checklist }), { success: 'שלב האיסוף עודכן.' })) loadStatus();
              }}
            />
          </View>
        ) : null}
      </View>
    );
  };

  const renderRow = (item) => {
    const selectable = reviewState === 'ready' && status.data?.stageLimits?.bulk;
    const checked = bulk.has(item.candidateId);
    return (
      <Pressable
        key={item.candidateId}
        accessibilityRole="button"
        accessibilityLabel={`פתיחת ${item.title || 'המלצה'}`}
        onPress={() => select(item.candidateId)}
        style={[styles.searchResult, item.candidateId === selectedId && styles.queueRowActive]}
        testID={`system-rec-row-${item.candidateId}`}
      >
        {selectable ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={`בחירת ${item.title}`}
            onPress={() => setBulk((current) => {
              const next = new Set(current);
              if (next.has(item.candidateId)) next.delete(item.candidateId);
              else if (next.size < 25) next.add(item.candidateId);
              return next;
            })}
            style={[styles.checkbox, checked && styles.checkboxSelected]}
            testID={`system-rec-select-${item.candidateId}`}
          />
        ) : null}
        {item.thumbUrl ? <Image source={{ uri: item.thumbUrl }} style={styles.systemThumb} /> : <View style={styles.systemThumb} />}
        <View style={styles.searchResultBody}>
          <AppText style={styles.contextStrong}>{item.title || 'ללא כותרת'}</AppText>
          <AppText style={styles.body}>{item.cityName} · {item.actualLikes ?? '–'} לייקים · {formatDate(item.postedAtMs)}</AppText>
          {item.readiness?.missing?.length ? (
            <AppText style={styles.helpText}>חסר: {item.readiness.missing.map((key) => MISSING_LABELS[key] || key).join(', ')}</AppText>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const renderDetail = () => {
    if (!selectedId) return <View style={styles.empty}><AppText style={styles.emptyText}>בחרו המלצה כדי לבדוק אותה.</AppText></View>;
    if (detail.loading || detail.error || !detail.data) {
      return <AdminAsyncState loading={detail.loading} error={detail.error} onRetry={() => loadDetail(selectedId)} testID="system-rec-detail" />;
    }
    const { preview, source, publisher } = detail.data;
    const ready = candidate.readiness?.ready === true;
    return (
      <View style={styles.destinationDetail} testID="system-rec-detail">
        <AppText style={styles.subsectionTitle}>תצוגה מקדימה ציבורית</AppText>
        <View style={styles.systemPreview} testID="system-rec-preview">
          <View style={styles.systemPhotoStrip}>
            {(preview.media || []).map((asset) => (
              <Image key={asset.assetId} source={{ uri: asset.feed?.url || asset.large?.url }} style={styles.systemPreviewImage} />
            ))}
          </View>
          <RecommendationDetailContent
            item={preview}
            author={{ displayName: publisher?.displayName || 'המלצות מערכת', photoURL: publisher?.photoURL || null }}
            canEdit={false}
            navigation={NO_NAVIGATION}
          />
        </View>

        <View style={cardStyle} testID="system-rec-source">
          <AppText style={styles.subsectionTitle}>מקור (פרטי)</AppText>
          <AppText style={styles.body}>פורסם: {formatDate(source.postedAtMs)} · לייקים בפועל: {source.actualLikes ?? 'לא ידוע'}{source.totalReactions != null ? ` · כל התגובות: ${source.totalReactions}` : ''}</AppText>
          {source.url ? <AdminAction compact label="פתיחת הפוסט המקורי" onPress={() => openExternal(source.url, 'facebookSource')} /> : null}
          {source.changedAfterReview ? <AppText style={styles.inlineError}>הפוסט המקורי השתנה אחרי הבדיקה.</AppText> : null}
          <AppText style={styles.systemSourceText} selectable>{source.text}</AppText>
          {(candidate.issues || []).map((issue, index) => (
            <View key={`${issue.code}-${index}`} style={[styles.issue, issue.severity === 'blocking' && styles.issueError]}>
              <AppText style={styles.body}>{ISSUE_LABELS[issue.code] || issue.code}</AppText>
            </View>
          ))}
          {candidate.photoMapping?.evidence ? <AppText style={styles.helpText}>שיוך תמונות: {candidate.photoMapping.evidence}</AppText> : null}
        </View>

        <View style={cardStyle}>
          <AppText style={styles.subsectionTitle}>מצב</AppText>
          <AppText style={styles.body} testID="system-rec-readiness">
            {ready ? 'מוכן לפרסום' : `חסר: ${(candidate.readiness?.missing || []).map((key) => MISSING_LABELS[key] || key).join(', ')}`}
          </AppText>
          {candidate.published ? (
            <AdminAction compact label="פתיחת ההמלצה שפורסמה" onPress={() => openExternal(candidate.published.url, 'planliRecommendation')} testID="system-rec-published-link" />
          ) : null}
        </View>

        {editable ? (
          <View style={cardStyle} testID="system-rec-edit">
            <AppText style={styles.subsectionTitle}>עריכה</AppText>
            <AppText style={styles.fieldLabel}>כותרת (שם המקום או הפעילות)</AppText>
            <AppTextInput style={styles.input} value={form.title} onChangeText={(title) => setForm((current) => ({ ...current, title }))} accessibilityLabel="כותרת" testID="system-rec-title" />
            <AppText style={styles.fieldLabel}>תיאור</AppText>
            <AppTextInput style={styles.textArea} value={form.description} onChangeText={(description) => setForm((current) => ({ ...current, description }))} multiline accessibilityLabel="תיאור" testID="system-rec-description" />
            <AppText style={styles.fieldLabel}>קטגוריה</AppText>
            <View style={styles.chipRow}>
              {RECOMMENDATION_CATEGORIES.map((category) => (
                <Chip key={category.id} label={category.label} active={form.categoryId === category.id}
                  onPress={() => setForm((current) => ({ ...current, categoryId: category.id, subcategoryIds: [], customSubcategoryLabel: '' }))} />
              ))}
            </View>
            {subcategories.length ? <AppText style={styles.fieldLabel}>תת־קטגוריות (עד 3)</AppText> : null}
            <View style={styles.chipRow}>
              {subcategories.map((entry) => {
                const active = form.subcategoryIds.includes(entry.id);
                return (
                  <Chip key={entry.id} label={entry.label} active={active}
                    disabled={!active && form.subcategoryIds.length >= 3}
                    onPress={() => setForm((current) => ({
                      ...current,
                      subcategoryIds: active ? current.subcategoryIds.filter((id) => id !== entry.id) : [...current.subcategoryIds, entry.id],
                    }))} />
                );
              })}
            </View>
            {form.subcategoryIds.some((id) => /_other$/.test(id)) ? (
              <AppTextInput style={styles.input} value={form.customSubcategoryLabel} onChangeText={(customSubcategoryLabel) => setForm((current) => ({ ...current, customSubcategoryLabel }))} placeholder="שם קצר לתת־הקטגוריה" accessibilityLabel="שם תת־קטגוריה אחרת" />
            ) : null}
            <RtlChoiceGroup
              label="תקציב"
              options={POST_BUDGETS}
              selectedIds={form.budget ? [form.budget] : []}
              selectionMode="single"
              variant="segment"
              onToggle={(budget) => setForm((current) => ({ ...current, budget }))}
              testIDPrefix="system-rec-budget"
            />
            <AppText style={styles.fieldLabel}>פרטים נוספים (רק אם מופיעים בפוסט)</AppText>
            <AppTextInput style={styles.input} value={form.priceNote} onChangeText={(priceNote) => setForm((current) => ({ ...current, priceNote }))} placeholder="הערת מחיר" accessibilityLabel="הערת מחיר" />
            <AppTextInput style={styles.input} value={form.phone} onChangeText={(phone) => setForm((current) => ({ ...current, phone }))} placeholder="טלפון" accessibilityLabel="טלפון" />
            <AppTextInput style={styles.input} value={form.externalUrl} onChangeText={(externalUrl) => setForm((current) => ({ ...current, externalUrl }))} placeholder="קישור" accessibilityLabel="קישור" />

            <AppText style={styles.fieldLabel}>תמונות מהפוסט (בחירה וסדר, עד 5)</AppText>
            <View style={styles.systemPhotoStrip}>
              {pool.map((photo) => {
                const order = form.photoIds.indexOf(photo.index);
                return (
                  <View key={photo.index} style={[styles.systemPhoto, order >= 0 && styles.systemPhotoSelected]}>
                    {photo.thumbUrl ? (
                      <Pressable accessibilityRole="button" accessibilityLabel={`תמונה ${photo.index + 1}`} onPress={() => togglePhoto(photo.index)} disabled={photo.state !== 'prepared'} testID={`system-rec-photo-${photo.index}`}>
                        <Image source={{ uri: photo.thumbUrl }} style={styles.systemThumb} />
                      </Pressable>
                    ) : <AppText style={styles.helpText}>התמונה לא עובדה</AppText>}
                    {order >= 0 ? (
                      <View style={styles.actions}>
                        <AppText style={styles.badgeText}>{order + 1}</AppText>
                        <AdminAction compact label="↑" accessibilityLabel="הקדמת התמונה" onPress={() => movePhoto(photo.index, -1)} />
                        <AdminAction compact label="↓" accessibilityLabel="דחיית התמונה" onPress={() => movePhoto(photo.index, 1)} />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>

            <AppText style={styles.fieldLabel}>מיקום מדויק</AppText>
            <AppText style={styles.body}>
              {candidate.location?.place ? `${candidate.location.place.name} · ${candidate.location.place.address}` : 'לא נבחר מקום'}
            </AppText>
            {[...(candidate.location?.choices || []), ...placeChoices]
              .filter((choice, index, all) => all.findIndex((entry) => entry.placeId === choice.placeId) === index)
              .map((choice) => (
                <View key={choice.placeId} style={styles.candidate}>
                  <AppText style={styles.contextStrong}>{choice.name}</AppText>
                  <AppText style={styles.body}>{choice.secondaryText}</AppText>
                  <AdminAction compact label="בחירת המקום" disabled={Boolean(action.busy)} busy={action.busy === 'save'}
                    onPress={() => save({ placeId: choice.placeId })} testID={`system-rec-place-${choice.placeId}`} />
                </View>
              ))}
            <View style={styles.actions}>
              <AppTextInput style={styles.input} value={placeQuery} onChangeText={setPlaceQuery} placeholder="חיפוש המקום והסניף" accessibilityLabel="חיפוש מקום" />
              <AdminAction compact label="חיפוש" disabled={Boolean(action.busy) || placeQuery.trim().length < 2} busy={action.busy === 'place-search'} onPress={searchPlaces} />
            </View>

            <View style={styles.actions}>
              <AdminAction label="שמירת שינויים" disabled={Boolean(action.busy)} busy={action.busy === 'save'} onPress={() => save()} testID="system-rec-save" />
              <AdminAction primary label="אישור ופרסום" disabled={Boolean(action.busy) || !ready || Object.keys(contentPatch()).length > 0} busy={action.busy === 'approve'} onPress={approve} testID="system-rec-approve" />
            </View>
            {ready && Object.keys(contentPatch()).length ? <AppText style={styles.helpText}>יש לשמור את השינויים לפני האישור.</AppText> : null}
            <View style={styles.dangerZoneColumn}>
              <AppTextInput style={styles.input} value={rejectReason} onChangeText={setRejectReason} placeholder="סיבת דחייה" accessibilityLabel="סיבת דחייה" />
              <AdminAction danger label="דחייה" disabled={Boolean(action.busy)} busy={action.busy === 'reject'} onPress={reject} testID="system-rec-reject" />
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View testID="system-recommendations-content">
      <View style={styles.sectionHeading}>
        <AppText style={styles.sectionTitle}>המלצות מערכת</AppText>
        <AppText style={styles.sectionDescription}>המלצות מקבוצות פייסבוק ציבוריות. כל המלצה נבדקת ומאושרת ידנית לפני פרסום תחת החשבון "המלצות מערכת".</AppText>
      </View>
      {renderStatus()}
      {action.error ? <AppText style={styles.inlineError} testID="system-rec-error">{action.error}</AppText> : null}
      {action.success ? <AppText style={styles.inlineSuccess} testID="system-rec-success">{action.success}</AppText> : null}
      {action.link ? <AdminAction compact label="פתיחת ההמלצה שפורסמה" onPress={() => openExternal(action.link, 'planliRecommendation')} testID="system-rec-success-link" /> : null}
      <View style={[styles.chipRow, styles.systemFilters]}>
        {REVIEW_FILTERS.map((filter) => (
          <Chip key={filter.id} label={filter.label} active={reviewState === filter.id}
            onPress={() => { setReviewState(filter.id); setSelectedId(''); setBulk(new Set()); }}
            testID={`system-rec-filter-${filter.id}`} />
        ))}
      </View>
      {bulk.size ? (
        <View style={styles.bulkBar}>
          <AdminAction primary label={`פרסום ${bulk.size} נבחרות`} disabled={Boolean(action.busy)} busy={action.busy === 'bulk'} onPress={bulkApprove} testID="system-rec-bulk-approve" />
        </View>
      ) : null}
      <View style={split ? styles.destinationLayout : null}>
        {(!selectedId || split) ? (
          <View style={styles.destinationList}>
            <AdminAsyncState loading={list.loading} error={list.error} empty={!list.loading && !list.error && !list.items.length}
              emptyText="אין המלצות במצב הזה." onRetry={() => loadList()} testID="system-rec-list" />
            {!list.loading && !list.error ? list.items.map(renderRow) : null}
            {list.nextCursor ? <AdminAction label="המלצות נוספות" onPress={() => loadList({ append: true })} /> : null}
          </View>
        ) : null}
        {selectedId || split ? (
          <View style={styles.destinationDetailColumn}>
            {!split && selectedId ? <AdminAction back compact label="חזרה לרשימה" onPress={() => setSelectedId('')} /> : null}
            {renderDetail()}
          </View>
        ) : null}
      </View>
    </View>
  );
}

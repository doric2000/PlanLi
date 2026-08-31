import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
import PhotoAttribution from '../../../components/PhotoAttribution';
import { useImagePickerWithUpload } from '../../../hooks/useImagePickerWithUpload';
import {
  approveDestination,
  deactivateDestination,
  getAirportCandidates,
  getDestinationImageCandidates,
  getDestinationRenameJob,
  getDestinationReassignmentJob,
  getDestinationReview,
  listDestinationReviews,
  recheckDestination,
  selectDestinationImageCandidate,
  setDestinationAirport,
  setDestinationHebrewName,
  setDestinationUploadedImage,
  startDestinationReassignment,
  previewDestinationReassignment,
  updateDestinationPolicy,
} from '../../../services/AdminService';
import { adminStyles as styles } from '../../../styles';
import { safeAdminError } from '../adminErrors';
import AdminAction from './AdminAction';
import AdminAsyncState from './AdminAsyncState';

const STATUS_ORDER = Object.freeze({ blocked: 0, open: 1, ready: 2, approved_with_warnings: 3, approved: 3, inactive: 4 });
const sortReviews = (items) => [...items].sort((left, right) => (STATUS_ORDER[left.status] ?? 2) - (STATUS_ORDER[right.status] ?? 2) || String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
const statusLabel = (status) => ({ blocked: 'חסום לתיקון', open: 'דורש בדיקה', ready: 'מוכן לאישור', approved: 'מאושר', approved_with_warnings: 'מאושר עם אזהרות', inactive: 'לא פעיל' }[status] || 'דורש בדיקה');
const DESTINATION_KIND_LABELS = Object.freeze({
  city_hub: 'עיר או יישוב מרכזי',
  island: 'אי',
  natural_feature: 'אתר טבע',
  tourism_region: 'אזור תיירות',
  province: 'מחוז',
});
const GROUPING_POLICY_LABELS = Object.freeze({
  self: 'יעד עצמאי',
  parent: 'משויך ליעד הורה',
  approved_children: 'כולל יעדי משנה מאושרים',
});
const destinationContextCardStyle = [styles.contextCard, styles.destinationContextCard];

function mergeDetails(previous, details) {
  const city = details?.city || {};
  return {
    ...previous,
    countryId: details?.countryId || previous.countryId,
    cityId: details?.cityId || previous.cityId,
    names: city.googleCache?.names || city.identity?.names || previous.names,
    countryNames: details?.country?.names || previous.countryNames,
    destinationStatus: city.status || previous.destinationStatus,
    status: city.status === 'inactive' ? 'inactive' : details?.review?.status || previous.status,
    issues: details?.issues || [],
    image: city.destinationImage || null,
    closestAirport: city.travelFacts?.closestAirport || null,
    recommendationCount: Math.max(0, Number(city.stats?.recommendationCount || 0)),
    canonicalPolicy: city.canonicalPolicy || null,
  };
}

export default function AdminDestinationsSection({ focusCountryId = '', focusCityId = '', onFocusHandled, onBackToCase }) {
  const uploader = useImagePickerWithUpload({ kind: 'route', aspect: [16, 9], normalizeToAspect: true, normalizeAspect: [16, 9] });
  const [state, setState] = useState({ loading: true, error: '', items: [], nextCursor: null });
  const [selectedId, setSelectedId] = useState('');
  const [detailState, setDetailState] = useState({ loading: false, error: '' });
  const [reason, setReason] = useState('');
  const [nameHe, setNameHe] = useState('');
  const [action, setAction] = useState({ busy: '', error: '', success: '' });
  const [imageCandidates, setImageCandidates] = useState([]);
  const [airportCandidates, setAirportCandidates] = useState([]);
  const [renameJob, setRenameJob] = useState(null);
  const [policy, setPolicy] = useState({ kind: 'city_hub', groupingPolicy: 'self', parentId: '', aliases: '' });
  const [reassignment, setReassignment] = useState({ countryId: '', cityId: '', preview: null, job: null });

  const load = useCallback(async ({ append = false } = {}) => {
    setState((current) => ({ ...current, loading: !append, error: '' }));
    try {
      const result = await listDestinationReviews(append && state.nextCursor ? { cursor: state.nextCursor } : {});
      let items = append ? [...state.items, ...(result.items || [])] : (result.items || []);
      if (!append && focusCountryId && focusCityId) {
        try {
          const details = await getDestinationReview(focusCountryId, focusCityId);
          const focused = mergeDetails({ id: `notification_${focusCountryId}_${focusCityId}`, countryId: focusCountryId, cityId: focusCityId, status: 'open' }, details);
          items = [focused, ...items.filter((item) => item.countryId !== focusCountryId || item.cityId !== focusCityId)];
          setSelectedId(focused.id);
        } catch (_error) {
          setDetailState({ loading: false, error: 'בקרת המקום שנפתחה מההתראה כבר אינה זמינה. הרשימה העדכנית עדיין מוצגת.' });
        } finally { onFocusHandled?.(); }
      }
      setState({ loading: false, error: '', items: sortReviews(items), nextCursor: result.nextCursor || null });
    } catch (error) { setState((current) => ({ ...current, loading: false, error: safeAdminError(error) })); }
  }, [focusCityId, focusCountryId, onFocusHandled, state.items, state.nextCursor]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = state.items.find((item) => item.id === selectedId) || null;
  const select = (item) => { setSelectedId(item.id); setReason(''); setNameHe(item.names?.he || ''); setPolicy({ kind: item.canonicalPolicy?.kind || 'city_hub', groupingPolicy: item.canonicalPolicy?.groupingPolicy || 'self', parentId: item.canonicalPolicy?.parentId || '', aliases: (item.canonicalPolicy?.aliases || []).join(', ') }); setReassignment({ countryId: item.countryId || '', cityId: '', preview: null, job: null }); setAction({ busy: '', error: '', success: '' }); setImageCandidates([]); setAirportCandidates([]); };
  const refresh = async (item) => {
    const details = await getDestinationReview(item.countryId, item.cityId);
    setState((current) => ({ ...current, items: sortReviews(current.items.map((entry) => entry.id === item.id ? mergeDetails(entry, details) : entry)) }));
  };
  const run = async (name, operation, { refreshAfter = true, success = 'הפעולה הושלמה ותועדה.' } = {}) => {
    if (action.busy) return;
    setAction({ busy: name, error: '', success: '' });
    try {
      const result = await operation();
      if (refreshAfter && selected) await refresh(selected);
      setAction({ busy: '', error: '', success });
      return result;
    } catch (error) { setAction({ busy: '', error: safeAdminError(error, { operationMayContinue: true }), success: '' }); return null; }
  };
  const requireReason = (operation) => {
    if (reason.trim().length < 3) { setAction({ busy: '', error: 'יש לכתוב סיבה קצרה לתיעוד הפעולה.', success: '' }); return null; }
    return operation(reason.trim());
  };

  useEffect(() => {
    if (!renameJob || !['queued', 'running'].includes(renameJob.status)) return undefined;
    const timer = setTimeout(async () => {
      try {
        const latest = await getDestinationRenameJob(renameJob.jobId);
        setRenameJob((current) => ({ ...current, ...latest }));
        if (latest.status === 'complete' && selected) await refresh(selected);
      } catch (error) { setRenameJob((current) => ({ ...current, status: 'poll_error', error: safeAdminError(error) })); }
    }, 1200);
    return () => clearTimeout(timer);
  }, [renameJob, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!reassignment.job || !['queued', 'running'].includes(reassignment.job.status)) return undefined;
    const timer = setTimeout(async () => {
      try {
        const latest = await getDestinationReassignmentJob(reassignment.job.jobId);
        setReassignment((current) => ({ ...current, job: { ...current.job, ...latest } }));
        if (latest.status === 'complete') await load();
      } catch (error) {
        setReassignment((current) => ({ ...current, job: { ...current.job, status: 'poll_error', error: safeAdminError(error) } }));
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [reassignment.job]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async () => {
    if (reason.trim().length < 3) return setAction({ busy: '', error: 'יש לכתוב סיבה לפני בחירת התמונה.', success: '' });
    const uri = await run('pick-image', () => uploader.pickFromGallery(), { refreshAfter: false, success: '' });
    if (!uri) return;
    const asset = await run('upload-image', () => uploader.uploadImageAsset(uri), { refreshAfter: false, success: '' });
    if (!asset) return;
    await run('save-image', () => setDestinationUploadedImage(selected.countryId, selected.cityId, asset, reason.trim(), selected.names?.he || selected.names?.en || ''));
  };

  return (
    <View testID="admin-destinations-content">
      {onBackToCase ? <AdminAction compact label="חזרה לתיק המודרציה" onPress={onBackToCase} testID="admin-destination-back-to-case" /> : null}
      <View style={styles.sectionHeading}><AppText style={styles.sectionTitle}>מקומות</AppText><AppText style={styles.sectionDescription}>אימות נתוני עיר, ספק, תמונה ושדה תעופה. כל שינוי נשמר עם סיבה ומצב לפני/אחרי.</AppText></View>
      <AdminAsyncState loading={state.loading} error={state.error} empty={!state.loading && !state.error && !state.items.length} onRetry={() => load()} testID="admin-destinations" />
      {detailState.error ? <View style={styles.error}><AppText style={styles.errorText}>{detailState.error}</AppText></View> : null}
      {!state.loading && !state.error ? <View style={styles.destinationLayout}><View style={styles.destinationList}>{state.items.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.countryId === focusCountryId && item.cityId === focusCityId ? 'בקרת העיר שנפתחה מההתראה' : `פתיחת בקרת ${item.names?.he || item.names?.en || item.cityId}`} testID={`admin-destination-${item.id}`} style={[styles.searchResult, item.id === selectedId && styles.queueRowActive]} onPress={() => select(item)}><View style={styles.searchResultBody}><AppText style={styles.contextStrong}>{item.names?.he || item.names?.en || item.cityId}</AppText><AppText style={styles.body}>{item.countryNames?.he || item.countryId} · {item.recommendationCount || 0} המלצות</AppText></View><View style={[styles.badge, item.status === 'blocked' && styles.badgeUrgent]}><AppText style={[styles.badgeText, item.status === 'blocked' && styles.badgeUrgentText]}>{statusLabel(item.status)}</AppText></View></Pressable>)}{state.nextCursor ? <AdminAction label="מקומות נוספים" onPress={() => load({ append: true })} /> : null}</View>
      {selected ? <View style={styles.destinationDetail}><View style={styles.row}><View><AppText style={styles.subsectionTitle}>{selected.names?.he || selected.names?.en || selected.cityId}</AppText><AppText style={styles.body}>{selected.countryId}/{selected.cityId}</AppText></View><View style={styles.badge}><AppText style={styles.badgeText}>{statusLabel(selected.status)}</AppText></View></View>{selected.image?.urls?.feed ? <View style={styles.destinationImageWrap}><Image source={{ uri: selected.image.urls.feed }} style={styles.destinationImage} resizeMode="cover" /><PhotoAttribution image={selected.image} placement="admin" /></View> : null}
        <AppText style={styles.body}>שדה תעופה: {selected.closestAirport?.iataCode || 'חסר'} · המלצות פעילות: {selected.recommendationCount || 0}</AppText>
        {(selected.issues || []).map((issue) => <View key={issue.code} style={[styles.issue, issue.severity === 'error' && styles.issueError]}><AppText style={styles.body}>{issue.severity === 'error' ? 'שגיאה: ' : issue.severity === 'warning' ? 'אזהרה: ' : ''}{issue.label}</AppText></View>)}
        <AppTextInput style={styles.textArea} value={reason} onChangeText={setReason} placeholder="סיבה מחייבת לכל שינוי" multiline accessibilityLabel="סיבה לשינוי מקום" />
        <View style={styles.actions}><AdminAction label="אימות מחדש מול הספק" busy={action.busy === 'recheck'} disabled={Boolean(action.busy)} onPress={() => run('recheck', () => recheckDestination(selected.countryId, selected.cityId))} testID={`admin-destination-recheck-${selected.id}`} /><AdminAction label="אישור המקום" busy={action.busy === 'approve'} disabled={Boolean(action.busy) || selected.status === 'blocked'} onPress={() => requireReason((value) => run('approve', () => approveDestination(selected.countryId, selected.cityId, value)))} testID={`admin-destination-approve-${selected.id}`} /></View>
        <View style={destinationContextCardStyle}><AppText style={styles.subsectionTitle}>שם עברי</AppText><AppTextInput style={styles.input} value={nameHe} onChangeText={setNameHe} placeholder="שם המקום בעברית" accessibilityLabel="שם המקום בעברית" testID={`admin-destination-rename-name-${selected.id}`} /><AdminAction label="שמירת השם" busy={action.busy === 'rename'} disabled={Boolean(action.busy)} onPress={() => requireReason(async (value) => { const job = await run('rename', () => setDestinationHebrewName(selected.countryId, selected.cityId, nameHe, value), { refreshAfter: false }); if (job) setRenameJob(job); })} testID={`admin-destination-rename-save-${selected.id}`} />{renameJob ? <AppText style={styles.body} testID={`admin-destination-rename-progress-${selected.id}`}>{renameJob.status === 'complete' ? 'השם עודכן בכל התוכן המקושר.' : renameJob.status === 'failed' ? 'העדכון נעצר. אפשר לנסות שוב.' : renameJob.status === 'poll_error' ? renameJob.error : 'מעדכן תוכן מקושר…'}</AppText> : null}</View>
        <View style={destinationContextCardStyle} testID={`admin-destination-policy-${selected.id}`}><AppText style={styles.subsectionTitle}>מדיניות יעד קנונית</AppText><AppText style={styles.body}>סוג יעד: {DESTINATION_KIND_LABELS[policy.kind] || policy.kind} · אופן שיוך: {GROUPING_POLICY_LABELS[policy.groupingPolicy] || policy.groupingPolicy}</AppText><View style={styles.actions}>{['city_hub', 'island', 'natural_feature', 'tourism_region', 'province'].map((kind) => <AdminAction key={kind} label={DESTINATION_KIND_LABELS[kind]} disabled={Boolean(action.busy)} onPress={() => setPolicy((current) => ({ ...current, kind }))} />)}</View><View style={styles.actions}>{['self', 'parent', 'approved_children'].map((groupingPolicy) => <AdminAction key={groupingPolicy} label={GROUPING_POLICY_LABELS[groupingPolicy]} disabled={Boolean(action.busy)} onPress={() => setPolicy((current) => ({ ...current, groupingPolicy }))} />)}</View><AppTextInput style={styles.input} value={policy.parentId} onChangeText={(parentId) => setPolicy((current) => ({ ...current, parentId }))} placeholder="מזהה יעד הורה (רשות)" accessibilityLabel="מזהה יעד הורה" /><AppTextInput style={styles.textArea} value={policy.aliases} onChangeText={(aliases) => setPolicy((current) => ({ ...current, aliases }))} placeholder="כינויים מופרדים בפסיקים" accessibilityLabel="כינויי יעד" multiline /><AdminAction label="שמירת מדיניות" busy={action.busy === 'policy'} disabled={Boolean(action.busy)} onPress={() => requireReason((value) => run('policy', () => updateDestinationPolicy(selected.countryId, selected.cityId, { kind: policy.kind, groupingPolicy: policy.groupingPolicy, parentId: policy.parentId.trim() || null, aliases: policy.aliases.split(',').map((alias) => alias.trim()).filter(Boolean) }, value)))} testID={`admin-destination-policy-save-${selected.id}`} /></View>
        <View style={destinationContextCardStyle} testID={`admin-destination-reassignment-${selected.id}`}><AppText style={styles.subsectionTitle}>מיזוג או שינוי שיוך</AppText><AppText style={styles.body}>יש להציג תחילה ספירת השפעה. רק אותה ספירה ניתנת לאישור.</AppText><AppTextInput style={styles.input} value={reassignment.countryId} onChangeText={(countryId) => setReassignment((current) => ({ ...current, countryId, preview: null }))} placeholder="קוד מדינת היעד" accessibilityLabel="מדינת יעד למיזוג" /><AppTextInput style={styles.input} value={reassignment.cityId} onChangeText={(cityId) => setReassignment((current) => ({ ...current, cityId, preview: null }))} placeholder="מזהה היעד הקנוני" accessibilityLabel="מזהה יעד למיזוג" /><AdminAction label="הצגת השפעה" busy={action.busy === 'preview-reassignment'} disabled={Boolean(action.busy) || !reassignment.countryId.trim() || !reassignment.cityId.trim()} onPress={async () => { const preview = await run('preview-reassignment', () => previewDestinationReassignment({ countryId: selected.countryId, cityId: selected.cityId }, { countryId: reassignment.countryId.trim(), cityId: reassignment.cityId.trim() }), { refreshAfter: false, success: '' }); if (preview) setReassignment((current) => ({ ...current, preview })); }} testID={`admin-destination-reassignment-preview-${selected.id}`} />{reassignment.preview ? <View><AppText style={styles.body}>השפעה: {reassignment.preview.counts?.recommendations || 0} המלצות, {reassignment.preview.counts?.routes || 0} מסלולים, {reassignment.preview.counts?.trips || 0} טיולים ו־{reassignment.preview.counts?.favorites || 0} מועדפים.</AppText><AdminAction label="אישור והתחלת המיזוג" danger busy={action.busy === 'start-reassignment'} disabled={Boolean(action.busy)} onPress={() => requireReason(async (value) => { const job = await run('start-reassignment', () => startDestinationReassignment({ countryId: selected.countryId, cityId: selected.cityId }, { countryId: reassignment.countryId.trim(), cityId: reassignment.cityId.trim() }, reassignment.preview.impactHash, value), { refreshAfter: false }); if (job) setReassignment((current) => ({ ...current, job })); })} testID={`admin-destination-reassignment-start-${selected.id}`} /></View> : null}{reassignment.job ? <AppText style={styles.body} testID={`admin-destination-reassignment-progress-${selected.id}`}>{reassignment.job.status === 'complete' ? 'המיזוג הושלם בכל התוכן המקושר.' : reassignment.job.status === 'failed' ? 'המיזוג נעצר וניתן לחידוש לאחר בדיקה.' : reassignment.job.status === 'poll_error' ? reassignment.job.error : 'המיזוג מתבצע בשלבים…'}</AppText> : null}</View>
        <View style={destinationContextCardStyle}><AppText style={styles.subsectionTitle}>תמונה מאומתת</AppText><View style={styles.actions}><AdminAction label="הצעות לתמונה" busy={action.busy === 'image-candidates'} disabled={Boolean(action.busy)} onPress={async () => { const result = await run('image-candidates', () => getDestinationImageCandidates(selected.countryId, selected.cityId), { refreshAfter: false, success: '' }); setImageCandidates(result?.items || []); }} testID={`admin-destination-image-candidates-${selected.id}`} /><AdminAction label="העלאת תמונה" busy={['pick-image', 'upload-image', 'save-image'].includes(action.busy)} disabled={Boolean(action.busy)} onPress={upload} testID={`admin-destination-upload-${selected.id}`} /></View>{imageCandidates.map((candidate) => <View key={candidate.id} style={styles.candidate}>{candidate.image?.urls?.feed ? <View style={styles.candidateImageWrap}><Image source={{ uri: candidate.image.urls.feed }} style={styles.candidateImage} /><PhotoAttribution image={candidate.image} placement="admin" /></View> : null}<AdminAction label="בחירת התמונה" disabled={Boolean(action.busy)} onPress={() => requireReason((value) => run(`image:${candidate.id}`, () => selectDestinationImageCandidate(selected.countryId, selected.cityId, candidate.id, value)))} testID={`admin-image-candidate-${candidate.id}`} /></View>)}</View>
        <View style={destinationContextCardStyle}><AppText style={styles.subsectionTitle}>שדה תעופה</AppText><AdminAction label="טעינת מועמדים מאומתים" busy={action.busy === 'airports'} disabled={Boolean(action.busy)} onPress={async () => { const result = await run('airports', () => getAirportCandidates(selected.countryId, selected.cityId), { refreshAfter: false, success: '' }); setAirportCandidates(result?.items || []); }} testID={`admin-destination-airports-${selected.id}`} />{airportCandidates.map((airport) => <View key={airport.ident || airport.iataCode} style={styles.candidate}><AppText style={styles.contextStrong}>{airport.iataCode} · {airport.name}</AppText><AppText style={styles.body}>{airport.distanceKm} ק״מ</AppText><AdminAction label="בחירה" disabled={Boolean(action.busy)} onPress={() => requireReason((value) => run(`airport:${airport.iataCode}`, () => setDestinationAirport(selected.countryId, selected.cityId, airport.iataCode, value)))} testID={`admin-airport-candidate-${airport.iataCode}`} /></View>)}</View>
        {action.error ? <AppText style={styles.inlineError}>{action.error}</AppText> : null}{action.success ? <AppText style={styles.inlineSuccess}>{action.success}</AppText> : null}
        <View style={styles.dangerZoneColumn}><AppText style={styles.dangerZoneText}>השבתת מקום מסתירה את התוכן המקושר ומעבירה אותו לבדיקה.</AppText><AdminAction label="השבתת המקום" danger busy={action.busy === 'deactivate'} disabled={Boolean(action.busy) || selected.destinationStatus === 'inactive'} onPress={() => requireReason((value) => run('deactivate', () => deactivateDestination(selected.countryId, selected.cityId, value)))} testID={`admin-destination-deactivate-${selected.id}`} /></View>
      </View> : <View style={styles.empty}><AppText style={styles.emptyText}>בחרו מקום כדי להתחיל בדיקה.</AppText></View>}</View> : null}
    </View>
  );
}

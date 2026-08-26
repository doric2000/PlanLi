import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
import { updateAdminAttachedPlace } from '../../../services/AdminService';
import { resolveDestinationForPlacePreview, searchPlaces } from '../../../services/LocationService';
import { adminStyles as styles } from '../../../styles';
import { safeAdminError } from '../adminErrors';
import AdminAction from './AdminAction';

export default function AdminAttachedPlaceReview({ details, onUpdated }) {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [resolved, setResolved] = useState(null);
  const [reason, setReason] = useState('');
  const [state, setState] = useState({ busy: '', error: '', success: '' });

  const search = async () => {
    if (query.trim().length < 2) return setState({ busy: '', error: 'יש להזין לפחות שני תווים.', success: '' });
    setState({ busy: 'search', error: '', success: '' });
    try {
      setCandidates(await searchPlaces(query.trim()));
      setState({ busy: '', error: '', success: '' });
    } catch (error) { setState({ busy: '', error: 'לא ניתן לקבל מועמדים מאומתים כרגע.', success: '' }); }
  };
  const choose = async (candidate) => {
    setState({ busy: candidate.id, error: '', success: '' });
    try {
      const result = await resolveDestinationForPlacePreview(candidate);
      if (result.status === 'destination_choice_required' || !result.resolvedPlaceToken) {
        setResolved(null);
        setState({ busy: '', error: 'המועמד אינו חד־משמעי. נסו חיפוש מדויק יותר.', success: '' });
        return;
      }
      setResolved(result);
      setState({ busy: '', error: '', success: '' });
    } catch (error) { setState({ busy: '', error: 'לא ניתן לאמת את המועמד מול הספק.', success: '' }); }
  };
  const apply = async (action) => {
    if (reason.trim().length < 3) return setState({ busy: '', error: 'יש לכתוב סיבה קצרה לשינוי.', success: '' });
    if (action === 'replace' && !resolved?.resolvedPlaceToken) return;
    setState({ busy: action, error: '', success: '' });
    try {
      await updateAdminAttachedPlace({
        caseId: details.id,
        expectedRevision: details.revision || 0,
        target: details.target,
        action,
        reason: reason.trim(),
        ...(action === 'replace' ? { resolvedPlaceToken: resolved.resolvedPlaceToken } : {}),
      });
      setState({ busy: '', error: '', success: action === 'replace' ? 'המקום הוחלף במועמד המאומת.' : 'דיוק המקום הורד לרמת העיר.' });
      setCandidates([]);
      setResolved(null);
      await onUpdated?.();
    } catch (error) { setState({ busy: '', error: safeAdminError(error), success: '' }); }
  };

  return (
    <View style={styles.contextCard} testID="admin-attached-place-review">
      <AppText style={styles.subsectionTitle}>בדיקת המקום המחובר</AppText>
      <AppText style={styles.helpText}>החלפה נשמרת רק אחרי אימות ספק והתאמה לעיר הקיימת. אפשר להוריד דיוק לעיר בלבד כאשר סוג התוכן מאפשר זאת.</AppText>
      <View style={styles.savedViewEditor}><AppTextInput style={styles.savedViewInput} value={query} onChangeText={setQuery} placeholder="חיפוש מקום חלופי" onSubmitEditing={search} accessibilityLabel="חיפוש מקום חלופי" /><AdminAction compact label="חיפוש" busy={state.busy === 'search'} disabled={Boolean(state.busy)} onPress={search} /></View>
      {candidates.map((candidate) => <Pressable key={candidate.id} accessibilityRole="button" style={styles.candidate} onPress={() => choose(candidate)}><AppText style={styles.contextStrong}>{candidate.structured_formatting?.main_text || candidate.description}</AppText><AppText style={styles.helpText}>{candidate.structured_formatting?.secondary_text}</AppText></Pressable>)}
      {resolved?.place ? <View style={styles.issue}><AppText style={styles.contextStrong}>מועמד מאומת: {resolved.place.name}</AppText><AppText style={styles.body}>{resolved.place.address}</AppText></View> : null}
      <AppTextInput style={styles.textArea} value={reason} onChangeText={setReason} placeholder="סיבה לשינוי המקום" multiline accessibilityLabel="סיבה לשינוי מקום מחובר" />
      <View style={styles.actions}><AdminAction label="שמירת המועמד המאומת" primary busy={state.busy === 'replace'} disabled={Boolean(state.busy) || !resolved} onPress={() => apply('replace')} testID="admin-place-replace" /><AdminAction label="דיוק ברמת העיר בלבד" busy={state.busy === 'city_only'} disabled={Boolean(state.busy)} onPress={() => apply('city_only')} testID="admin-place-city-only" /></View>
      {state.error ? <AppText style={styles.inlineError}>{state.error}</AppText> : null}{state.success ? <AppText style={styles.inlineSuccess}>{state.success}</AppText> : null}
    </View>
  );
}

import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
import {
  getAdminResource,
  resolveModerationCase,
  searchAdminResources,
} from '../../../services/AdminService';
import { adminStyles as styles } from '../../../styles';
import { safeAdminError } from '../adminErrors';
import { STATUS_LABELS, TARGET_LABELS } from '../adminLabels';
import AdminAction from './AdminAction';
import AdminAsyncState from './AdminAsyncState';
import ModerationTargetPreview from './ModerationTargetPreview';
import { DecisionPanel } from './ModerationQueueSection';

export default function AdminSearchSection({ policy, onOpenCase }) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState({
    loading: false,
    loadingMore: false,
    error: '',
    items: [],
    nextCursor: null,
    searchQuery: '',
    searched: false,
  });
  const [selected, setSelected] = useState(null);
  const [detailState, setDetailState] = useState({ loading: false, error: '' });
  const [decisionState, setDecisionState] = useState({ busy: false, error: '', success: '' });

  const search = async ({ append = false } = {}) => {
    const normalized = append ? state.searchQuery : query.replace(/\s+/gu, ' ').trim();
    if (normalized.length < 2) {
      setState((current) => ({ ...current, error: 'יש להזין לפחות שני תווים. אימייל מחופש בהתאמה מלאה בלבד.' }));
      return;
    }
    if (!append) {
      setSelected(null);
      setDecisionState({ busy: false, error: '', success: '' });
    }
    setState((current) => ({
      ...current,
      loading: !append,
      loadingMore: append,
      error: '',
      searched: true,
    }));
    try {
      const result = await searchAdminResources({
        query: normalized,
        ...(append && state.nextCursor ? { cursor: state.nextCursor } : {}),
      });
      setState((current) => ({
        loading: false,
        loadingMore: false,
        error: '',
        searched: true,
        searchQuery: normalized,
        items: append ? [...current.items, ...(result.items || [])] : (result.items || []),
        nextCursor: result.nextCursor || null,
      }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, loadingMore: false, error: safeAdminError(error) }));
    }
  };

  const open = async (item) => {
    setDetailState({ loading: true, error: '' });
    try {
      const resource = await getAdminResource(item.target);
      setSelected(resource);
      setDecisionState({ busy: false, error: '', success: '' });
      setDetailState({ loading: false, error: '' });
    } catch (error) {
      setDetailState({ loading: false, error: safeAdminError(error) });
    }
  };

  const resolveFromSearch = async (payload) => {
    setDecisionState({ busy: true, error: '', success: '' });
    try {
      const result = await resolveModerationCase(payload);
      setDecisionState({ busy: false, error: '', success: 'ההחלטה נשמרה ונפתח תיק מתועד.' });
      if (result?.caseId) onOpenCase(result.caseId);
    } catch (error) {
      setDecisionState({ busy: false, error: safeAdminError(error, { operationMayContinue: true }), success: '' });
    }
  };

  return (
    <View testID="admin-search-content">
      <View style={styles.sectionHeading}><AppText style={styles.sectionTitle}>חיפוש תוכן</AppText><AppText style={styles.sectionDescription}>חיפוש לפי מזהה, שם ציבורי, כותרת, עיר או מקום. אימייל נבדק בהתאמה מדויקת ואינו נשמר באינדקס.</AppText></View>
      <View style={styles.searchHero}>
        <Ionicons name="search-outline" size={22} color="#667085" />
        <AppTextInput value={query} onChangeText={setQuery} onSubmitEditing={search} autoCapitalize="none" placeholder="חיפוש תוכן, משתמש או מקום" accessibilityLabel="חיפוש משאבי ניהול" testID="admin-resource-search-input" style={styles.searchInput} />
        <AdminAction label="חיפוש" primary busy={state.loading} onPress={search} testID="admin-resource-search" />
      </View>
      <AdminAsyncState loading={state.loading} error={state.error} empty={state.searched && !state.loading && !state.error && !state.items.length} onRetry={search} testID="admin-search" emptyText="לא נמצאו תוצאות שמתאימות לחיפוש." />
      {!state.loading && !state.error ? <View style={styles.searchResults}>{state.items.map((item) => <Pressable key={item.id} accessibilityRole="button" testID={`admin-search-result-${item.id}`} style={styles.searchResult} onPress={() => open(item)}><View style={styles.searchResultIcon}><Ionicons name={item.type === 'profile' ? 'person-outline' : item.type === 'destination' ? 'location-outline' : 'document-text-outline'} size={20} color="#3448C5" /></View><View style={styles.searchResultBody}><AppText style={styles.contextStrong}>{item.title || 'ללא כותרת'}</AppText><AppText style={styles.body}>{TARGET_LABELS[item.type] || 'תוכן'} · {STATUS_LABELS[item.status] || 'מצב לא ידוע'}</AppText>{item.subtitle ? <AppText style={styles.helpText}>{item.subtitle}</AppText> : null}</View><Ionicons name="chevron-back" size={20} color="#98A2B3" /></Pressable>)}{state.nextCursor ? <AdminAction label="תוצאות נוספות" busy={state.loadingMore} onPress={() => search({ append: true })} testID="admin-search-load-more" /> : null}</View> : null}
      {detailState.loading || detailState.error ? <AdminAsyncState loading={detailState.loading} error={detailState.error} testID="admin-search-detail" /> : null}
      {selected ? <View style={styles.resourceDetail} testID="admin-search-detail"><AppText style={styles.subsectionTitle}>פרטי המשאב</AppText><ModerationTargetPreview preview={selected.preview} />{selected.case ? <><AppText style={styles.body}>קיים תיק: {STATUS_LABELS[selected.case.status] || 'פתוח'}</AppText><AdminAction label="פתיחת תיק המודרציה" onPress={() => onOpenCase(selected.case.id)} testID="admin-search-open-case" /></> : <><AppText style={styles.helpText}>אין דיווח פתוח. אפשר לקבל החלטה ישירות וליצור תיק מתועד.</AppText><DecisionPanel details={{ target: selected.target, targetPreview: selected.preview, revision: 0 }} policy={policy} busy={decisionState.busy} error={decisionState.error} success={decisionState.success} onResolve={resolveFromSearch} /></>}</View> : null}
    </View>
  );
}

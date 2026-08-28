import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';

import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
import {
  deleteUserAsAdmin,
  getAdminUser,
  listAdminUsers,
  setUserAdmin,
  setUserEmailVerified,
  setUserSuspension,
} from '../../../services/AdminService';
import { adminStyles as styles } from '../../../styles';
import { safeAdminError } from '../adminErrors';
import AdminAction from './AdminAction';
import AdminAsyncState from './AdminAsyncState';

const cleanSearch = (value) => value.replace(/[\s!–'"`]+/gu, ' ').trim();

export default function AdminUsersSection({ focusUid = '', onBackToCase }) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState({ loading: true, error: '', items: [], nextCursor: null });
  const [selectedUid, setSelectedUid] = useState('');
  const [reason, setReason] = useState('');
  const [durationHours, setDurationHours] = useState(168);
  const [advanced, setAdvanced] = useState(false);
  const [action, setAction] = useState({ busy: '', error: '', success: '' });
  const suspensionRetry = useRef({ signature: '', operationId: '' });

  const load = useCallback(async ({ searchQuery = '', append = false } = {}) => {
    setState((current) => ({ ...current, loading: !append, error: '' }));
    try {
      const normalized = cleanSearch(searchQuery);
      const result = await listAdminUsers(normalized ? { query: normalized } : append && state.nextCursor ? { cursor: state.nextCursor } : {});
      setState((current) => ({ loading: false, error: '', items: append ? [...current.items, ...(result.items || [])] : (result.items || []), nextCursor: result.nextCursor || null }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: safeAdminError(error) }));
    }
  }, [state.nextCursor]);

  useEffect(() => {
    if (!focusUid) {
      load();
      return;
    }
    let active = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    getAdminUser(focusUid).then((item) => {
      if (!active) return;
      setState({ loading: false, error: '', items: [item], nextCursor: null });
      setSelectedUid(item.uid);
    }).catch((error) => {
      if (active) setState((current) => ({ ...current, loading: false, error: safeAdminError(error) }));
    });
    return () => { active = false; };
  }, [focusUid]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = state.items.find((item) => item.uid === selectedUid) || null;
  const patchUser = (uid, patch) => setState((current) => ({ ...current, items: current.items.map((item) => item.uid === uid ? { ...item, ...patch } : item) }));
  const suspensionOperationId = () => {
    const signature = `${selected?.uid || ''}:${durationHours ?? 'permanent'}:${reason.trim()}`;
    if (suspensionRetry.current.signature !== signature) {
      suspensionRetry.current = {
        signature,
        operationId: randomUUID?.() || `suspension-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      };
    }
    return suspensionRetry.current.operationId;
  };

  const run = async (name, operation, onSuccess) => {
    if (action.busy) return;
    if (reason.trim().length < 3) {
      setAction({ busy: '', error: 'יש לכתוב סיבה קצרה לתיעוד הפעולה.', success: '' });
      return;
    }
    setAction({ busy: name, error: '', success: '' });
    try {
      const result = await operation();
      onSuccess?.(result);
      setAction({ busy: '', error: '', success: 'הפעולה הושלמה ותועדה ביומן.' });
    } catch (error) {
      setAction({ busy: '', error: safeAdminError(error, { operationMayContinue: true }), success: '' });
    }
  };
  const confirmDelete = () => {
    const confirm = () => run('delete', () => deleteUserAsAdmin(selected.uid, reason.trim()), () => {
      setState((current) => ({ ...current, items: current.items.filter((item) => item.uid !== selected.uid) }));
      setSelectedUid('');
    });
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`מחיקה מלאה של ${selected.displayName || selected.email || selected.uid}?`)) confirm();
    } else Alert.alert('מחיקת משתמש מלאה', `היעד: ${selected.displayName || selected.email || selected.uid}\nהפעולה אינה ניתנת לביטול.`, [{ text: 'ביטול', style: 'cancel' }, { text: 'מחיקה', style: 'destructive', onPress: confirm }]);
  };

  return (
    <View testID="admin-users-content">
      {onBackToCase ? <AdminAction compact label="חזרה לתיק המודרציה" onPress={onBackToCase} testID="admin-user-back-to-case" /> : null}
      <View style={styles.sectionHeading}><AppText style={styles.sectionTitle}>משתמשים</AppText><AppText style={styles.sectionDescription}>חיפוש מדויק, מצב חשבון ופעולות אבטחה. הרשאות מנהלים נמצאות באזור מתקדם ונפרד.</AppText></View>
      <View style={styles.searchHero}><Ionicons name="search-outline" size={20} color="#667085" /><AppTextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="שם מלא, אימייל מדויק או מזהה משתמש" autoCapitalize="none" onSubmitEditing={() => load({ searchQuery: query })} testID="admin-user-search-input" /><AdminAction label="חיפוש" primary busy={state.loading && state.items.length > 0} onPress={() => load({ searchQuery: query })} testID="admin-user-search" /><AdminAction label="ניקוי" compact onPress={() => { setQuery(''); load(); }} testID="admin-user-search-clear" /></View>
      <AdminAsyncState loading={state.loading} error={state.error} empty={!state.loading && !state.error && !state.items.length} onRetry={() => load({ searchQuery: query })} testID="admin-users" />
      {!state.loading && !state.error ? <View style={styles.userLayout}><View style={styles.userList}>{state.items.map((item) => <Pressable key={item.uid} accessibilityRole="button" testID={`admin-user-${item.uid}`} style={[styles.searchResult, selectedUid === item.uid && styles.queueRowActive]} onPress={() => { setSelectedUid(item.uid); setReason(''); setAction({ busy: '', error: '', success: '' }); }}><View style={styles.userAvatar}><AppText style={styles.userAvatarText}>{(item.displayName || item.email || '?').slice(0, 1)}</AppText></View><View style={styles.searchResultBody}><AppText style={styles.contextStrong}>{item.displayName || 'ללא שם'}</AppText><AppText style={styles.body}>{item.email || item.uid}</AppText><AppText style={styles.helpText}>{item.disabled ? 'מושעה' : 'פעיל'} · {item.emailVerified ? 'אימייל מאומת' : 'אימייל לא מאומת'}</AppText></View></Pressable>)}{state.nextCursor ? <AdminAction label="משתמשים נוספים" onPress={() => load({ append: true })} /> : null}</View>
      {selected ? <View style={styles.userDetail} testID={`admin-user-detail-${selected.uid}`}><AppText style={styles.subsectionTitle}>{selected.displayName || 'משתמש ללא שם'}</AppText><AppText style={styles.body}>{selected.email || selected.uid}</AppText><AppTextInput style={styles.textArea} value={reason} onChangeText={setReason} placeholder="סיבה מחייבת לתיעוד" multiline maxLength={500} accessibilityLabel="סיבה לפעולת משתמש" />
        {selected.disabled ? <AdminAction label="החזרה לפעילות" busy={action.busy === 'reinstate'} disabled={Boolean(action.busy)} onPress={() => run('reinstate', () => setUserSuspension(selected.uid, false, reason.trim()), (result) => patchUser(result.uid, { disabled: false }))} testID={`admin-user-suspend-${selected.uid}`} /> : <><AppText style={styles.fieldLabel}>משך השעיה</AppText><View style={styles.chipRow}>{[[24, '24 שעות'], [168, '7 ימים'], [720, '30 ימים'], [null, 'קבועה']].map(([value, label]) => <Pressable key={String(value)} accessibilityRole="button" accessibilityState={{ selected: durationHours === value }} style={[styles.filterChip, durationHours === value && styles.filterChipActive]} onPress={() => setDurationHours(value)}><AppText style={[styles.filterChipText, durationHours === value && styles.filterChipTextActive]}>{label}</AppText></Pressable>)}</View><AdminAction label="השעיית החשבון" danger busy={action.busy === 'suspend'} disabled={Boolean(action.busy)} onPress={() => run('suspend', () => setUserSuspension(selected.uid, true, reason.trim(), durationHours, suspensionOperationId()), (result) => { suspensionRetry.current = { signature: '', operationId: '' }; patchUser(result.uid, { disabled: true }); })} testID={`admin-user-suspend-${selected.uid}`} /></>}
        <AdminAction label={selected.emailVerified ? 'ביטול אימות אימייל' : 'אימות אימייל'} busy={action.busy === 'verify'} disabled={Boolean(action.busy)} onPress={() => run('verify', () => setUserEmailVerified(selected.uid, !selected.emailVerified, reason.trim()), (result) => patchUser(result.uid, { emailVerified: result.verified }))} testID={`admin-user-verify-${selected.uid}`} />
        {action.error ? <AppText style={styles.inlineError}>{action.error}</AppText> : null}{action.success ? <AppText style={styles.inlineSuccess}>{action.success}</AppText> : null}
        <Pressable accessibilityRole="button" style={styles.advancedToggle} onPress={() => setAdvanced((current) => !current)} testID="admin-users-advanced-toggle"><AppText style={styles.contextStrong}>אזור מתקדם: הרשאות מנהל ומחיקה</AppText><Ionicons name={advanced ? 'chevron-up' : 'chevron-down'} size={20} color="#475467" /></Pressable>
        {advanced ? <View style={styles.dangerZoneColumn} testID="admin-users-advanced"><AppText style={styles.dangerZoneText}>שינויים כאן משפיעים על גישה למערכת. השרת חוסם פעולה עצמית והסרת המנהל האחרון.</AppText><AdminAction label={selected.admin ? 'הסרת הרשאת מנהל' : 'מתן הרשאת מנהל'} danger={selected.admin} busy={action.busy === 'admin'} disabled={Boolean(action.busy)} onPress={() => run('admin', () => setUserAdmin(selected.uid, !selected.admin, reason.trim()), (result) => patchUser(result.uid, { admin: result.admin }))} testID={`admin-user-admin-${selected.uid}`} /><AdminAction label="מחיקת משתמש מלאה" danger busy={action.busy === 'delete'} disabled={Boolean(action.busy)} onPress={confirmDelete} testID={`admin-user-delete-${selected.uid}`} /></View> : null}
      </View> : <View style={styles.empty}><AppText style={styles.emptyText}>בחרו משתמש כדי לראות פעולות זמינות.</AppText></View>}</View> : null}
    </View>
  );
}

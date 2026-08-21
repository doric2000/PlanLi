import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppText from '../../../components/AppText';
import { useAdminClaim } from '../../../hooks/useAdminClaim';
import { colors } from '../../../styles';
import { safeNotificationError } from '../notificationErrors';
import {
  DEFAULT_PUSH_PREFERENCES,
  normalizePushPreferences,
  PUSH_PREFERENCE_FIELDS,
} from '../push/preferences';
import {
  loadNotificationPushPreferences,
  saveNotificationPushPreferences,
} from '../services/NotificationSettingsService';
import {
  notificationCenterStyles as styles,
  notificationSettingsStyles as settingsStyles,
} from '../styles/notificationCenterStyles';

const PERSONAL_ROWS = [
  { key: 'likes', label: 'לייקים', hint: 'כשמישהו עושה לייק לתוכן שלך' },
  { key: 'comments', label: 'תגובות', hint: 'תגובות חדשות לתוכן שלך' },
  { key: 'system', label: 'עדכוני מערכת', hint: 'עדכונים חשובים מ־PlanLi' },
];

const ADMIN_ROWS = [
  { key: 'adminReports', label: 'דיווחים', hint: 'דיווחי קהילה שממתינים לטיפול' },
  { key: 'adminDestinations', label: 'בקרת יעדים', hint: 'יעדים חדשים שממתינים לאישור' },
];

function pushPreferenceError(error, fallback) {
  const code = String(error?.code || '').toLowerCase();
  if (code.includes('permission_denied') || code.includes('permission_required')) {
    return 'לא ניתנה הרשאה להתראות במכשיר. אפשר לאשר אותה בהגדרות המכשיר ולנסות שוב.';
  }
  if (code.includes('unsupported')) {
    return 'התראות Push אינן נתמכות במכשיר או בדפדפן הזה.';
  }
  if (code.includes('project_id_missing') || code.includes('registration_failed')) {
    return 'לא הצלחנו לרשום את המכשיר להתראות. בדקו את החיבור ונסו שוב.';
  }
  return safeNotificationError(error, fallback);
}

function preferencesEqual(left, right) {
  return PUSH_PREFERENCE_FIELDS.every((field) => left[field] === right[field]);
}

function PreferenceRow({ item, value, onChange, disabled, last = false }) {
  return (
    <View style={[settingsStyles.preferenceRow, last && settingsStyles.preferenceRowLast]}>
      <View style={settingsStyles.preferenceCopy}>
        <AppText style={settingsStyles.preferenceLabel}>{item.label}</AppText>
        <AppText style={settingsStyles.preferenceHint}>{item.hint}</AppText>
      </View>
      <Switch
        accessibilityLabel={item.label}
        accessibilityHint={item.hint}
        accessibilityState={{ checked: value, disabled }}
        disabled={disabled}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: '#8EA1BA' }}
        thumbColor={value ? colors.brand : colors.white}
        testID={`notification-preference-${item.key}`}
      />
    </View>
  );
}

export default function NotificationSettingsScreen({
  navigation: navigationProp,
  loadPreferences = loadNotificationPushPreferences,
  savePreferences = saveNotificationPushPreferences,
}) {
  const navigationHook = useNavigation();
  const navigation = navigationProp || navigationHook;
  const { isAdmin, loading: adminLoading } = useAdminClaim();
  const [preferences, setPreferences] = useState(DEFAULT_PUSH_PREFERENCES);
  const [persistedPreferences, setPersistedPreferences] = useState(DEFAULT_PUSH_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [retryEpoch, setRetryEpoch] = useState(0);
  const mountedRef = useRef(true);
  const requestRef = useRef(0);

  const dirty = useMemo(
    () => !preferencesEqual(preferences, persistedPreferences),
    [persistedPreferences, preferences]
  );

  useEffect(() => () => {
    mountedRef.current = false;
    requestRef.current += 1;
  }, []);

  useEffect(() => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError('');
    Promise.resolve(loadPreferences())
      .then((value) => {
        if (!mountedRef.current || requestId !== requestRef.current) return;
        const normalized = normalizePushPreferences(value);
        setPreferences(normalized);
        setPersistedPreferences(normalized);
      })
      .catch((loadError) => {
        if (mountedRef.current && requestId === requestRef.current) {
          setError(pushPreferenceError(
            loadError,
            'לא הצלחנו לטעון את הגדרות ההתראות. נסו שוב.'
          ));
        }
      })
      .finally(() => {
        if (mountedRef.current && requestId === requestRef.current) setLoading(false);
      });
  }, [loadPreferences, retryEpoch]);

  const updatePreference = useCallback((field, value) => {
    setSaved(false);
    setError('');
    setPreferences((current) => ({ ...current, [field]: Boolean(value) }));
  }, []);

  const save = useCallback(async () => {
    if (!dirty || saving) return;
    const requestId = ++requestRef.current;
    const submitted = preferences;
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const result = normalizePushPreferences(
        await savePreferences(submitted, persistedPreferences),
        submitted
      );
      if (!mountedRef.current || requestId !== requestRef.current) return;
      setPreferences(result);
      setPersistedPreferences(result);
      setSaved(true);
    } catch (saveError) {
      if (mountedRef.current && requestId === requestRef.current) {
        setError(pushPreferenceError(
          saveError,
          'לא הצלחנו לשמור את הגדרות ההתראות. נסו שוב.'
        ));
      }
    } finally {
      if (mountedRef.current && requestId === requestRef.current) setSaving(false);
    }
  }, [dirty, persistedPreferences, preferences, savePreferences, saving]);

  const renderRows = (rows) => rows.map((item, index) => (
    <PreferenceRow
      key={item.key}
      item={item}
      value={preferences[item.key]}
      onChange={(value) => updatePreference(item.key, value)}
      disabled={saving}
      last={index === rows.length - 1}
    />
  ));

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="חזרה"
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.iconButton, pressed && styles.rowPressed]}
          >
            <Ionicons name="chevron-forward" size={25} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.headerTitleWrap}>
          <AppText style={styles.headerTitle}>הגדרות התראות</AppText>
        </View>
        <View style={[styles.headerSide, styles.headerSideLeft]} />
      </View>

      {loading ? (
        <View accessibilityRole="progressbar" style={styles.centeredState} testID="notification-settings-loading">
          <ActivityIndicator size="large" color={colors.brand} />
          <AppText style={styles.stateTitle}>טוענים את ההגדרות</AppText>
        </View>
      ) : error && !dirty ? (
        <View accessibilityLiveRegion="assertive" style={styles.centeredState} testID="notification-settings-error">
          <Ionicons name="cloud-offline-outline" size={56} color={colors.textMuted} />
          <AppText style={styles.stateTitle}>לא הצלחנו לטעון את ההגדרות</AppText>
          <AppText style={styles.stateMessage}>{error}</AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRetryEpoch((value) => value + 1)}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.rowPressed]}
            testID="notification-settings-retry"
          >
            <AppText style={styles.primaryButtonText}>ניסיון נוסף</AppText>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={settingsStyles.scrollContent}>
          <AppText style={settingsStyles.intro}>
            אפשר לבחור אילו עדכונים יישלחו כהתראות Push. השינויים יחולו על החשבון שלך בכל המכשירים.
          </AppText>

          {error ? (
            <View accessibilityLiveRegion="assertive" style={styles.inlineBanner}>
              <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
              <AppText style={styles.inlineBannerText}>{error}</AppText>
            </View>
          ) : null}

          <View style={settingsStyles.section}>
            <AppText style={settingsStyles.sectionTitle}>התראות Push</AppText>
            <PreferenceRow
              item={{
                key: 'pushEnabled',
                label: 'הפעלת התראות Push',
                hint: 'קבלת עדכונים גם כשהאפליקציה סגורה',
              }}
              value={preferences.pushEnabled}
              onChange={(value) => updatePreference('pushEnabled', value)}
              disabled={saving}
              last
            />
          </View>

          <View style={settingsStyles.section}>
            <AppText style={settingsStyles.sectionTitle}>פעילות אישית</AppText>
            {renderRows(PERSONAL_ROWS)}
          </View>

          {isAdmin ? (
            <View style={settingsStyles.section} testID="notification-admin-preferences">
              <AppText style={settingsStyles.sectionTitle}>התראות מנהלים</AppText>
              {renderRows(ADMIN_ROWS)}
            </View>
          ) : adminLoading ? (
            <View accessibilityRole="progressbar" style={styles.footer}>
              <ActivityIndicator size="small" color={colors.brand} />
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="שמירת הגדרות ההתראות"
            accessibilityState={{ busy: saving, disabled: !dirty || saving }}
            disabled={!dirty || saving}
            onPress={save}
            style={({ pressed }) => [
              settingsStyles.saveButton,
              (!dirty || saving) && styles.primaryButtonDisabled,
              pressed && styles.rowPressed,
            ]}
            testID="notification-settings-save"
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <AppText style={styles.primaryButtonText}>שמירת הגדרות</AppText>
            )}
          </Pressable>
          {saved ? (
            <AppText accessibilityLiveRegion="polite" style={settingsStyles.savedText} testID="notification-settings-saved">
              ההגדרות נשמרו
            </AppText>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

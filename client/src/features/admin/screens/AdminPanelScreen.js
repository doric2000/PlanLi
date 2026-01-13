import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { useAuthUser } from '../../../hooks/useAuthUser';
import { useAdminClaim } from '../../../hooks/useAdminClaim';
import { useBackButton } from '../../../hooks/useBackButton';
import { buttons, colors, common, typography } from '../../../styles';

export default function AdminPanelScreen({ navigation }) {
  const { isGuest, loading: authLoading } = useAuthUser();
  const { isAdmin, loading: adminLoading } = useAdminClaim();

  useBackButton(navigation, { title: '', color: colors.primary });

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => null,
      headerRight: () => <Text style={styles.headerTitleText}>פאנל אדמין</Text>,
      headerRightContainerStyle: { paddingRight: 12 },
    });
  }, [navigation]);

  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success'|'error'|'info', message: string }

  const setAdminFn = useMemo(() => httpsCallable(getFunctions(), 'setAdmin'), []);
  const setUserVerifiedFn = useMemo(() => httpsCallable(getFunctions(), 'setUserVerified'), []);

  useEffect(() => {
    if (authLoading) return;
    if (!isGuest) return;
    navigation.navigate('Auth');
  }, [authLoading, isGuest, navigation]);

  const formatCallableError = (e) => {
    const code = e?.code ? String(e.code) : '';
    const message = e?.message ? String(e.message) : 'הפעולה נכשלה';
    const details = e?.details ? JSON.stringify(e.details) : '';
    return [code, message, details].filter(Boolean).join('\n');
  };

  const run = async (action) => {
    const value = identifier.trim();
    if (!value) {
      setStatus({ type: 'error', message: 'נא להזין אימייל או UID' });
      Alert.alert('שגיאה', 'נא להזין אימייל או UID');
      return;
    }

    const payloadBase = value.includes('@') ? { email: value } : { uid: value };

    try {
      setBusy(true);
      setStatus({ type: 'info', message: 'מבצע פעולה…' });

      if (action === 'makeAdmin') {
        await setAdminFn({ ...payloadBase, admin: true });
        setStatus({ type: 'success', message: 'בוצע: המשתמש הוגדר כאדמין. עליו להתנתק/להתחבר כדי לקבל טוקן מעודכן.' });
        Alert.alert('בוצע', 'המשתמש הוגדר כאדמין. עליו להתנתק/להתחבר כדי לקבל טוקן מעודכן.');
        return;
      }

      if (action === 'removeAdmin') {
        await setAdminFn({ ...payloadBase, admin: false });
        setStatus({ type: 'success', message: 'בוצע: האדמין הוסר. עליו להתנתק/להתחבר כדי לקבל טוקן מעודכן.' });
        Alert.alert('בוצע', 'האדמין הוסר. עליו להתנתק/להתחבר כדי לקבל טוקן מעודכן.');
        return;
      }

      if (action === 'verify') {
        await setUserVerifiedFn({ ...payloadBase, verified: true });
        setStatus({ type: 'success', message: 'בוצע: המשתמש סומן כמאומת. עליו להתנתק/להתחבר כדי לקבל טוקן מעודכן.' });
        Alert.alert('בוצע', 'המשתמש סומן כמאומת. עליו להתנתק/להתחבר כדי לקבל טוקן מעודכן.');
        return;
      }

      if (action === 'unverify') {
        await setUserVerifiedFn({ ...payloadBase, verified: false });
        setStatus({ type: 'success', message: 'בוצע: האימות בוטל. עליו להתנתק/להתחבר כדי לקבל טוקן מעודכן.' });
        Alert.alert('בוצע', 'האימות בוטל. עליו להתנתק/להתחבר כדי לקבל טוקן מעודכן.');
        return;
      }

      setStatus({ type: 'error', message: 'פעולה לא מוכרת' });
      Alert.alert('שגיאה', 'פעולה לא מוכרת');
    } catch (e) {
      const msg = formatCallableError(e);
      console.log('AdminPanel action failed:', e);
      setStatus({ type: 'error', message: msg });
      Alert.alert('שגיאה', msg);
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || adminLoading) {
    return (
      <SafeAreaView style={common.container}>
        <View style={common.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (isGuest) return null;

  if (!isAdmin) {
    return (
      <SafeAreaView style={common.container}>
        <View style={[common.containerCentered, { padding: 16 }]}> 
          <Text style={[typography.sectionTitle, { textAlign: 'right' }]}>אין הרשאה</Text>
          <Text style={[typography.meta, { textAlign: 'right', marginTop: 8 }]}>רק אדמין יכול לגשת לפאנל הזה.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={common.container}>
      <View style={styles.container}>
        <Text style={[typography.meta, { textAlign: 'right', marginTop: 6 }]}>הכנס אימייל או UID של משתמש ובחר פעולה</Text>

        <TextInput
          value={identifier}
          onChangeText={setIdentifier}
          placeholder="אימייל או UID"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          style={styles.input}
          textAlign="right"
        />

        {status?.message ? (
          <View style={styles.statusWrap}>
            {busy ? <ActivityIndicator size="small" color={colors.accent} /> : null}
            <Text
              style={[
                styles.statusText,
                status.type === 'error' ? styles.statusError : null,
                status.type === 'success' ? styles.statusSuccess : null,
              ]}
            >
              {status.message}
            </Text>
          </View>
        ) : null}

        <View style={styles.row}>
          <TouchableOpacity
            style={[buttons.submit, busy ? buttons.disabled : null, { flex: 1, marginBottom: 0 }]}
            onPress={() => run('makeAdmin')}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={buttons.submitText}>הפוך לאדמין</Text>
          </TouchableOpacity>

          <View style={{ width: 10 }} />

          <TouchableOpacity
            style={[buttons.secondary, busy ? buttons.disabled : null, { flex: 1 }]}
            onPress={() => run('removeAdmin')}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={buttons.secondaryText}>הסר אדמין</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 12 }} />

        <View style={styles.row}>
          <TouchableOpacity
            style={[buttons.submit, busy ? buttons.disabled : null, { flex: 1, marginBottom: 0 }]}
            onPress={() => run('verify')}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={buttons.submitText}>סמן כמאומת</Text>
          </TouchableOpacity>

          <View style={{ width: 10 }} />

          <TouchableOpacity
            style={[buttons.secondary, busy ? buttons.disabled : null, { flex: 1 }]}
            onPress={() => run('unverify')}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={buttons.secondaryText}>בטל אימות</Text>
          </TouchableOpacity>
        </View>

        <Text style={[typography.meta, { textAlign: 'right', marginTop: 16, color: colors.textLight, lineHeight: 20 }]}
        >
          הערה: אחרי שינוי הרשאות/אימות, המשתמש חייב להתנתק ולהתחבר מחדש כדי שהטוקן יתעדכן.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  headerTitleText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'right',
  },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    writingDirection: 'rtl',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  statusWrap: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    flex: 1,
    textAlign: 'right',
    color: colors.textSecondary,
    lineHeight: 18,
  },
  statusError: {
    color: colors.error,
  },
  statusSuccess: {
    color: colors.success,
  },
});

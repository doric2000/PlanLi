import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { auth } from '../../../config/firebase';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, signOut } from 'firebase/auth';

const PasswordField = ({
  label,
  value,
  onChangeText,
  show,
  onToggle,
  placeholder,
}) => (
  <View style={{ gap: 6 }}>
    <Text style={styles.label}>{label}</Text>

    <View style={styles.passwordRow}>
      <TextInput
        style={styles.passwordInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9aa3af"
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        textAlign="right"
        writingDirection="rtl"
      />
      <TouchableOpacity onPress={onToggle} style={styles.eyeBtn} activeOpacity={0.8}>
        <Ionicons name={show ? 'eye-off' : 'eye'} size={18} color="#4B5563" />
      </TouchableOpacity>
    </View>
  </View>
);

export default function ChangePasswordScreen({ navigation }) {
  const u = auth.currentUser;

  const canChangePassword = useMemo(() => {
    const providerIds = (u?.providerData || []).map((p) => p.providerId);
    return providerIds.includes('password');
  }, [u]);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const onChangePassword = async () => {
    if (!u) return Alert.alert('שגיאה', 'אין משתמש מחובר');
    if (!canChangePassword) {
      return Alert.alert('לא זמין', 'לא ניתן לשנות סיסמה עבור סוג ההתחברות הזה');
    }
    if (!u.email) return Alert.alert('שגיאה', 'חסר אימייל למשתמש');

    if (!currentPw) return Alert.alert('שגיאה', 'נא להזין סיסמה נוכחית');
    if (!newPw || newPw.length < 6) return Alert.alert('שגיאה', 'סיסמה חדשה חייבת להיות לפחות 6 תווים');
    if (newPw !== confirmPw) return Alert.alert('שגיאה', 'הסיסמאות לא תואמות');
    if (newPw === currentPw) return Alert.alert('שגיאה', 'הסיסמה החדשה חייבת להיות שונה');

    setSaving(true);
    try {
      const cred = EmailAuthProvider.credential(u.email, currentPw);
      await reauthenticateWithCredential(u, cred);
      await updatePassword(u, newPw);

      // ✅ logout מיד אחרי שינוי
      try {
        await signOut(auth);
      } finally {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      }
    } catch (e) {
      const code = e?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        Alert.alert('שגיאה', 'הסיסמה הנוכחית שגויה');
      } else if (code === 'auth/requires-recent-login') {
        Alert.alert('שגיאה', 'צריך להתחבר מחדש ואז לנסות שוב');
      } else if (code === 'auth/too-many-requests') {
        Alert.alert('שגיאה', 'יותר מדי ניסיונות. נסה שוב מאוחר יותר');
      } else {
        Alert.alert('שגיאה', e?.message || 'שינוי הסיסמה נכשל');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>שינוי סיסמה</Text>

        {!canChangePassword ? (
          <Text style={styles.note}>לא ניתן לשנות סיסמה עבור סוג ההתחברות הזה.</Text>
        ) : (
          <>
            <PasswordField
              label="סיסמה נוכחית"
              value={currentPw}
              onChangeText={setCurrentPw}
              show={showCurrent}
              onToggle={() => setShowCurrent(v => !v)}
              placeholder="הזן סיסמה נוכחית"
            />

            <PasswordField
              label="סיסמה חדשה"
              value={newPw}
              onChangeText={setNewPw}
              show={showNew}
              onToggle={() => setShowNew(v => !v)}
              placeholder="הזן סיסמה חדשה"
            />

            <PasswordField
              label="אימות סיסמה חדשה"
              value={confirmPw}
              onChangeText={setConfirmPw}
              show={showConfirm}
              onToggle={() => setShowConfirm(v => !v)}
              placeholder="הזן שוב סיסמה חדשה"
            />

            <TouchableOpacity
              style={[styles.primaryBtn, saving && styles.btnDisabled]}
              activeOpacity={0.9}
              onPress={onChangePassword}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>שנה סיסמה</Text>}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Text style={styles.backBtnText}>חזרה</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 18, gap: 12 },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'right', marginBottom: 4 },

  label: { fontSize: 14, fontWeight: '700', textAlign: 'right', color: '#111827' },
  note: { color: '#6B7280', textAlign: 'right', lineHeight: 18 },

  passwordRow: {
    height: 54,
    flexDirection: 'row-reverse', // מתאים לעברית + שהעין תהיה בצד שמאל
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  passwordInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    paddingVertical: 0,
  },
  eyeBtn: { paddingHorizontal: 6, paddingVertical: 10 },

  primaryBtn: {
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22375B',
    marginTop: 6,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnDisabled: { opacity: 0.7 },

  backBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,55,91,0.08)',
    marginTop: 6,
  },
  backBtnText: { color: '#22375B', fontWeight: '800' },
});

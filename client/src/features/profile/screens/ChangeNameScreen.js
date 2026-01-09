import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../../../config/firebase';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function ChangeNameScreen({ navigation }) {
  const u = auth.currentUser;
  const [name, setName] = useState(u?.displayName || '');
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!u) return Alert.alert('שגיאה', 'אין משתמש מחובר');
    const next = name.trim();
    if (!next) return Alert.alert('שגיאה', 'נא להכניס שם');

    setSaving(true);
    try {
      await updateProfile(u, { displayName: next });
      await setDoc(
        doc(db, 'users', u.uid),
        { displayName: next, updatedAt: serverTimestamp() },
        { merge: true }
      );

      Alert.alert('הצלחה', 'השם עודכן בהצלחה');
      navigation.goBack();
    } catch (e) {
      Alert.alert('שגיאה', e?.message || 'עדכון השם נכשל');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>שינוי שם</Text>

        <Text style={styles.label}>שם חדש</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="לדוגמה: מעדנת שף בתל אביב"
          placeholderTextColor="#9aa3af"
          autoCapitalize="words"
          textAlign="right"
          writingDirection="rtl"
        />

        <TouchableOpacity
          style={[styles.primaryBtn, saving && styles.btnDisabled]}
          activeOpacity={0.9}
          onPress={onSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>שמור</Text>}
        </TouchableOpacity>

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

  input: {
    height: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111827',
  },

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
  },
  backBtnText: { color: '#22375B', fontWeight: '800' },
});

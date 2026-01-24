import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

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

      Alert.alert('הצלחה', 'השם עודכן בהצלחה', [
        { text: 'אישור', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('שגיאה', e?.message || 'עדכון השם נכשל');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} testID="change-name-screen">
      {/* Header: back left + title center */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.8}
          testID="change-name-back"
        >
          <Ionicons name="arrow-back" size={22} color="#111" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>שינוי שם</Text>

        <View style={styles.rightSpacer} />
      </View>

      <View style={styles.container}>
        <Text style={styles.label}>שם חדש</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="כאן מוסיפים את השם החדש"
          placeholderTextColor="#9aa3af"
          autoCapitalize="words"
          textAlign="right"
          writingDirection="rtl"
          testID="change-name-input"
        />

        <TouchableOpacity
          style={[styles.primaryBtn, saving && styles.btnDisabled]}
          activeOpacity={0.9}
          onPress={onSave}
          disabled={saving}
          testID="change-name-submit"
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>עדכן</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
  },
  rightSpacer: { width: 44, height: 44 },

  container: { flex: 1, paddingHorizontal: 16, paddingTop: 18, gap: 12 },

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
});

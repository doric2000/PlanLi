import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { auth, db } from '../../../config/firebase';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { changeNameScreenStyles as styles } from '../../../styles';


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

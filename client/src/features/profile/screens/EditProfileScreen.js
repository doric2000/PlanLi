import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, getDoc } from 'firebase/firestore';

import { auth, db } from '../../../config/firebase';
import { saveProfile } from '../../../services/ProfileService';
import {
  buttons,
  cards,
  colors,
  common,
  editProfileScreenStyles as styles,
  preferenceSetupStyles as preferenceStyles,
  tags,
} from '../../../styles';
import { useBackButton } from '../../../hooks/useBackButton';
import { useUnsavedLeaveGuard } from '../../../hooks/useUnsavedLeaveGuard';
import UnsavedChangesModal from '../../../components/UnsavedChangesModal';
import { UNSAVED_LEAVE_MESSAGE, UNSAVED_LEAVE_TITLE } from '../../../constants/unsavedLeaveStrings';
import {
  BUDGETS, INTERESTS, NEEDS, PACES, TRAVEL_PARTIES, VIBES,
} from '../constants/smartProfileOptions';
import { normalizeClientSmartProfile } from '../utils/preferenceSetup';

const EMPTY = { interests: [], budget: '', travelParties: [], vibe: [], pace: '', needs: [] };

function Chip({ option, selected, onPress, testID }) {
  return (
    <TouchableOpacity testID={testID} onPress={onPress}
      style={[tags.filterChip, selected && tags.filterChipSelected]} activeOpacity={0.8}>
      <Text style={[tags.filterChipText, selected && tags.filterChipTextSelected]}>
        {option.label}{option.helper ? ` · ${option.helper}` : ''}
      </Text>
    </TouchableOpacity>
  );
}

function comparable(profile) {
  return JSON.stringify({
    ...profile,
    interests: [...profile.interests].sort(),
    travelParties: [...profile.travelParties].sort(),
    vibe: [...profile.vibe].sort(),
    needs: [...profile.needs].sort(),
  });
}

export default function EditProfileScreen({ navigation }) {
  const uid = auth.currentUser?.uid;
  const [profile, setProfile] = useState(EMPTY);
  const [baseline, setBaseline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unsavedModalVisible, setUnsavedModalVisible] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!uid) return;
      const snapshot = await getDoc(doc(db, 'users', uid));
      const current = snapshot.data()?.smartProfile || {};
      const next = normalizeClientSmartProfile(current);
      if (active) {
        setProfile(next);
        setBaseline(comparable(next));
        setLoading(false);
      }
    }
    load().catch(() => setLoading(false));
    return () => { active = false; };
  }, [uid]);

  const toggle = useCallback((field, value, maximum) => {
    setProfile((previous) => {
      const values = previous[field];
      if (values.includes(value)) return { ...previous, [field]: values.filter((entry) => entry !== value) };
      if (values.length >= maximum) return previous;
      return { ...previous, [field]: [...values, value] };
    });
  }, []);

  const hasUnsavedChanges = baseline != null && comparable(profile) !== baseline;
  const pendingDiscardRef = useRef(null);
  const dismissUnsavedModal = useCallback(() => {
    setUnsavedModalVisible(false);
    pendingDiscardRef.current = null;
  }, []);
  const confirmUnsavedLeave = useCallback(() => {
    const onConfirm = pendingDiscardRef.current;
    setUnsavedModalVisible(false);
    pendingDiscardRef.current = null;
    onConfirm?.();
  }, []);
  const { allowLeaveRef, handleHeaderBackPress } = useUnsavedLeaveGuard({
    navigation,
    guardActive: Boolean(uid && baseline != null && !loading),
    sessionKey: uid || '',
    hasUnsavedChanges,
    submitting: saving,
    openUnsavedPrompt: (onConfirm) => {
      pendingDiscardRef.current = onConfirm;
      setUnsavedModalVisible(true);
    },
  });
  useBackButton(navigation, { title: 'העדפות הטיול שלי', color: colors.primary, onPress: handleHeaderBackPress });

  const save = async () => {
    if (profile.interests.length < 3 || !profile.budget || profile.travelParties.length < 1) {
      Alert.alert('חסר מידע', 'יש לבחור לפחות 3 תחומי עניין, תקציב והרכב מטיילים.');
      return;
    }
    setSaving(true);
    try {
      await saveProfile({ smartProfile: profile }, { completeSmartProfile: true });
      setBaseline(comparable(profile));
      Alert.alert('נשמר', 'העדפות הטיול עודכנו.', [{ text: 'אישור', onPress: () => {
        allowLeaveRef.current = true;
        navigation.goBack();
      } }]);
    } catch (error) {
      Alert.alert('שגיאה', error?.message || 'לא הצלחנו לשמור את ההעדפות.');
    } finally {
      setSaving(false);
    }
  };

  const section = (title, options, values, onPress, prefix, help) => (
    <View style={[cards.card, preferenceStyles.editSectionCard]}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {!!help && <Text style={preferenceStyles.editSectionHelp}>{help}</Text>}
      <View style={[tags.chipRow, preferenceStyles.editChipRow]}>
        {options.map((option) => <Chip key={option.value} option={option} selected={values.includes(option.value)}
          onPress={() => onPress(option.value)} testID={`${prefix}-${option.value}`} />)}
      </View>
    </View>
  );

  if (loading) return <View style={common.containerCentered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  return (
    <>
      <SafeAreaView style={common.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {section('תחומי עניין', INTERESTS, profile.interests, (value) => toggle('interests', value, 8), 'edit-interest', `${profile.interests.length}/8 נבחרו`)}
          {section('תקציב מועדף', BUDGETS, profile.budget ? [profile.budget] : [], (value) => setProfile((p) => ({ ...p, budget: value })), 'edit-budget')}
          {section('הרכב מטיילים', TRAVEL_PARTIES, profile.travelParties, (value) => toggle('travelParties', value, 2), 'edit-party', `${profile.travelParties.length}/2 נבחרו`)}
          {section('אווירה', VIBES, profile.vibe, (value) => toggle('vibe', value, 3), 'edit-vibe', 'עד שלוש אפשרויות')}
          {section('קצב טיול', PACES, profile.pace ? [profile.pace] : [], (value) => setProfile((p) => ({ ...p, pace: p.pace === value ? '' : value })), 'edit-pace')}
          {section('צרכים והעדפות', NEEDS, profile.needs, (value) => toggle('needs', value, NEEDS.length), 'edit-need')}
          <TouchableOpacity testID="edit-preferences-save" style={[buttons.submit, saving && buttons.disabled]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={buttons.submitText}>שמור העדפות</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
      <UnsavedChangesModal visible={unsavedModalVisible} title={UNSAVED_LEAVE_TITLE} message={UNSAVED_LEAVE_MESSAGE}
        onCancel={dismissUnsavedModal} onConfirm={confirmUnsavedLeave} testID="edit-profile-unsaved-modal"
        cancelTestID="edit-profile-unsaved-cancel" confirmTestID="edit-profile-unsaved-confirm" />
    </>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';

import { auth, db } from '../../../config/firebase';
import { saveProfile } from '../../../services/ProfileService';
import { preferenceSetupStyles as styles } from '../../../styles';
import {
  BUDGETS,
  INTERESTS,
  NEEDS,
  PACES,
  TRAVEL_PARTIES,
  VIBES,
} from '../constants/smartProfileOptions';
import { getPreferenceResumeStep, normalizeClientSmartProfile } from '../utils/preferenceSetup';

const EMPTY_PROFILE = {
  interests: [], budget: '', travelParties: [], vibe: [], pace: '', needs: [],
};

function ChoiceChip({ option, selected, onPress, testID }) {
  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {option.label}{option.helper ? ` · ${option.helper}` : ''}
      </Text>
    </TouchableOpacity>
  );
}

function OptionGroup({ title, help, options, values, onToggle, prefix }) {
  return (
    <View style={styles.optionGroup}>
      <Text style={styles.optionTitle}>{title}</Text>
      {!!help && <Text style={styles.optionHelp}>{help}</Text>}
      <View style={styles.chipWrap}>
        {options.map((option) => (
          <ChoiceChip
            key={option.value}
            option={option}
            selected={values.includes(option.value)}
            onPress={() => onToggle(option.value)}
            testID={`${prefix}-${option.value}`}
          />
        ))}
      </View>
    </View>
  );
}

export default function PreferenceSetupScreen({ navigation }) {
  const uid = auth.currentUser?.uid;
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [setupRequired, setSetupRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!uid) return;
      const snapshot = await getDoc(doc(db, 'users', uid));
      if (!active) return;
      const current = snapshot.data()?.smartProfile || {};
      const normalized = normalizeClientSmartProfile(current);
      setProfile(normalized);
      setStep(current.setupRequired === true ? getPreferenceResumeStep(normalized) : 0);
      setSetupRequired(current.setupRequired === true && !current.completedAt);
      setLoading(false);
    }
    load().catch(() => setLoading(false));
    return () => { active = false; };
  }, [uid]);

  const toggleArray = useCallback((field, value, maximum) => {
    setProfile((previous) => {
      const current = previous[field];
      if (current.includes(value)) return { ...previous, [field]: current.filter((entry) => entry !== value) };
      if (current.length >= maximum) return previous;
      return { ...previous, [field]: [...current, value] };
    });
  }, []);

  const canContinue = useMemo(() => {
    if (step === 0) return profile.interests.length >= 3 && profile.interests.length <= 8;
    if (step === 1) return Boolean(profile.budget) && profile.travelParties.length >= 1;
    return true;
  }, [profile, step]);

  const persist = async (complete = false) => {
    setSaving(true);
    try {
      await saveProfile({ smartProfile: profile }, { completeSmartProfile: complete });
      if (complete) navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      return true;
    } catch (error) {
      Alert.alert('לא הצלחנו לשמור', error?.message || 'נסו שוב בעוד רגע.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    if (!canContinue || saving) return;
    if (step === 3) {
      await persist(true);
      return;
    }
    if (await persist(false)) setStep((current) => current + 1);
  };

  const renderStep = () => {
    if (step === 0) return (
      <>
        <Text style={styles.sectionTitle}>מה מעניין אותך?</Text>
        <Text style={styles.sectionHelp}>בחרו בין 3 ל־8 תחומים. נשתמש בהם כדי לסדר המלצות, לא כדי להסתיר תוכן.</Text>
        <Text style={styles.counter}>{profile.interests.length}/8 נבחרו</Text>
        <View style={styles.chipWrap}>
          {INTERESTS.map((option) => <ChoiceChip key={option.value} option={option}
            selected={profile.interests.includes(option.value)}
            onPress={() => toggleArray('interests', option.value, 8)}
            testID={`preference-interest-${option.value}`} />)}
        </View>
      </>
    );
    if (step === 1) return (
      <>
        <Text style={styles.sectionTitle}>איך אתם מטיילים?</Text>
        <Text style={styles.sectionHelp}>התקציב הוא העדפה רכה, ואפשר לבחור עד שני הרכבים נפוצים.</Text>
        <OptionGroup title="תקציב מועדף" options={BUDGETS}
          values={profile.budget ? [profile.budget] : []}
          onToggle={(value) => setProfile((previous) => ({ ...previous, budget: value }))}
          prefix="preference-budget" />
        <OptionGroup title="הרכב מטיילים" help={`${profile.travelParties.length}/2 נבחרו`} options={TRAVEL_PARTIES}
          values={profile.travelParties} onToggle={(value) => toggleArray('travelParties', value, 2)}
          prefix="preference-party" />
      </>
    );
    if (step === 2) return (
      <>
        <Text style={styles.sectionTitle}>איזה אופי מתאים לכם?</Text>
        <Text style={styles.sectionHelp}>השלב הזה אופציונלי ותמיד ניתן לשינוי בפרופיל.</Text>
        <OptionGroup title="אווירה" help="עד שלוש אפשרויות" options={VIBES} values={profile.vibe}
          onToggle={(value) => toggleArray('vibe', value, 3)} prefix="preference-vibe" />
        <OptionGroup title="קצב טיול" options={PACES} values={profile.pace ? [profile.pace] : []}
          onToggle={(value) => setProfile((previous) => ({ ...previous, pace: previous.pace === value ? '' : value }))}
          prefix="preference-pace" />
      </>
    );
    return (
      <>
        <Text style={styles.sectionTitle}>צרכים שחשוב לנו להכיר</Text>
        <Text style={styles.sectionHelp}>הבחירה אופציונלית. המידע נשאר פרטי ומשמש רק לדירוג מיטבי.</Text>
        <OptionGroup title="צרכים והעדפות" options={NEEDS} values={profile.needs}
          onToggle={(value) => toggleArray('needs', value, NEEDS.length)} prefix="preference-need" />
        <View style={styles.privacyCard} testID="preference-review">
          <Text style={styles.privacyTitle}>סיכום ההעדפות</Text>
          <Text style={styles.privacyText}>
            {`תחומי עניין: ${INTERESTS.filter((option) => profile.interests.includes(option.value)).map((option) => option.label).join(', ')}`}
          </Text>
          <Text style={styles.privacyText}>
            {`תקציב: ${BUDGETS.find((option) => option.value === profile.budget)?.label || 'לא נבחר'}`}
          </Text>
          <Text style={styles.privacyText}>
            {`הרכב: ${TRAVEL_PARTIES.filter((option) => profile.travelParties.includes(option.value)).map((option) => option.label).join(', ')}`}
          </Text>
        </View>
        <View style={styles.privacyCard}>
          <Text style={styles.privacyTitle}>איך ההתאמה משתפרת?</Text>
          <Text style={styles.privacyText}>לייקים, שמירות ופתיחת המלצות מעדכנים ציוני התאמה מצומצמים. לא נשמר יומן גלישה מלא, ואפשר לאפס את הלמידה בהגדרות.</Text>
        </View>
      </>
    );
  };

  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.screen}><ActivityIndicator color="#1E3A8A" /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>העדפות הטיול שלי</Text>
            {!setupRequired ? (
              <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()} testID="preference-close">
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            ) : <View style={styles.closePlaceholder} />}
          </View>
          <Text style={styles.headerSubtitle}>שלב {step + 1} מתוך 4</Text>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${(step + 1) * 25}%` }]} /></View>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {renderStep()}
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity testID="preference-next" style={[styles.primaryButton, (!canContinue || saving) && styles.primaryButtonDisabled]}
            onPress={next} disabled={!canContinue || saving}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{step === 3 ? 'סיום ושמירה' : 'המשך'}</Text>}
          </TouchableOpacity>
          {step > 0 ? <TouchableOpacity testID="preference-back" style={styles.secondaryButton} onPress={() => setStep((current) => current - 1)} disabled={saving}>
            <Text style={styles.secondaryButtonText}>חזרה</Text>
          </TouchableOpacity> : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, TouchableOpacity, View } from 'react-native';
import AppText from "../../../components/AppText";
import BrandWordmark from '../../auth/components/BrandWordmark';
import CompactChip from '../../../components/CompactChip';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';

import { auth, db } from '../../../config/firebase';
import { saveProfile } from '../../../services/ProfileService';
import { useAuth } from '../../auth/AuthContext';
import { AUTH_STATES } from '../../../constants/authPolicy';
import { preferenceSetupStyles as styles } from '../../../styles';
import {
  BUDGETS,
  INTERESTS,
  NEEDS,
  PACES,
  TRAVEL_PARTIES,
  TRAVELER_STYLES,
  VIBES,
} from '../constants/smartProfileOptions';
import { getPreferenceResumeStep, normalizeClientSmartProfile } from '../utils/preferenceSetup';

const EMPTY_PROFILE = {
  interests: [], budget: '', travelParties: [], vibe: [], travelerStyles: [], pace: '', needs: [],
};

function ChoiceChip({ option, selected, onPress, testID }) {
  return (
    <CompactChip
      testID={testID}
      label={`${option.label}${option.helper ? ` · ${option.helper}` : ''}`}
      icon={option.icon}
      selected={selected}
      onPress={onPress}
    />
  );
}

function OptionGroup({ title, help, options, values, onToggle, prefix }) {
  return (
    <View style={styles.optionGroup}>
      <AppText style={styles.optionTitle}>{title}</AppText>
      {!!help && <AppText style={styles.optionHelp}>{help}</AppText>}
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
  const { synchronizeUserDocument } = useAuth();
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
      const result = await saveProfile(
        { smartProfile: profile },
        {
          completeSmartProfile: complete,
          verifySmartProfile: complete,
        }
      );
      if (complete) {
        const nextStatus = synchronizeUserDocument(result.userDocument);
        if (nextStatus !== AUTH_STATES.READY) {
          throw new Error('העדפות הטיול נשמרו, אך מצב החשבון לא התעדכן. נסו שוב.');
        }
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      }
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
    if (step === 2) {
      await persist(true);
      return;
    }
    if (await persist(false)) setStep((current) => current + 1);
  };

  const renderStep = () => {
    if (step === 0) return (
      <>
        <AppText style={styles.sectionTitle}>מה מעניין אותך?</AppText>
        <AppText style={styles.sectionHelp}>בחרו בין 3 ל־8 תחומים. נשתמש בהם כדי לסדר המלצות, לא כדי להסתיר תוכן.</AppText>
        <AppText style={styles.counter}>{profile.interests.length}/8 נבחרו</AppText>
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
        <AppText style={styles.sectionTitle}>איך אתם מטיילים?</AppText>
        <AppText style={styles.sectionHelp}>התקציב הוא העדפה רכה, ואפשר לבחור עד שני הרכבים נפוצים.</AppText>
        <OptionGroup title="תקציב מועדף" options={BUDGETS}
          values={profile.budget ? [profile.budget] : []}
          onToggle={(value) => setProfile((previous) => ({ ...previous, budget: value }))}
          prefix="preference-budget" />
        <OptionGroup title="הרכב מטיילים" help={`${profile.travelParties.length}/2 נבחרו`} options={TRAVEL_PARTIES}
          values={profile.travelParties} onToggle={(value) => toggleArray('travelParties', value, 2)}
          prefix="preference-party" />
      </>
    );
    return (
      <>
        <AppText style={styles.sectionTitle}>סגנון וצרכים</AppText>
        <AppText style={styles.sectionHelp}>הבחירות בשלב הזה אופציונליות ותמיד ניתנות לשינוי בפרופיל.</AppText>
        <OptionGroup title="אווירה" help="עד שלוש אפשרויות" options={VIBES} values={profile.vibe}
          onToggle={(value) => toggleArray('vibe', value, 3)} prefix="preference-vibe" />
        <OptionGroup title="סגנון טיול" help="עד שלוש אפשרויות" options={TRAVELER_STYLES} values={profile.travelerStyles}
          onToggle={(value) => toggleArray('travelerStyles', value, 3)} prefix="preference-traveler-style" />
        <OptionGroup title="קצב מועדף" options={PACES} values={profile.pace ? [profile.pace] : []}
          onToggle={(value) => setProfile((previous) => ({ ...previous, pace: previous.pace === value ? '' : value }))}
          prefix="preference-pace" />
        <OptionGroup title="צרכים והעדפות" options={NEEDS} values={profile.needs}
          onToggle={(value) => toggleArray('needs', value, NEEDS.length)} prefix="preference-need" />
        <View style={styles.privacyCard} testID="preference-review">
          <AppText style={styles.privacyTitle}>סיכום ההעדפות</AppText>
          <AppText style={styles.privacyText}>
            {`תחומי עניין: ${INTERESTS.filter((option) => profile.interests.includes(option.value)).map((option) => option.label).join(', ')}`}
          </AppText>
          <AppText style={styles.privacyText}>
            {`תקציב: ${BUDGETS.find((option) => option.value === profile.budget)?.label || 'לא נבחר'}`}
          </AppText>
          <AppText style={styles.privacyText}>
            {`הרכב: ${TRAVEL_PARTIES.filter((option) => profile.travelParties.includes(option.value)).map((option) => option.label).join(', ')}`}
          </AppText>
          <AppText style={styles.privacyText}>
            {`אווירה: ${VIBES.filter((option) => profile.vibe.includes(option.value)).map((option) => option.label).join(', ') || 'לא נבחר'}`}
          </AppText>
          <AppText style={styles.privacyText}>
            {`סגנון טיול: ${TRAVELER_STYLES.filter((option) => profile.travelerStyles.includes(option.value)).map((option) => option.label).join(', ') || 'לא נבחר'}`}
          </AppText>
          <AppText style={styles.privacyText}>
            {`קצב: ${PACES.find((option) => option.value === profile.pace)?.label || 'לא נבחר'}`}
          </AppText>
          <AppText style={styles.privacyText}>
            {`צרכים והעדפות: ${NEEDS.filter((option) => profile.needs.includes(option.value)).map((option) => option.label).join(', ') || 'לא נבחר'}`}
          </AppText>
        </View>
        <View style={styles.privacyCard}>
          <AppText style={styles.privacyTitle}>איך ההתאמה משתפרת?</AppText>
          <AppText style={styles.privacyText}>לייקים, שמירות ופתיחת המלצות מעדכנים ציוני התאמה מצומצמים. לא נשמר יומן גלישה מלא, ואפשר לאפס את הלמידה בהגדרות.</AppText>
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
            <AppText style={styles.headerTitle}>העדפות הטיול שלי</AppText>
            {!setupRequired ? (
              <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()} testID="preference-close">
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            ) : <View style={styles.closePlaceholder} />}
          </View>
          <AppText style={styles.headerSubtitle}>שלב {step + 1} מתוך 3</AppText>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${((step + 1) / 3) * 100}%` }]} /></View>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {setupRequired ? <View style={styles.brandSurface}><BrandWordmark compact /></View> : null}
          {renderStep()}
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity testID="preference-next" style={[styles.primaryButton, (!canContinue || saving) && styles.primaryButtonDisabled]}
            onPress={next} disabled={!canContinue || saving}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <AppText style={styles.primaryButtonText}>{step === 2 ? 'סיום ושמירה' : 'המשך'}</AppText>}
          </TouchableOpacity>
          {step > 0 ? <TouchableOpacity testID="preference-back" style={styles.secondaryButton} onPress={() => setStep((current) => current - 1)} disabled={saving}>
            <AppText style={styles.secondaryButtonText}>חזרה</AppText>
          </TouchableOpacity> : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

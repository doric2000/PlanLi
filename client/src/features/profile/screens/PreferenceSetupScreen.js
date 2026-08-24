import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, getDoc } from 'firebase/firestore';

import AppText from '../../../components/AppText';
import CachedImage from '../../../components/CachedImage';
import { auth, db } from '../../../config/firebase';
import { getRecommendationImageUrls } from '../../../utils/mediaAssets';
import { clearPersonalizationDiscoveryCache, getPersonalizedRecommendations } from '../../../services/PersonalizationService';
import { saveNoyaOnboardingStatus, saveProfile } from '../../../services/ProfileService';
import { useAuth } from '../../auth/AuthContext';
import { preferenceSetupStyles as styles } from '../../../styles';
import { BUDGETS, NEEDS, ONBOARDING_INTERESTS, TRAVEL_PARTIES } from '../constants/smartProfileOptions';
import {
  clearGuestNoyaProfile,
  dismissGuestNoya,
  loadGuestNoyaProfile,
  markNoyaAccountHandled,
  NOYA_ONBOARDING_VERSION,
  saveGuestNoyaProfile,
} from '../services/NoyaOnboardingStorage';
import { normalizeClientSmartProfile, normalizeNoyaSmartProfile } from '../utils/preferenceSetup';

const NOYA_IMAGE = require('../../../../assets/noya-assistant.png');
const EMPTY_PROFILE = {
  interests: [], budget: '', travelParties: [], vibe: [], travelerStyles: [], pace: '', needs: [],
  onboardingVersion: NOYA_ONBOARDING_VERSION,
};

const INTEREST_ICONS = Object.freeze({
  food: 'restaurant-outline',
  nature_scenery: 'leaf-outline',
  beaches_water: 'water-outline',
  culture_history: 'business-outline',
  activities: 'ticket-outline',
  shopping_markets: 'bag-handle-outline',
  nightlife: 'moon-outline',
  wellness: 'sparkles-outline',
});

function closeFlow(navigation, source) {
  if (source === 'profile' && navigation.canGoBack()) navigation.goBack();
  else navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
}

function ProgressHeader({ questionStep, onSkip }) {
  return (
    <View style={styles.questionHeader}>
      <TouchableOpacity accessibilityLabel="סיום ההיכרות עם נועה" accessibilityRole="button"
        onPress={onSkip} style={styles.skipButton} testID="noya-skip">
        <AppText style={styles.skipText}>לא עכשיו</AppText>
      </TouchableOpacity>
      <View style={styles.progressDots} accessibilityLabel={`שאלה ${questionStep} מתוך 3`}>
        {[1, 2, 3].map((value) => (
          <View key={value} style={[styles.progressDot, value <= questionStep && styles.progressDotActive]} />
        ))}
      </View>
      <AppText style={styles.brandText}>PlanLi</AppText>
    </View>
  );
}

function NoyaPrompt({ title, helper }) {
  return (
    <View style={styles.noyaPrompt}>
      <CachedImage source={NOYA_IMAGE} style={styles.noyaAvatar} contentFit="cover"
        contentPosition={{ left: '50%', top: '32%' }} transition={0}
        accessibilityLabel="נועה, העוזרת האישית של PlanLi" />
      <View style={styles.noyaBubble}>
        <AppText style={styles.noyaQuestion}>{title}</AppText>
        <AppText style={styles.noyaHelper}>{helper}</AppText>
      </View>
    </View>
  );
}

function ChoiceTile({ icon, label, onPress, selected, testID, wide = false, single = false }) {
  return (
    <Pressable accessibilityRole={single ? 'radio' : 'checkbox'}
      accessibilityState={single ? { checked: selected } : { checked: selected }} onPress={onPress}
      style={({ pressed }) => [styles.choiceTile, wide && styles.choiceTileWide,
        selected && styles.choiceTileSelected, pressed && styles.choiceTilePressed]}
      testID={testID}>
      {icon ? (
        <View style={[styles.choiceIcon, selected && styles.choiceIconSelected]}>
          <Ionicons name={icon} size={21} color={selected ? '#FFFFFF' : '#1E3A5F'} />
        </View>
      ) : null}
      <AppText style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{label}</AppText>
      {selected ? <Ionicons name="checkmark-circle" size={19} color="#F5961D" /> : null}
    </Pressable>
  );
}

function PreviewCard({ item, onPress }) {
  const imageUrl = getRecommendationImageUrls(item, 'thumb')[0] || null;
  return (
    <Pressable accessibilityLabel={`צפייה בהמלצה ${item.title || ''}`} accessibilityRole="button"
      onPress={onPress} style={styles.previewCard}>
      {imageUrl ? (
        <CachedImage source={{ uri: imageUrl }} style={styles.previewImage} contentFit="cover" transition={120} />
      ) : (
        <View style={styles.previewFallback}><Ionicons name="image-outline" size={22} color="#6F7E91" /></View>
      )}
      <AppText numberOfLines={2} style={styles.previewTitle}>{item.title || 'המלצה בשבילך'}</AppText>
    </Pressable>
  );
}

export default function PreferenceSetupScreen({ navigation, route }) {
  const source = route?.params?.source || '';
  const uid = auth.currentUser?.uid;
  const { synchronizeUserDocument } = useAuth();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [needsExpanded, setNeedsExpanded] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const guestProfile = await loadGuestNoyaProfile();
      if (!uid) {
        if (active) setProfile(guestProfile ? normalizeNoyaSmartProfile(guestProfile) : EMPTY_PROFILE);
        return;
      }
      const snapshot = await getDoc(doc(db, 'users', uid));
      if (!active) return;
      const current = snapshot.data()?.smartProfile || {};
      const normalized = normalizeNoyaSmartProfile(current);
      const serverComplete = Boolean(current.completedAt && current.setupRequired !== true);
      if (serverComplete) {
        setProfile(normalized);
        if (guestProfile) clearGuestNoyaProfile().catch(() => {});
      } else if (guestProfile) {
        setProfile({ ...normalized, ...normalizeNoyaSmartProfile(guestProfile),
          vibe: normalized.vibe, travelerStyles: normalized.travelerStyles, pace: normalized.pace });
      } else setProfile(normalized);
    }
    load().catch(() => { if (active) setProfile(EMPTY_PROFILE); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [uid]);

  const canContinue = useMemo(() => {
    if (step === 1) return profile.interests.length >= 2 && profile.interests.length <= 4;
    if (step === 2) return Boolean(profile.budget);
    if (step === 3) return profile.travelParties.length >= 1 && profile.travelParties.length <= 2;
    return true;
  }, [profile, step]);

  const toggleArray = useCallback((field, value, maximum) => {
    setProfile((previous) => {
      const values = Array.isArray(previous[field]) ? previous[field] : [];
      if (values.includes(value)) return { ...previous, [field]: values.filter((entry) => entry !== value) };
      if (values.length >= maximum) return previous;
      return { ...previous, [field]: [...values, value] };
    });
  }, []);

  const dismiss = useCallback(() => {
    if (uid) {
      markNoyaAccountHandled(uid);
      saveNoyaOnboardingStatus('dismissed', NOYA_ONBOARDING_VERSION).catch(() => {});
    }
    else dismissGuestNoya().catch(() => {});
    closeFlow(navigation, source);
  }, [navigation, source, uid]);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const response = await getPersonalizedRecommendations({ sort: 'forYou', limit: 3 });
      setPreviewItems(Array.isArray(response?.items) ? response.items.slice(0, 3) : []);
    } catch { setPreviewItems([]); }
    finally { setPreviewLoading(false); }
  }, []);

  const complete = useCallback(async () => {
    if (!canContinue || saving) return;
    setSaving(true);
    const nextProfile = { ...normalizeClientSmartProfile(profile), interests: profile.interests,
      budget: profile.budget, travelParties: profile.travelParties, needs: profile.needs,
      onboardingVersion: NOYA_ONBOARDING_VERSION };
    try {
      if (uid) {
        const result = await saveProfile({ smartProfile: nextProfile,
          noyaOnboarding: { version: NOYA_ONBOARDING_VERSION, status: 'completed' } },
        { completeSmartProfile: true, verifySmartProfile: true });
        if (result?.userDocument) synchronizeUserDocument(result.userDocument, uid);
        markNoyaAccountHandled(uid);
        await clearGuestNoyaProfile();
      } else await saveGuestNoyaProfile(nextProfile);
      clearPersonalizationDiscoveryCache();
      setStep(4);
      loadPreview();
    } catch (error) {
      Alert.alert('לא הצלחנו לשמור', error?.message || 'אפשר לנסות שוב בעוד רגע.');
    } finally { setSaving(false); }
  }, [canContinue, loadPreview, profile, saving, synchronizeUserDocument, uid]);

  const next = useCallback(() => {
    if (step === 3) complete();
    else if (canContinue) setStep((current) => Math.min(4, current + 1));
  }, [canContinue, complete, step]);

  if (loading) return (
    <SafeAreaView style={styles.safe}><View style={styles.loadingState}>
      <ActivityIndicator color="#1E3A5F" /><AppText style={styles.loadingText}>נועה מתכוננת להכיר אותך</AppText>
    </View></SafeAreaView>
  );

  if (step === 0) return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.heroScreen} testID="noya-welcome-screen">
        <View style={styles.heroImageWrap}>
          <CachedImage source={NOYA_IMAGE} style={styles.heroImage} contentFit="cover"
            contentPosition={{ left: '50%', top: '38%' }} transition={0}
            accessibilityLabel="נועה, העוזרת האישית של PlanLi" />
          <View style={styles.heroNameCard}><AppText style={styles.heroName}>נועה</AppText>
            <AppText style={styles.heroRole}>העוזרת האישית של PlanLi</AppText></View>
        </View>
        <View style={styles.heroCopy}><AppText style={styles.heroTitle}>נעים להכיר</AppText>
          <AppText style={styles.heroText}>שלוש שאלות קצרות יעזרו לי לסדר את ההמלצות שמתאימות לך. תמיד אפשר לשנות או לדלג.</AppText></View>
        <View style={styles.heroActions}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setStep(1)} testID="noya-start">
            <AppText style={styles.primaryButtonText}>מתחילים</AppText></TouchableOpacity>
          <TouchableOpacity style={styles.textButton} onPress={dismiss} testID="noya-later">
            <AppText style={styles.textButtonText}>לא עכשיו</AppText></TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );

  if (step === 4) return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.finishScreen} testID="noya-complete-screen">
        <CachedImage source={NOYA_IMAGE} style={styles.finishAvatar} contentFit="cover"
          contentPosition={{ left: '50%', top: '32%' }} transition={0} accessibilityLabel="נועה" />
        <AppText style={styles.finishTitle}>סידרתי לך התחלה טובה</AppText>
        <AppText style={styles.finishText}>ככל ששומרים, מסמנים לייק ופותחים המלצות, ההתאמה ממשיכה להשתפר.</AppText>
        <View style={styles.previewRow} testID="noya-preview">
          {previewLoading ? [0, 1, 2].map((value) => <View key={value} style={styles.previewSkeleton} />) : null}
          {!previewLoading && previewItems.map((item) => <PreviewCard key={item.id} item={item}
            onPress={() => navigation.navigate('RecommendationDetail', { item, postId: item.id })} />)}
          {!previewLoading && previewItems.length === 0 ? (
            <View style={styles.previewEmpty}>
              <Ionicons name="sparkles-outline" size={23} color="#1E3A5F" />
              <AppText style={styles.previewEmptyText}>ההתאמה נשמרה. ההמלצות יופיעו במסך בשבילך.</AppText>
            </View>
          ) : null}
        </View>
        <View style={styles.finishActions}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => closeFlow(navigation, source)} testID="noya-open-home">
            <AppText style={styles.primaryButtonText}>לראות מה מצאתי</AppText></TouchableOpacity>
          <TouchableOpacity style={styles.textButton} onPress={() => setStep(1)} testID="noya-edit-answers">
            <AppText style={styles.textButtonText}>שינוי תשובות</AppText></TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.screen} testID={`noya-question-${step}`}>
        <ProgressHeader questionStep={step} onSkip={dismiss} />
        <ScrollView contentContainerStyle={styles.questionContent} keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {step === 1 ? <><NoyaPrompt title="מה עושה לך חשק לצאת לדרך?" helper="אפשר לבחור 2 עד 4 תחומים." />
            <View style={styles.choiceGrid}>{ONBOARDING_INTERESTS.map((option) => <ChoiceTile key={option.value}
              icon={INTEREST_ICONS[option.value]} label={option.label}
              onPress={() => toggleArray('interests', option.value, 4)} selected={profile.interests.includes(option.value)}
              testID={`noya-interest-${option.value}`} />)}</View>
            <AppText style={styles.selectionCounter}>{profile.interests.length} נבחרו</AppText></> : null}

          {step === 2 ? <><NoyaPrompt title="איזה תקציב בדרך כלל מתאים לטיול?"
            helper="זו העדפה שעוזרת לסדר את התוכן, לא מסנן שמסתיר אותו." />
            <View style={styles.choiceGrid}>{BUDGETS.map((option) => <ChoiceTile key={option.value}
              label={option.helper && option.value !== 'flexible' ? `${option.label} · ${option.helper}` : option.label}
              onPress={() => setProfile((previous) => ({ ...previous, budget: option.value }))}
              selected={profile.budget === option.value} single testID={`noya-budget-${option.value}`} />)}</View></> : null}

          {step === 3 ? <><NoyaPrompt title="עם מי בדרך כלל יוצאים לטייל?" helper="אפשר לבחור עד שתי אפשרויות." />
            <View style={styles.choiceGrid}>{TRAVEL_PARTIES.map((option) => <ChoiceTile key={option.value}
              label={option.label} onPress={() => toggleArray('travelParties', option.value, 2)}
              selected={profile.travelParties.includes(option.value)} testID={`noya-party-${option.value}`}
              wide={option.value === 'multigenerational_group'} />)}</View>
            <View style={styles.optionalCard}>
              <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: needsExpanded }}
                onPress={() => setNeedsExpanded((value) => !value)} style={styles.optionalHeader} testID="noya-needs-toggle">
                <View style={styles.optionalCopy}><AppText style={styles.optionalTitle}>יש משהו שחשוב שניקח בחשבון?</AppText>
                  <AppText style={styles.optionalText}>נגישות, תזונה או פחות הליכה</AppText></View>
                <Ionicons name={needsExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#1E3A5F" />
              </TouchableOpacity>
              {needsExpanded ? <View style={styles.needChoices}>{NEEDS.map((option) => <Pressable key={option.value}
                accessibilityRole="checkbox" accessibilityState={{ checked: profile.needs.includes(option.value) }}
                onPress={() => toggleArray('needs', option.value, NEEDS.length)}
                style={[styles.needChip, profile.needs.includes(option.value) && styles.needChipSelected]}
                testID={`noya-need-${option.value}`}>
                <AppText style={[styles.needChipText, profile.needs.includes(option.value) && styles.needChipTextSelected]}>
                  {option.label}</AppText></Pressable>)}</View> : null}
            </View></> : null}
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity accessibilityState={{ disabled: !canContinue || saving, busy: saving }}
            disabled={!canContinue || saving} onPress={next}
            style={[styles.primaryButton, (!canContinue || saving) && styles.primaryButtonDisabled]} testID="noya-next">
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <AppText style={styles.primaryButtonText}>
              {step === 3 ? 'לראות מה מצאתי' : 'המשך'}</AppText>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep((current) => Math.max(0, current - 1))} style={styles.textButton}>
            <AppText style={styles.textButtonText}>חזרה</AppText></TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

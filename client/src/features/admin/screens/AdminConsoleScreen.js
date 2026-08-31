import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';

import AppText from '../../../components/AppText';
import { auth } from '../../../config/firebase';
import { useAdminClaim } from '../../../hooks/useAdminClaim';
import { useBackButton } from '../../../hooks/useBackButton';
import { getModerationPolicy } from '../../../services/AdminService';
import { adminStyles as styles, colors } from '../../../styles';
import { safeAdminError } from '../adminErrors';
import { ADMIN_SECTIONS } from '../adminLabels';
import { openAuthFlow } from '../../../navigation/authNavigation';
import AdminAuditSection from '../components/AdminAuditSection';
import AdminDestinationsSection from '../components/AdminDestinationsSection';
import AdminOverviewSection from '../components/AdminOverviewSection';
import AdminSearchSection from '../components/AdminSearchSection';
import AdminUsersSection from '../components/AdminUsersSection';
import AdminAsyncState from '../components/AdminAsyncState';
import ModerationQueueSection from '../components/ModerationQueueSection';

const ADMIN_CONSOLE_CONTRACT_VERSION = 1;

function isCompatiblePolicy(policy) {
  return policy?.consoleContractVersion === ADMIN_CONSOLE_CONTRACT_VERSION
    && Array.isArray(policy.reasons)
    && policy.reasons.length > 0;
}

function requestedSection(params = {}) {
  if (params.caseId || ['reports', 'content', 'queue'].includes(params.tab)) return 'queue';
  if (params.countryId && params.cityId) return 'destinations';
  return ADMIN_SECTIONS.some((item) => item.id === params.tab) ? params.tab : 'overview';
}

export default function AdminConsoleScreen({ navigation, route }) {
  const {
    isAdmin,
    hasTotpEnrollment,
    signedInWithTotp,
    loading: adminLoading,
  } = useAdminClaim();
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const routeParams = route?.params || {};
  const initialSection = requestedSection(routeParams);
  const [section, setSection] = useState(initialSection);
  const [queueView, setQueueView] = useState(routeParams.tab === 'content' ? 'held' : 'needs_action');
  const [focusCaseId, setFocusCaseId] = useState(typeof routeParams.caseId === 'string' ? routeParams.caseId : '');
  const [focusDestination, setFocusDestination] = useState({
    countryId: typeof routeParams.countryId === 'string' ? routeParams.countryId : '',
    cityId: typeof routeParams.cityId === 'string' ? routeParams.cityId : '',
  });
  const [focusUserUid, setFocusUserUid] = useState('');
  const [returnCaseId, setReturnCaseId] = useState('');
  const [compatibility, setCompatibility] = useState({ loading: true, error: '', policy: null });

  const loadCompatibility = useCallback(async () => {
    setCompatibility((current) => ({ ...current, loading: true, error: '' }));
    try {
      const policy = await getModerationPolicy();
      if (!isCompatiblePolicy(policy)) {
        setCompatibility({
          loading: false,
          error: 'גרסת קונסולת הניהול אינה תואמת לשירותים הפעילים. יש להשלים את פריסת השרת ולנסות שוב.',
          policy: null,
        });
        return;
      }
      setCompatibility({ loading: false, error: '', policy });
    } catch (error) {
      setCompatibility({ loading: false, error: safeAdminError(error), policy: null });
    }
  }, []);

  useBackButton(navigation, { title: '', color: colors.primary });
  useEffect(() => navigation.setOptions({ headerTitle: 'קונסולת הניהול' }), [navigation]);
  useEffect(() => {
    if (adminLoading || !isAdmin) return;
    loadCompatibility();
  }, [adminLoading, isAdmin, loadCompatibility]);
  useEffect(() => {
    if (!routeParams.tab && !routeParams.caseId && !(routeParams.countryId && routeParams.cityId)) return;
    const nextSection = requestedSection(routeParams);
    setSection(nextSection);
    if (routeParams.tab === 'content') setQueueView('held');
    if (typeof routeParams.caseId === 'string') setFocusCaseId(routeParams.caseId);
    if (routeParams.countryId && routeParams.cityId) setFocusDestination({ countryId: routeParams.countryId, cityId: routeParams.cityId });
  }, [routeParams.caseId, routeParams.cityId, routeParams.countryId, routeParams.tab]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !isAdmin) return undefined;
    let timer;
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => signOut(auth), 30 * 60 * 1000); };
    ['pointerdown', 'keydown', 'scroll'].forEach((event) => window.addEventListener(event, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      ['pointerdown', 'keydown', 'scroll'].forEach((event) => window.removeEventListener(event, reset));
    };
  }, [isAdmin]);

  const clearLinkedContext = () => {
    setFocusUserUid('');
    setFocusDestination({ countryId: '', cityId: '' });
    setReturnCaseId('');
    navigation.setParams?.({ tab: undefined, caseId: undefined, countryId: undefined, cityId: undefined });
  };
  const navigate = (nextSection, params = {}) => {
    clearLinkedContext();
    setSection(nextSection);
    if (nextSection === 'queue' && params.view) setQueueView(params.view);
  };
  const active = useMemo(() => ADMIN_SECTIONS.find((item) => item.id === section) || ADMIN_SECTIONS[0], [section]);
  const returnToCase = () => {
    const caseId = returnCaseId;
    setReturnCaseId('');
    setFocusUserUid('');
    setFocusDestination({ countryId: '', cityId: '' });
    setFocusCaseId(caseId);
    setSection('queue');
  };

  if (adminLoading) return <SafeAreaView style={styles.screen}><ActivityIndicator style={styles.loading} color={colors.primary} /></SafeAreaView>;
  if (!hasTotpEnrollment) return <SafeAreaView style={styles.screen}><View style={styles.empty} testID="admin-totp-enrollment-required"><Ionicons name="shield-checkmark" size={42} color={colors.textSecondary} /><AppText style={styles.emptyText}>לפני כניסה לקונסולת הניהול חובה להפעיל אימות דו־שלבי באמצעות אפליקציית Authenticator. הפעלת האימות אינה מעניקה הרשאת מנהל.</AppText><Pressable style={styles.primaryButton} onPress={() => navigation.navigate('TotpEnrollment')} testID="admin-open-totp-enrollment"><AppText style={styles.primaryButtonText}>הפעלת אימות דו־שלבי</AppText></Pressable></View></SafeAreaView>;
  if (!isAdmin) return <SafeAreaView style={styles.screen}><View style={styles.empty}><Ionicons name="lock-closed" size={42} color={colors.textSecondary} /><AppText style={styles.emptyText}>אין הרשאת מנהל פעילה לחשבון זה.</AppText></View></SafeAreaView>;
  if (!signedInWithTotp) return <SafeAreaView style={styles.screen}><View style={styles.empty} testID="admin-totp-signin-required"><Ionicons name="lock-closed" size={42} color={colors.textSecondary} /><AppText style={styles.emptyText}>כדי לבצע פעולות ניהול יש להתחבר מחדש ולאשר קוד מאפליקציית האימות.</AppText><Pressable style={styles.primaryButton} onPress={async () => { await signOut(auth); openAuthFlow(navigation, 'Login'); }} testID="admin-totp-signin"><AppText style={styles.primaryButtonText}>התנתקות והתחברות מאובטחת</AppText></Pressable></View></SafeAreaView>;
  if (compatibility.loading || !compatibility.policy) {
    return (
      <SafeAreaView style={styles.screen} testID="admin-panel-screen">
        <View style={styles.mainBody}>
          <View style={styles.sectionHeading}>
            <AppText style={styles.sectionTitle}>בדיקת שירותי הניהול</AppText>
            <AppText style={styles.sectionDescription}>הפעולות יופעלו רק לאחר אימות גרסת השרת והרשאת המנהל.</AppText>
          </View>
          <AdminAsyncState
            loading={compatibility.loading}
            error={compatibility.error}
            onRetry={loadCompatibility}
            testID="admin-console-bootstrap"
          />
        </View>
      </SafeAreaView>
    );
  }

  const body = section === 'overview'
    ? <AdminOverviewSection onNavigate={navigate} />
    : section === 'queue'
      ? <ModerationQueueSection policy={compatibility.policy} initialView={queueView} focusCaseId={focusCaseId} onFocusHandled={() => { setFocusCaseId(''); navigation.setParams?.({ caseId: undefined }); }} onOpenUser={(uid, caseId) => { setFocusDestination({ countryId: '', cityId: '' }); setFocusUserUid(uid); setReturnCaseId(caseId || ''); setSection('users'); }} onOpenDestination={(destination, caseId) => { setFocusUserUid(''); setFocusDestination({ countryId: destination.countryId, cityId: destination.cityId }); setReturnCaseId(caseId || ''); setSection('destinations'); }} />
      : section === 'search'
        ? <AdminSearchSection policy={compatibility.policy} onOpenCase={(caseId) => { clearLinkedContext(); setFocusCaseId(caseId); setSection('queue'); }} />
        : section === 'destinations'
          ? <AdminDestinationsSection focusCountryId={focusDestination.countryId} focusCityId={focusDestination.cityId} onFocusHandled={() => { setFocusDestination({ countryId: '', cityId: '' }); navigation.setParams?.({ countryId: undefined, cityId: undefined }); }} onBackToCase={returnCaseId ? returnToCase : null} />
          : section === 'users'
            ? <AdminUsersSection focusUid={focusUserUid} onBackToCase={returnCaseId ? returnToCase : null} />
            : <AdminAuditSection />;

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']} testID="admin-panel-screen">
      <View style={[styles.console, !wide && styles.consoleMobile]}>
        {wide ? <View style={styles.sidebar}>
          <View style={styles.brandBlock}><View style={styles.brandMark}><Ionicons name="shield-checkmark" size={22} color="#FFFFFF" /></View><View><AppText style={styles.brandTitle}>PlanLi Admin</AppText><AppText style={styles.brandSubtitle}>קונסולת תפעול</AppText></View></View>
          <View style={styles.sidebarNav} accessibilityRole="tablist">{ADMIN_SECTIONS.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: section === item.id }} testID={`admin-tab-${item.id}`} style={[styles.sidebarItem, section === item.id && styles.sidebarItemActive]} onPress={() => navigate(item.id)}><Ionicons name={item.icon} size={20} color={section === item.id ? '#3448C5' : '#667085'} /><AppText style={[styles.sidebarItemText, section === item.id && styles.sidebarItemTextActive]}>{item.label}</AppText></Pressable>)}</View>
          <View style={styles.sidebarFooter}><Ionicons name="lock-closed-outline" size={16} color="#667085" /><AppText style={styles.sidebarFooterText}>גישה מאובטחת · יציאה אוטומטית לאחר 30 דקות</AppText></View>
        </View> : null}
        <View style={styles.main}>
          <View style={styles.topbar}><View><AppText style={styles.title}>{active.label}</AppText><AppText style={styles.subtitle}>ניהול הקהילה, התוכן והמקומות בעברית ובמקום אחד</AppText></View><View style={styles.secureBadge}><Ionicons name="shield-checkmark-outline" size={17} color="#027A48" /><AppText style={styles.secureBadgeText}>גישה מאובטחת</AppText></View></View>
          {!wide ? <View style={styles.mobileNavScroll} accessibilityRole="tablist"><View style={styles.mobileNav}>{ADMIN_SECTIONS.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: section === item.id }} accessibilityLabel={`פתיחת ${item.label}`} testID={`admin-tab-${item.id}`} style={({ pressed }) => [styles.mobileNavItem, section === item.id && styles.mobileNavItemActive, pressed && styles.cardPressed]} onPress={() => navigate(item.id)}><Ionicons name={item.icon} size={18} color={section === item.id ? '#FFFFFF' : '#475467'} /><AppText numberOfLines={1} style={[styles.mobileNavText, section === item.id && styles.mobileNavTextActive]}>{item.label}</AppText></Pressable>)}</View></View> : null}
          {section === 'queue' ? <View style={styles.mainBodyQueue}>{body}</View> : <ScrollView style={styles.mainScroll} contentContainerStyle={styles.mainBody} keyboardShouldPersistTaps="handled">{body}</ScrollView>}
        </View>
      </View>
    </SafeAreaView>
  );
}

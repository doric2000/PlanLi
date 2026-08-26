import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';

import AppText from '../../../components/AppText';
import { auth } from '../../../config/firebase';
import { useAdminClaim } from '../../../hooks/useAdminClaim';
import { useBackButton } from '../../../hooks/useBackButton';
import { adminStyles as styles, colors } from '../../../styles';
import { ADMIN_SECTIONS } from '../adminLabels';
import AdminAuditSection from '../components/AdminAuditSection';
import AdminDestinationsSection from '../components/AdminDestinationsSection';
import AdminOverviewSection from '../components/AdminOverviewSection';
import AdminSearchSection from '../components/AdminSearchSection';
import AdminUsersSection from '../components/AdminUsersSection';
import ModerationQueueSection from '../components/ModerationQueueSection';

function requestedSection(params = {}) {
  if (params.caseId || ['reports', 'content', 'queue'].includes(params.tab)) return 'queue';
  if (params.countryId && params.cityId) return 'destinations';
  return ADMIN_SECTIONS.some((item) => item.id === params.tab) ? params.tab : 'overview';
}

export default function AdminConsoleScreen({ navigation, route }) {
  const { isAdmin, loading: adminLoading } = useAdminClaim();
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

  useBackButton(navigation, { title: '', color: colors.primary });
  useEffect(() => navigation.setOptions({ headerTitle: 'קונסולת הניהול' }), [navigation]);
  useEffect(() => {
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

  const navigate = (nextSection, params = {}) => {
    setSection(nextSection);
    if (nextSection === 'queue' && params.view) setQueueView(params.view);
  };
  const active = useMemo(() => ADMIN_SECTIONS.find((item) => item.id === section) || ADMIN_SECTIONS[0], [section]);

  if (adminLoading) return <SafeAreaView style={styles.screen}><ActivityIndicator style={styles.loading} color={colors.primary} /></SafeAreaView>;
  if (!isAdmin) return <SafeAreaView style={styles.screen}><View style={styles.empty}><Ionicons name="lock-closed" size={42} color={colors.textSecondary} /><AppText style={styles.emptyText}>אין הרשאת מנהל פעילה לחשבון זה.</AppText></View></SafeAreaView>;

  const body = section === 'overview'
    ? <AdminOverviewSection onNavigate={navigate} />
    : section === 'queue'
      ? <ModerationQueueSection initialView={queueView} focusCaseId={focusCaseId} onFocusHandled={() => { setFocusCaseId(''); navigation.setParams?.({ caseId: undefined }); }} />
      : section === 'search'
        ? <AdminSearchSection onOpenCase={(caseId) => { setFocusCaseId(caseId); setSection('queue'); }} />
        : section === 'destinations'
          ? <AdminDestinationsSection focusCountryId={focusDestination.countryId} focusCityId={focusDestination.cityId} onFocusHandled={() => { setFocusDestination({ countryId: '', cityId: '' }); navigation.setParams?.({ countryId: undefined, cityId: undefined }); }} />
          : section === 'users'
            ? <AdminUsersSection />
            : <AdminAuditSection />;

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']} testID="admin-panel-screen">
      <View style={[styles.console, !wide && styles.consoleMobile]}>
        {wide ? <View style={styles.sidebar}>
          <View style={styles.brandBlock}><View style={styles.brandMark}><Ionicons name="shield-checkmark" size={22} color="#FFFFFF" /></View><View><AppText style={styles.brandTitle}>PlanLi Admin</AppText><AppText style={styles.brandSubtitle}>קונסולת תפעול</AppText></View></View>
          <View style={styles.sidebarNav} accessibilityRole="tablist">{ADMIN_SECTIONS.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: section === item.id }} testID={`admin-tab-${item.id}`} style={[styles.sidebarItem, section === item.id && styles.sidebarItemActive]} onPress={() => setSection(item.id)}><Ionicons name={item.icon} size={20} color={section === item.id ? '#3448C5' : '#667085'} /><AppText style={[styles.sidebarItemText, section === item.id && styles.sidebarItemTextActive]}>{item.label}</AppText></Pressable>)}</View>
          <View style={styles.sidebarFooter}><Ionicons name="lock-closed-outline" size={16} color="#667085" /><AppText style={styles.sidebarFooterText}>גישה מאובטחת · יציאה אוטומטית לאחר 30 דקות</AppText></View>
        </View> : null}
        <View style={styles.main}>
          <View style={styles.topbar}><View><AppText style={styles.title}>{active.label}</AppText><AppText style={styles.subtitle}>ניהול הקהילה, התוכן והמקומות בעברית ובמקום אחד</AppText></View><View style={styles.secureBadge}><Ionicons name="shield-checkmark-outline" size={17} color="#027A48" /><AppText style={styles.secureBadgeText}>גישה מאובטחת</AppText></View></View>
          {!wide ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mobileNavScroll} contentContainerStyle={styles.mobileNav} accessibilityRole="tablist">{ADMIN_SECTIONS.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: section === item.id }} testID={`admin-tab-${item.id}`} style={[styles.mobileNavItem, section === item.id && styles.mobileNavItemActive]} onPress={() => setSection(item.id)}><Ionicons name={item.icon} size={18} color={section === item.id ? '#FFFFFF' : '#475467'} /><AppText style={[styles.mobileNavText, section === item.id && styles.mobileNavTextActive]}>{item.label}</AppText></Pressable>)}</ScrollView> : null}
          {section === 'queue' ? <View style={styles.mainBodyQueue}>{body}</View> : <ScrollView style={styles.mainScroll} contentContainerStyle={styles.mainBody} keyboardShouldPersistTaps="handled">{body}</ScrollView>}
        </View>
      </View>
    </SafeAreaView>
  );
}

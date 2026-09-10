import React, { useCallback, useMemo } from 'react';
import { Alert, Image, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppText from '../components/AppText';
import { Avatar } from '../components/Avatar';
import appConfig from '../../app.json';
import TabNavigator from './TabNavigator';
import ProfileMenuList from '../features/profile/components/ProfileMenuList';
import { signOutCentral } from '../services/AuthService';
import { openAuthFlow } from './authNavigation';
import { colors, common } from '../styles';
import { refreshedDrawerStyles as styles } from '../styles/designRefresh';
import { useUnreadCount } from '../features/notifications/hooks/useUnreadCount';
import { useAuthUser } from '../hooks/useAuthUser';
import { useAdminClaim } from '../hooks/useAdminClaim';
import { createProfileDrawerNavigator } from './ProfileDrawerNavigator';
import useDrawerCloseAction from './useDrawerCloseAction';

const Drawer = createProfileDrawerNavigator();

const MENU_ITEMS = [
  { key: 'editProfile', icon: 'person-outline', label: 'עריכת פרופיל' },
  { key: 'settings', icon: 'settings-outline', label: 'הגדרות' },
  { key: 'notifications', icon: 'notifications-outline', label: 'התראות' },
  { key: 'support', icon: 'help-circle-outline', label: 'עזרה ותמיכה' },
];

const ADMIN_MENU_ITEM = { key: 'adminPanel', icon: 'shield-checkmark-outline', label: 'פאנל אדמין' };

const GUEST_MENU_ITEMS = [
  { key: 'login', icon: 'log-in-outline', label: 'התחברות' },
  { key: 'register', icon: 'person-add-outline', label: 'הרשמה' },
];

export function getDrawerWidth(windowWidth) {
  return Math.min(Math.max(windowWidth * 0.88, 288), 380);
}

export function DrawerIdentity({ isGuest, user, userDocument }) {
  const displayName = userDocument?.displayName || user?.displayName || 'המטייל/ת';
  const email = user?.email || userDocument?.email || '';
  const photoURL = userDocument?.photoURL || user?.photoURL;
  const photoMedia = userDocument?.photoMedia;

  return (
    <LinearGradient
      colors={[colors.primary, colors.primary]}
      end={{ x: 0.9, y: 1 }}
      start={{ x: 0.1, y: 0 }}
      style={styles.identityCard}
      testID="drawer-identity"
    >
      {isGuest ? (
        <View style={styles.guestIcon}>
          <Ionicons name="airplane-outline" size={27} color={colors.white} />
        </View>
      ) : (
        <Avatar
          displayName={displayName}
          photoMedia={photoMedia}
          photoURL={photoURL}
          size={56}
        />
      )}
      <View style={styles.identityCopy}>
        <AppText numberOfLines={2} style={styles.identityName}>
          {isGuest ? 'הטיול הבא מתחיל כאן' : displayName}
        </AppText>
        <AppText
          numberOfLines={isGuest ? 2 : 1}
          style={isGuest ? styles.identitySubtitle : styles.identityEmail}
        >
          {isGuest ? 'מתחברים ושומרים את כל התוכניות במקום אחד' : email}
        </AppText>
      </View>
    </LinearGradient>
  );
}

export function CustomDrawerContent(props) {
  const { navigation, runAfterClose } = props;
  const insets = useSafeAreaInsets();
  const unreadCount = useUnreadCount();
  const { isGuest, user, userDocument } = useAuthUser();
  const { isAdmin } = useAdminClaim();
  const rootStackNav = navigation.getParent?.();

  const items = useMemo(
    () => (isGuest ? GUEST_MENU_ITEMS : (isAdmin ? [...MENU_ITEMS, ADMIN_MENU_ITEM] : MENU_ITEMS)),
    [isAdmin, isGuest]
  );

  const goToProfile = useCallback(
    (params) => {
      if (isGuest) {
        navigation.navigate('Tabs', { screen: 'Auth' });
      } else {
        navigation.navigate('Tabs', { screen: 'Profile', params });
      }
    },
    [navigation, isGuest]
  );

  const handleMenuPress = useCallback(
    (key) => runAfterClose(navigation, () => {
      if (key === 'login' || key === 'register') {
        openAuthFlow(rootStackNav || navigation, key === 'login' ? 'Login' : 'Register');
        return;
      }

      if (isGuest) {
        openAuthFlow(rootStackNav || navigation, 'Login');
        return;
      }

      if (key === 'editProfile') {
        rootStackNav?.navigate?.('EditProfile');
        return;
      }
      if (key === 'notifications') {
        rootStackNav?.navigate?.('Notifications');
        return;
      }
      if (key === 'settings') {
        rootStackNav?.navigate?.('Settings');
        return;
      }
      if (key === 'adminPanel') {
        rootStackNav?.navigate?.('AdminPanel');
        return;
      }
      if (key === 'support') {
        goToProfile({ openSupport: true });
        return;
      }
    }),
    [goToProfile, isGuest, navigation, rootStackNav, runAfterClose]
  );

  const handleSignOut = useCallback(() => {
    runAfterClose(navigation, async () => {
      try {
        await signOutCentral();
        (rootStackNav || navigation).reset?.({
          index: 0,
          routes: [{ name: 'Main' }],
        });
      } catch {
        Alert.alert('שגיאה', 'לא הצלחנו להתנתק. נסו שוב.');
      }
    });
  }, [navigation, rootStackNav, runAfterClose]);

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: Math.max(insets.bottom, 12) },
      ]}
      style={styles.scroll}
    >
      <View style={styles.shell}>
        <View style={[styles.brandRow, { paddingTop: Math.max(insets.top, 10) }]}>
          <Image
            accessibilityLabel="PlanLi Travels"
            accessible
            resizeMode="contain"
            source={require('../../assets/brand-wordmark.png')}
            style={styles.brandWordmark}
            testID="drawer-brand-wordmark"
          />
          <TouchableOpacity
            accessibilityLabel="סגירת התפריט"
            accessibilityRole="button"
            activeOpacity={0.78}
            onPress={() => navigation.closeDrawer?.()}
            style={styles.closeButton}
            testID="drawer-close-button"
          >
            <Ionicons name="close" size={21} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <DrawerIdentity isGuest={isGuest} user={user} userDocument={userDocument} />

        <AppText style={styles.menuLabel}>{isGuest ? 'כניסה ל־PlanLi' : 'החשבון שלי'}</AppText>
        <ProfileMenuList
          items={items}
          notificationBadge={isGuest ? 0 : unreadCount}
          onPressItem={handleMenuPress}
        />

        <View style={styles.footer}>
          {!isGuest ? (
            <TouchableOpacity
              accessibilityLabel="התנתקות"
              accessibilityRole="button"
              activeOpacity={0.85}
              onPress={handleSignOut}
              style={styles.signOutButton}
              testID="drawer-sign-out-button"
            >
              <MaterialIcons name="logout" size={19} color="#B42318" />
              <AppText style={styles.signOutText}>התנתקות</AppText>
            </TouchableOpacity>
          ) : null}
          <AppText style={styles.version}>גרסה {appConfig.expo.version}</AppText>
        </View>
      </View>
    </DrawerContentScrollView>
  );
}

export default function RightDrawerNavigator() {
  const { width } = useWindowDimensions();
  const { user, isGuest } = useAuthUser();
  const { runAfterClose, onTransition } = useDrawerCloseAction(`${user?.uid || ''}:${isGuest}`);
  const drawerWidth = getDrawerWidth(width);

  return (
    <Drawer.Navigator
      id="RightDrawer"
      onTransition={onTransition}
      drawerContent={(props) => <CustomDrawerContent {...props} runAfterClose={runAfterClose} />}
      screenOptions={{
        headerShown: false,
        drawerPosition: 'right',
        drawerType: 'front',
        drawerStyle: [styles.drawerSurface, { width: drawerWidth }],
        overlayColor: 'rgba(15,23,42,0.34)',
        sceneContainerStyle: common.container,
      }}
    >
      <Drawer.Screen name="Tabs" component={TabNavigator} />
    </Drawer.Navigator>
  );
}

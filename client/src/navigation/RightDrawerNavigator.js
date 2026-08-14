import React, { useCallback } from 'react';
import { Alert, View, TouchableOpacity } from 'react-native';
import AppText from "../components/AppText";
import { createDrawerNavigator, DrawerContentScrollView } from '@react-navigation/drawer';
import { MaterialIcons } from '@expo/vector-icons';
import { DrawerActions } from '@react-navigation/native';
import appConfig from '../../app.json';
import TabNavigator from './TabNavigator';
import ProfileMenuList from '../features/profile/components/ProfileMenuList';
import { auth } from '../config/firebase';
import { signOutCentral } from '../services/AuthService';
import { openAuthFlow } from './authNavigation';
import { buttons, colors, typography, common } from '../styles';
import { useUnreadCount } from '../features/notifications/hooks/useUnreadCount';
import { useAuthUser } from '../hooks/useAuthUser';
import { useAdminClaim } from '../hooks/useAdminClaim';

const Drawer = createDrawerNavigator();

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

function CustomDrawerContent(props) {
  const { navigation } = props;
  const unreadCount = useUnreadCount();
  const { isGuest } = useAuthUser();
  const { isAdmin } = useAdminClaim();

  const rootStackNav = navigation.getParent?.(); // זה ה-Stack הראשי (App.js)

  const goToProfile = useCallback(
    (params) => {
      // Tabs הוא המסך היחיד ב-Drawer, ובתוכו יש טאב Profile
      if (isGuest) {
        navigation.navigate('Tabs', { screen: 'Auth' });
      } else {
        navigation.navigate('Tabs', { screen: 'Profile', params });
      }
      navigation.closeDrawer?.();
    },
    [navigation, isGuest]
  );
  const goToRootScreen = (screenName, params) => {
    navigation.dispatch(DrawerActions.closeDrawer());

    const parent = navigation.getParent?.();
    if (parent?.navigate) return parent.navigate(screenName, params);

    return navigation.navigate(screenName, params);
  };

  const handleMenuPress = useCallback(
    (key) => {
      if (key === 'login') {
        navigation.closeDrawer?.();
        openAuthFlow(rootStackNav || navigation, 'Login');
        return;
      }

      if (key === 'register') {
        navigation.closeDrawer?.();
        openAuthFlow(rootStackNav || navigation, 'Register');
        return;
      }

      if (isGuest) {
        // Safety: if guest-only menu is not used for some reason.
        navigation.closeDrawer?.();
        openAuthFlow(rootStackNav || navigation, 'Login');
        return;
      }

      if (key === 'editProfile') {
        navigation.closeDrawer?.();
        rootStackNav?.navigate?.('EditProfile');
        return;
      }

      if (key === 'notifications') {
        navigation.closeDrawer?.();
        rootStackNav?.navigate?.('Notifications');
        return;
      }

      if (key === 'settings') {
        navigation.closeDrawer?.();
        rootStackNav?.navigate?.('Settings');
        return;
      }

      if (key === 'adminPanel') {
        navigation.closeDrawer?.();
        rootStackNav?.navigate?.('AdminPanel');
        return;
      }

      if (key === 'support') {
        goToProfile({ openSupport: true });
        return;
      }

      Alert.alert('בקרוב', 'הפיצ’ר הזה עדיין לא זמין');
      navigation.closeDrawer?.();
    },
    [navigation, rootStackNav, goToProfile, isGuest]
  );

const handleSignOut = useCallback(() => {
    navigation.closeDrawer?.();

    setTimeout(async () => {
      try {
        await signOutCentral();

        (rootStackNav || navigation).reset?.({
          index: 0,
          routes: [{ name: 'Main' }],
        });
      } catch {
        Alert.alert('שגיאה', 'לא הצלחנו להתנתק. נסו שוב.');
      }
    }, 300);
  }, [navigation, rootStackNav]);

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ padding: 16 }}>
        <AppText style={[typography.sectionTitle, { marginBottom: 12, textAlign: 'right' }]}>תפריט</AppText>

        <ProfileMenuList 
          items={isGuest ? GUEST_MENU_ITEMS : (isAdmin ? [...MENU_ITEMS, ADMIN_MENU_ITEM] : MENU_ITEMS)} 
          onPressItem={handleMenuPress} 
          notificationBadge={isGuest ? 0 : unreadCount}
        />

        <View style={{ flex: 1 }} />

        {!isGuest && (
          <TouchableOpacity style={buttons.signOut} onPress={handleSignOut} activeOpacity={0.85}>
            <MaterialIcons name="logout" size={20} color={colors.error} />
            <AppText style={buttons.signOutText}>התנתקות</AppText>
          </TouchableOpacity>
        )}

        <AppText style={typography.profileVersion}>גרסה {appConfig.expo.version}</AppText>
      </View>
    </DrawerContentScrollView>
  );
}

export default function RightDrawerNavigator() {
  return (
    <Drawer.Navigator
      id="RightDrawer"
      screenOptions={{
        headerShown: false,
        drawerPosition: 'right',
        drawerType: 'front',
        overlayColor: 'rgba(0,0,0,0.25)',
        sceneContainerStyle: common.container,
      }}
      drawerContent={(props) => <CustomDrawerContent {...props} />}
    >
      <Drawer.Screen name="Tabs" component={TabNavigator} />
    </Drawer.Navigator>
  );
}

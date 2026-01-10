import React, { useCallback } from 'react';
import { Alert, View, Text, TouchableOpacity } from 'react-native';
import { createDrawerNavigator, DrawerContentScrollView } from '@react-navigation/drawer';
import { MaterialIcons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { DrawerActions } from '@react-navigation/native';
import appConfig from '../../app.json';
import TabNavigator from './TabNavigator';
import ProfileMenuList from '../features/profile/components/ProfileMenuList';
import { auth } from '../config/firebase';
import { buttons, colors, typography, common } from '../styles';
import { useUnreadCount } from '../features/notifications/hooks/useUnreadCount';

const Drawer = createDrawerNavigator();

const MENU_ITEMS = [
  { key: 'editProfile', icon: 'person-outline', label: 'עריכת פרופיל' },
  { key: 'settings', icon: 'settings-outline', label: 'הגדרות' },
  { key: 'notifications', icon: 'notifications-outline', label: 'התראות' },
  { key: 'support', icon: 'help-circle-outline', label: 'עזרה ותמיכה' },
];

function CustomDrawerContent(props) {
  const { navigation } = props;
  const unreadCount = useUnreadCount();

  const rootStackNav = navigation.getParent?.(); // זה ה-Stack הראשי (App.js)

  const goToProfile = useCallback(
    (params) => {
      // Tabs הוא המסך היחיד ב-Drawer, ובתוכו יש טאב Profile
      navigation.navigate('Tabs', { screen: 'Profile', params });
      navigation.closeDrawer?.();
    },
    [navigation]
  );
  const goToRootScreen = (screenName, params) => {
    navigation.dispatch(DrawerActions.closeDrawer());

    const parent = navigation.getParent?.();
    if (parent?.navigate) return parent.navigate(screenName, params);

    return navigation.navigate(screenName, params);
  };

  const handleMenuPress = useCallback(
    (key) => {
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

      if (key === 'support') {
        goToProfile({ openSupport: true });
        return;
      }

      Alert.alert('בקרוב', 'הפיצ’ר הזה עדיין לא זמין');
      navigation.closeDrawer?.();
    },
    [navigation, rootStackNav, goToProfile]
  );

  const handleSignOut = useCallback(async () => {
    try {
      await signOut(auth);
      navigation.closeDrawer?.();

      // חוזרים למסך Login
      (rootStackNav || navigation).reset?.({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    } catch (e) {
      Alert.alert('שגיאה', 'לא ניתן להתנתק: ' + e.message);
    }
  }, [navigation, rootStackNav]);

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ padding: 16 }}>
        <Text style={[typography.sectionTitle, { marginBottom: 12, textAlign: 'right' }]}>תפריט</Text>

        <ProfileMenuList 
          items={MENU_ITEMS} 
          onPressItem={handleMenuPress} 
          notificationBadge={unreadCount}
        />

        <View style={{ flex: 1 }} />

        <TouchableOpacity style={buttons.signOut} onPress={handleSignOut} activeOpacity={0.85}>
          <MaterialIcons name="logout" size={20} color={colors.error} />
          <Text style={buttons.signOutText}>התנתקות</Text>
        </TouchableOpacity>

        <Text style={typography.profileVersion}>גרסה {appConfig.expo.version}</Text>
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

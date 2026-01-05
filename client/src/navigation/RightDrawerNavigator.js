import React, { useCallback } from 'react';
import { Alert, View, Text, TouchableOpacity } from 'react-native';
import { createDrawerNavigator, DrawerContentScrollView } from '@react-navigation/drawer';
import { MaterialIcons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';

import appConfig from '../../app.json';
import TabNavigator from './TabNavigator';
import ProfileMenuList from '../features/profile/components/ProfileMenuList';
import { auth } from '../config/firebase';
import { buttons, colors, typography, common } from '../styles';

const Drawer = createDrawerNavigator();

const MENU_ITEMS = [
  { icon: 'person-outline', label: 'Edit Profile' },
  { icon: 'settings-outline', label: 'Settings' },
  { icon: 'notifications-outline', label: 'Notifications' },
  { icon: 'help-circle-outline', label: 'Help & Support' },
];

function CustomDrawerContent(props) {
  const { navigation } = props;

  const rootStackNav = navigation.getParent?.(); // זה ה-Stack הראשי (App.js)

  const goToProfile = useCallback(
    (params) => {
      // Tabs הוא המסך היחיד ב-Drawer, ובתוכו יש טאב Profile
      navigation.navigate('Tabs', { screen: 'Profile', params });
      navigation.closeDrawer?.();
    },
    [navigation]
  );

  const handleMenuPress = useCallback(
    (label) => {
      if (label === 'Edit Profile') {
        navigation.closeDrawer?.();
        rootStackNav?.navigate?.('EditProfile');
        return;
      }

      if (label === 'Help & Support') {
        goToProfile({ openSupport: true });
        return;
      }

      Alert.alert('Coming soon', label);
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
      Alert.alert('Error', 'Failed to sign out: ' + e.message);
    }
  }, [navigation, rootStackNav]);

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ padding: 16 }}>
        <Text style={[typography.sectionTitle, { marginBottom: 12 }]}>Menu</Text>

        <ProfileMenuList items={MENU_ITEMS} onPressItem={handleMenuPress} />

        <View style={{ flex: 1 }} />

        <TouchableOpacity style={buttons.signOut} onPress={handleSignOut} activeOpacity={0.85}>
          <MaterialIcons name="logout" size={20} color={colors.error} />
          <Text style={buttons.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={typography.profileVersion}>Version {appConfig.expo.version}</Text>
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

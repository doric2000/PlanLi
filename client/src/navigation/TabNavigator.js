import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthUser } from '../hooks/useAuthUser';
import { useUnreadCount } from '../features/notifications/hooks/useUnreadCount';
import { notifications } from '../styles';
import {tabConfigs, tabScreens} from './TabConfigs'

const Tab = createBottomTabNavigator();
const ORANGE = '#F5961D';
const ACTIVE_ICON = '#1B2D7A';
const INACTIVE_ICON = '#4B5563';
const RTL_TAB_ORDER = ['Profile', 'Auth', 'Favorites', 'Routes', 'Community', 'Home'];
/**
 * Bottom Tab Navigator.
 * Manages the main navigation flow of the application.
 *
 * Tabs:
 * - Home: Landing screen
 * - Community: Social feed and interactions
 * - Routes: Map and route planning
 * - Profile: User settings and profile
 */
export default function TabNavigator() {
  const { user } = useAuthUser();
  const unreadCount = useUnreadCount();
  const insets = useSafeAreaInsets();
  const visibleScreens = RTL_TAB_ORDER
    .map((name) => tabScreens.find((screen) => screen.name === name))
    .filter(Boolean)
    .filter(({ name }) => {
      if (user) return name !== 'Auth';
      return name !== 'Profile';
    });
  
  console.log('Unread notification count in TabNavigator:', unreadCount);
  
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => {
        const config = tabConfigs[route.name];
        return ({
          tabBarIcon: ({ focused, color, size }) => {
            const showCommunityDot = route.name === 'Community' && !focused;
            const iconSize = focused ? 32 : 30;
            if (route.name === 'Profile' && user) {
              const iconContent = user.photoURL ? (
                <Image
                  source={{ uri: user.photoURL }}
                  style={[
                    styles.profileImage,
                    {
                      width: iconSize,
                      height: iconSize,
                      borderRadius: iconSize / 2,
                      borderWidth: focused ? 2 : 0,
                      borderColor: color,
                    },
                  ]}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name={focused ? config.icon : `${config.icon}-outline`}
                  size={iconSize}
                  color={color}
                />
              );
              
              return (
                <View style={[styles.iconWrap, focused && styles.activeIconWrap]}>
                  {iconContent}
                  {unreadCount > 0 && (
                    <View style={notifications.badge}>
                      <Text style={notifications.badgeText}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
              );
            }
            return (
              <View style={[styles.iconWrap, focused && styles.activeIconWrap]}>
                {showCommunityDot && <View style={styles.communityDot} />}
                <Ionicons
                  name={focused ? config.icon : `${config.icon}-outline`}
                  size={iconSize}
                  color={color}
                />
              </View>
            );
          },
          tabBarActiveTintColor: ACTIVE_ICON,
          tabBarInactiveTintColor: INACTIVE_ICON,
          tabBarLabel: config.label,
          tabBarShowLabel: false,
          tabBarLabelStyle: styles.label,
          tabBarItemStyle: styles.item,
          tabBarStyle: [
            styles.tabBar,
            {
              bottom: Math.max(insets.bottom, 10),
            },
          ],
          tabBarIconStyle: styles.iconSlot,
          tabBarHideOnKeyboard: true,
          headerShown: false,
        });
      }}
    >
      {visibleScreens
        .map(({ name, component }) => (
          <Tab.Screen key={name} name={name} component={component} />
        ))}
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    height: 70,
    borderRadius: 31,
    backgroundColor: 'rgba(236, 239, 246, 0.88)',
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    paddingTop: 0,
    paddingBottom: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 18,
    overflow: 'hidden',
  },
  item: {
    paddingVertical: 0,
    height: 62,
  },
  iconSlot: {
    marginTop: 0,
    width: '100%',
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activeIconWrap: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
    writingDirection: 'rtl',
  },
  communityDot: {
    position: 'absolute',
    top: -2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ORANGE,
  },
  profileImage: {
    backgroundColor: '#E5E7EB',
  },
});

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Image, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthUser } from '../hooks/useAuthUser';
import { useUnreadCount } from '../features/notifications/hooks/useUnreadCount';
import { colors, notifications, tabNavigatorStyles as styles } from '../styles';
import {tabConfigs, tabScreens} from './TabConfigs'

const Tab = createBottomTabNavigator();
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
          tabBarActiveTintColor: colors.navActive,
          tabBarInactiveTintColor: colors.navInactive,
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

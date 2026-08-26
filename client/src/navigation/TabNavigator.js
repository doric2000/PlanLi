import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { useCallback, useEffect, useRef } from 'react';
import AppText from "../components/AppText";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthUser } from '../hooks/useAuthUser';
import { useUnreadCount } from '../features/notifications/hooks/useUnreadCount';
import { colors, notifications, tabNavigatorStyles as styles } from '../styles';
import { tabConfigs, tabScreens } from './TabConfigs';
import CachedImage from '../components/CachedImage';
import SwipeableTabBarButton from './SwipeableTabBarButton';
import { createSwipeNavigationCoordinator } from './horizontalSwipe';
import { getVisibleMainTabNames } from './mainTabOrder';
import { shouldDetachInactiveMainTabScreens } from './mainTabSceneLifecycle';
import { MAIN_TAB_TRANSITION_OPTIONS } from './mainTabTransition';
import { shouldHideMainTabBar } from './tabBarVisibility';
import { NOYA_MAIN_TAB_TARGETS } from '../features/noya/NoyaTourDefinitions';

const Tab = createBottomTabNavigator();
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
  const { user, authFlowInProgress } = useAuthUser();
  const unreadCount = useUnreadCount();
  const insets = useSafeAreaInsets();
  const swipeNavigationRef = useRef(null);
  if (!swipeNavigationRef.current) {
    swipeNavigationRef.current = createSwipeNavigationCoordinator();
  }
  const handleTabBarSwipe = useCallback((navigation, gestureState) => {
    swipeNavigationRef.current.navigate({
      navigation,
      gestureState,
    });
  }, []);
  const handleTabNavigationState = useCallback((event) => {
    swipeNavigationRef.current.confirmState(event?.data?.state);
  }, []);
  const visibleScreens = getVisibleMainTabNames(Boolean(user) && !authFlowInProgress)
    .map((name) => tabScreens.find((screen) => screen.name === name))
    .filter(Boolean);
  const visibleScreenNames = visibleScreens.map(({ name }) => name).join('|');

  useEffect(() => {
    swipeNavigationRef.current.reset();
  }, [visibleScreenNames]);

  useEffect(() => () => swipeNavigationRef.current.dispose(), []);

  return (
    <Tab.Navigator
      detachInactiveScreens={shouldDetachInactiveMainTabScreens()}
      initialRouteName="Home"
      screenListeners={{ state: handleTabNavigationState }}
      screenOptions={({ route, navigation }) => {
        const config = tabConfigs[route.name];
        const hideTabBar = shouldHideMainTabBar(route.name);
        return ({
          tabBarIcon: ({ focused, color, size }) => {
            const showCommunityDot = route.name === 'Community' && !focused;
            const iconSize = focused ? 32 : 30;
            if (route.name === 'Profile' && user) {
              const iconContent = user.photoURL ? (
                <CachedImage
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
                  contentFit="cover"
                  priority="high"
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
                {route.name === 'Notifications' && unreadCount > 0 && (
                  <View style={notifications.badge}>
                    <AppText style={notifications.badgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </AppText>
                  </View>
                )}
              </View>
            );
          },
          tabBarActiveTintColor: colors.navActive,
          tabBarInactiveTintColor: colors.navInactive,
          tabBarLabel: config.label,
          tabBarButtonTestID: `main-tab-${route.name.toLowerCase()}`,
          tabBarShowLabel: false,
          tabBarLabelStyle: styles.label,
          tabBarItemStyle: styles.item,
          tabBarButton: (props) => (
            <SwipeableTabBarButton
              {...props}
              onSwipe={(gestureState) => handleTabBarSwipe(navigation, gestureState)}
              tourTargetId={NOYA_MAIN_TAB_TARGETS[route.name]}
            />
          ),
          tabBarStyle: hideTabBar
            ? { display: 'none' }
            : [
              styles.tabBar,
              {
                bottom: Math.max(insets.bottom, 10),
              },
            ],
          tabBarIconStyle: styles.iconSlot,
          tabBarHideOnKeyboard: true,
          ...MAIN_TAB_TRANSITION_OPTIONS,
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

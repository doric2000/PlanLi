import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useCallback, useEffect, useRef } from 'react';
import { useAuthUser } from '../hooks/useAuthUser';
import { useUnreadCount } from '../features/notifications/hooks/useUnreadCount';
import { tabScreens } from './TabConfigs';
import MainTabBar from './MainTabBar';
import { createSwipeNavigationCoordinator } from './horizontalSwipe';
import { getVisibleMainTabNames } from './mainTabOrder';
import { shouldDetachInactiveMainTabScreens } from './mainTabSceneLifecycle';
import { MAIN_TAB_TRANSITION_OPTIONS } from './mainTabTransition';
import { TAB_BAR_HEIGHT } from './tabBarLayout';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const { user, authFlowInProgress } = useAuthUser();
  const unreadCount = useUnreadCount();
  const swipeNavigationRef = useRef(null);
  if (!swipeNavigationRef.current) swipeNavigationRef.current = createSwipeNavigationCoordinator();
  const handleTabBarSwipe = useCallback((navigation, gestureState) => {
    swipeNavigationRef.current.navigate({ navigation, gestureState });
  }, []);
  const handleTabNavigationState = useCallback((event) => {
    swipeNavigationRef.current.confirmState(event?.data?.state);
  }, []);
  const visibleScreens = getVisibleMainTabNames(Boolean(user) && !authFlowInProgress)
    .map((name) => tabScreens.find((screen) => screen.name === name)).filter(Boolean);
  const visibleScreenNames = visibleScreens.map(({ name }) => name).join('|');
  useEffect(() => { swipeNavigationRef.current.reset(); }, [visibleScreenNames]);
  useEffect(() => () => swipeNavigationRef.current.dispose(), []);

  return (
    <Tab.Navigator
      id="MainTabs"
      detachInactiveScreens={shouldDetachInactiveMainTabScreens()}
      initialRouteName="Home"
      screenListeners={{ state: handleTabNavigationState }}
      tabBar={(props) => <MainTabBar {...props} user={user} unreadCount={unreadCount} onSwipe={handleTabBarSwipe} />}
      screenOptions={{
        ...MAIN_TAB_TRANSITION_OPTIONS,
        headerShown: false,
        tabBarStyle: { position: 'absolute', height: TAB_BAR_HEIGHT },
      }}
    >
      {visibleScreens.map(({ name, component }) => <Tab.Screen key={name} name={name} component={component} />)}
    </Tab.Navigator>
  );
}

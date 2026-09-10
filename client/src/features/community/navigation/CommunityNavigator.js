import React, { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import CommunityScreen from '../screens/CommunityScreen';
import RoutesScreen from '../../roadtrip/screens/RoutesScreen';

const Mode = createBottomTabNavigator();
const hiddenTabBar = () => null;

export default function CommunityNavigator({ navigation, route }) {
  // Accept existing recommendation-map links while new links address the nested feed.
  useEffect(() => {
    if (!route?.params?.mapFocus) return;
    navigation.navigate('Community', {
      screen: 'CommunityFeed',
      params: { mapFocus: route.params.mapFocus },
      mapFocus: undefined,
    });
  }, [navigation, route?.params?.mapFocus]);
  return (
    <Mode.Navigator
      id="CommunityModes"
      initialRouteName="CommunityFeed"
      tabBar={hiddenTabBar}
      detachInactiveScreens={false}
      screenOptions={{ headerShown: false, lazy: true, freezeOnBlur: false, animation: 'none' }}
    >
      <Mode.Screen name="CommunityFeed" component={CommunityScreen} />
      <Mode.Screen name="Routes" component={RoutesScreen} />
    </Mode.Navigator>
  );
}

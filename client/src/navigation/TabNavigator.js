import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Image, View, Text, StyleSheet } from 'react-native';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useUnreadCount } from '../features/notifications/hooks/useUnreadCount';
import {tabConfigs, tabScreens} from './TabConfigs'

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
  const { user } = useCurrentUser();
  const unreadCount = useUnreadCount();
  
  console.log('Unread notification count in TabNavigator:', unreadCount);
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const config = tabConfigs[route.name];
        return ({
          tabBarIcon: ({ focused, color, size }) => {
            if (route.name === 'Profile' && user) {
              const iconContent = user.photoURL ? (
                <Image
                  source={{ uri: user.photoURL }}
                  style={{ width: size, height: size, borderRadius: size / 2, borderWidth: focused ? 2 : 0, borderColor: color }}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name={focused ? config.icon : `${config.icon}-outline`}
                  size={size}
                  color={color}
                />
              );
              
              // Wrap with badge container
              return (
                <View>
                  {iconContent}
                  {unreadCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
              );
            }
            return (
              <Ionicons name={focused ? config.icon : `${config.icon}-outline`}
                size={size}
                color={color}

              />
            );
          },
          tabBarActiveTintColor: config.activeColor,
          tabBarInactiveTintColor: 'gray',
          headerShown: false,
        });
      }}
    >
      {tabScreens.map(({ name, component }) => (
        <Tab.Screen key={name} name={name} component={component} />
      ))}
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FF3B30',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 1,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
});

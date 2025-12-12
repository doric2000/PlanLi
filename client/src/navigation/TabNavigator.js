import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
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
  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const config = tabConfigs[route.name];
        return ({
          tabBarIcon: ({focused, color, size}) => (
            <Ionicons name={focused ? config.icon : `${config.icon}-outline`}
            size={size}
            color={color}
            />
          ),
        tabBarActiveTintColor: config.activeColor,
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
        });
      }}
    >
      {tabScreens.map(({name, component}) => (
        <Tab.Screen key={name} name={name} component={component}/>
      ))}
    </Tab.Navigator>
  );
}

import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { SafeAreaProvider } from "react-native-safe-area-context";

import LoginScreen from "./src/features/auth/screens/LoginScreen";
import RegisterScreen from "./src/features/auth/screens/RegisterScreen";
import TabNavigator from "./src/navigation/TabNavigator";
import AddRecommendationScreen from "./src/features/community/screens/AddRecommendationScreen";
import AddRoutesScreen from "./src/features/roadtrip/screens/AddRoutesScreen";
import RoutesScreen from "./src/features/roadtrip/screens/RoutesScreen";
import RouteDetailScreen from "./src/features/roadtrip/screens/RouteDetailScreen";
import LandingPageScreen from "./src/features/city/screens/LandingPageScreen";

const Stack = createStackNavigator();

/**
 * Main App Component.
 * Sets up the Navigation Container and the Root Stack Navigator.
 *
 * Stack Screens:
 * - Login: Authentication screen
 * - Register: New user registration
 * - Main: Tab Navigator (Home, Community, etc.)
 * - Route: Routes list
 * - AddRecommendation: Modal for adding new content
 * - LandingPage: Dashboard for Landing Page Screen
 * - AddRoutesScreen: Screen to create/edit routes
 * - RouteDetail: Detailed view of a specific route
 */
export default function App() {
	return (
		<SafeAreaProvider>
			<NavigationContainer>
				<Stack.Navigator
					initialRouteName='Login'
					screenOptions={{ headerShown: false }}
				>
					<Stack.Screen name='Login' component={LoginScreen} />
					<Stack.Screen name='Register' component={RegisterScreen} />
					<Stack.Screen name='Main' component={TabNavigator} />
					<Stack.Screen name='Route' component={RoutesScreen} />
					<Stack.Screen
						name='AddRecommendation'
						component={AddRecommendationScreen}
						options={{
							presentation: "modal",
						}}
					/>
					<Stack.Screen
						name='LandingPage'
						component={LandingPageScreen}
					/>
					<Stack.Screen
						name='AddRoutesScreen'
						component={AddRoutesScreen}
					/>
					<Stack.Screen
						name='RouteDetail'
						component={RouteDetailScreen}
					/>
				</Stack.Navigator>
			</NavigationContainer>
		</SafeAreaProvider>
	);
}

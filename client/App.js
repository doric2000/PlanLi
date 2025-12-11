import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { SafeAreaProvider } from "react-native-safe-area-context";

import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import TabNavigator from "./src/navigation/TabNavigator";
import AddRecommendationScreen from "./src/screens/AddRecommendationScreen";
import AddRoutesScreen from "./src/screens/Routes/AddRoutesScreen";
import RoutesScreen from "./src/screens/Routes/RoutesScreen";
import RouteDetailScreen from "./src/screens/Routes/RouteDetailScreen";

import TripDashboardScreen from "./src/screens/TripDashboardScreen";
const Stack = createStackNavigator();

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
							headerShown: true,
							title: "Add Recommendation",
						}}
					/>
					<Stack.Screen
						name='TripDashboard'
						component={TripDashboardScreen}
					/>
					<Stack.Screen
						name='AddRoutesScreen'
						component={AddRoutesScreen}
					></Stack.Screen>
					<Stack.Screen
						name='RouteDetail'
						component={RouteDetailScreen}
						options={{ headerShown: true, title: "Route Details" }}
					/>
				</Stack.Navigator>
			</NavigationContainer>
		</SafeAreaProvider>
	);
}

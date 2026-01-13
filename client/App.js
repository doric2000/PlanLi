import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { SafeAreaProvider } from "react-native-safe-area-context";

import LoginScreen from "./src/features/auth/screens/LoginScreen";
import RegisterScreen from "./src/features/auth/screens/RegisterScreen";
import VerifyEmailScreen from "./src/features/auth/screens/VerifyEmailScreen";
import ChangeNameScreen from "./src/features/profile/screens/ChangeNameScreen";
import ChangePasswordScreen from "./src/features/profile/screens/ChangePasswordScreen";
import AddRecommendationScreen from "./src/features/community/screens/AddRecommendationScreen";
import RecommendationDetailScreen from "./src/features/community/screens/RecommendationDetailScreen";
import AddRoutesScreen from "./src/features/roadtrip/screens/AddRoutesScreen";
import RoutesScreen from "./src/features/roadtrip/screens/RoutesScreen";
import RouteDetailScreen from "./src/features/roadtrip/screens/RouteDetailScreen";
import SettingsScreen from "./src/features/profile/screens/SettingsScreen";
import LandingPageScreen from "./src/features/destination/screens/LandingPageScreen";
import EditProfileScreen from "./src/features/profile/screens/EditProfileScreen";
import NotificationScreen from "./src/features/notifications/screens/NotificationScreen";
import AdminPanelScreen from "./src/features/admin/screens/AdminPanelScreen";
import RightDrawerNavigator from "./src/navigation/RightDrawerNavigator";
import withRequireAuth from "./src/navigation/withRequireAuth";


const Stack = createStackNavigator();

const EditProfileAuthed = withRequireAuth(EditProfileScreen);
const NotificationsAuthed = withRequireAuth(NotificationScreen);
const SettingsAuthed = withRequireAuth(SettingsScreen);
const ChangeNameAuthed = withRequireAuth(ChangeNameScreen);
const ChangePasswordAuthed = withRequireAuth(ChangePasswordScreen);
const AdminPanelAuthed = withRequireAuth(AdminPanelScreen);

/**
 * Main App Component.
 * Sets up the Navigation Container and the Root Stack Navigator.
 *
 * Stack Screens:
 * - Login: Authentication screen
 * - Register: New user registration
 * - Main: Tab Navigator (Home, Community, etc.)
 * - EditProfile: User profile editing screen
 * - Notifications: Notifications screen
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
					initialRouteName='Main'
					screenOptions={{ headerShown: false }}
				>
					<Stack.Screen name='Login' component={LoginScreen} />
					<Stack.Screen name='Register' component={RegisterScreen} />
					<Stack.Screen name='VerifyEmail' component={VerifyEmailScreen} />
					<Stack.Screen name='Main' component={RightDrawerNavigator} />
					<Stack.Screen name="EditProfile" component={EditProfileAuthed} />
					<Stack.Screen name="Notifications" component={NotificationsAuthed} />
					<Stack.Screen name='Settings' component={SettingsAuthed} />
					<Stack.Screen name="ChangeName" component={ChangeNameAuthed} />
					<Stack.Screen name="ChangePassword" component={ChangePasswordAuthed} /> 
					<Stack.Screen name="AdminPanel" component={AdminPanelAuthed} />
					<Stack.Screen name='Route' component={RoutesScreen} />
					<Stack.Screen
						name='AddRecommendation'
						component={AddRecommendationScreen}
						options={{
							presentation: "modal",
						}}
					/>
					<Stack.Screen
						name='RecommendationDetail'
						component={RecommendationDetailScreen}
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

import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import AppFontProvider from "./src/components/AppFontProvider";

import LoginScreen from "./src/features/auth/screens/LoginScreen";
import RegisterScreen from "./src/features/auth/screens/RegisterScreen";
import VerifyEmailScreen from "./src/features/auth/screens/VerifyEmailScreen";
import ChangeNameScreen from "./src/features/profile/screens/ChangeNameScreen";
import ChangePasswordScreen from "./src/features/profile/screens/ChangePasswordScreen";
import AddRecommendationScreen from "./src/features/community/screens/AddRecommendationScreen";
import RecommendationDetailScreen from "./src/features/community/screens/RecommendationDetailScreen";
import AddRoutesScreen from "./src/features/roadtrip/screens/AddRoutesScreen";
import UserProfileScreen from "./src/features/profile/screens/UserProfileScreen";
import RoutesScreen from "./src/features/roadtrip/screens/RoutesScreen";
import RouteDetailScreen from "./src/features/roadtrip/screens/RouteDetailScreen";
import RouteMapScreen from "./src/features/roadtrip/screens/RouteMapScreen";
import SettingsScreen from "./src/features/profile/screens/SettingsScreen";
import LandingPageScreen from "./src/features/destination/screens/LandingPageScreen";
import EditProfileScreen from "./src/features/profile/screens/EditProfileScreen";
import PreferenceSetupScreen from "./src/features/profile/screens/PreferenceSetupScreen";
import NotificationScreen from "./src/features/notifications/screens/NotificationScreen";
import AdminPanelScreen from "./src/features/admin/screens/AdminPanelScreen";
import PreferenceSetupGate from "./src/navigation/PreferenceSetupGate";
import {
	rtlModalScreenOptions,
	rtlStackScreenOptions,
} from "./src/navigation/rtlStackOptions";
import withRequireAuth from "./src/navigation/withRequireAuth";
import ContentPublishBanner from "./src/features/publishing/ContentPublishBanner";
import { ContentPublishProvider } from "./src/features/publishing/ContentPublishContext";


const Stack = createStackNavigator();
const navigationRef = createNavigationContainerRef();

const EditProfileAuthed = withRequireAuth(EditProfileScreen);
const NotificationsAuthed = withRequireAuth(NotificationScreen);
const SettingsAuthed = withRequireAuth(SettingsScreen);
const ChangeNameAuthed = withRequireAuth(ChangeNameScreen);
const ChangePasswordAuthed = withRequireAuth(ChangePasswordScreen);
const AdminPanelAuthed = withRequireAuth(AdminPanelScreen);
const PreferenceSetupAuthed = withRequireAuth(PreferenceSetupScreen);

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
		<AppFontProvider>
			<SafeAreaProvider initialMetrics={initialWindowMetrics}>
				<ContentPublishProvider>
				<NavigationContainer ref={navigationRef}>
				<Stack.Navigator
					initialRouteName='Main'
					screenOptions={rtlStackScreenOptions}
				>
					<Stack.Screen name='Login' component={LoginScreen} />
					<Stack.Screen name='Register' component={RegisterScreen} />
					<Stack.Screen name='VerifyEmail' component={VerifyEmailScreen} />
					<Stack.Screen name='Main' component={PreferenceSetupGate} />
					<Stack.Screen name='PreferenceSetup' component={PreferenceSetupAuthed} />
					<Stack.Screen name="EditProfile" component={EditProfileAuthed} />
					<Stack.Screen name="Notifications" component={NotificationsAuthed} />
					<Stack.Screen name='Settings' component={SettingsAuthed} />
					<Stack.Screen name="ChangeName" component={ChangeNameAuthed} />
					<Stack.Screen name="ChangePassword" component={ChangePasswordAuthed} /> 
					<Stack.Screen name='UserProfile' component={UserProfileScreen} />
					<Stack.Screen name="AdminPanel" component={AdminPanelAuthed} />
					<Stack.Screen name='Route' component={RoutesScreen} />
					<Stack.Screen
						name='AddRecommendation'
						component={AddRecommendationScreen}
						options={rtlModalScreenOptions}
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
						options={rtlModalScreenOptions}
					/>
					<Stack.Screen
						name='RouteDetail'
						component={RouteDetailScreen}
						options={rtlModalScreenOptions}
					/>
					<Stack.Screen
						name='RouteMap'
						component={RouteMapScreen}
						options={rtlModalScreenOptions}
					/>
				</Stack.Navigator>
				</NavigationContainer>
				<ContentPublishBanner
					onReview={(publishJobId, contentType) => {
						if (navigationRef.isReady()) {
							navigationRef.navigate(
								contentType === 'route' ? 'AddRoutesScreen' : 'AddRecommendation',
								{ publishJobId }
							);
						}
					}}
				/>
				</ContentPublishProvider>
			</SafeAreaProvider>
		</AppFontProvider>
	);
}

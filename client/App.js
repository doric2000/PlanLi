import { useEffect, useRef, useState } from "react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { AppState } from "react-native";
import AppFontProvider from "./src/components/AppFontProvider";

import VerifyEmailScreen from "./src/features/auth/screens/VerifyEmailScreen";
import CompleteAccountScreen from "./src/features/auth/screens/CompleteAccountScreen";
import LegalDocumentScreen from "./src/features/legal/screens/LegalDocumentScreen";
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
import BlockedUsersScreen from "./src/features/profile/screens/BlockedUsersScreen";
import LandingPageScreen from "./src/features/destination/screens/LandingPageScreen";
import EditProfileScreen from "./src/features/profile/screens/EditProfileScreen";
import PreferenceSetupScreen from "./src/features/profile/screens/PreferenceSetupScreen";
import NotificationSettingsScreen from "./src/features/notifications/screens/NotificationSettingsScreen";
import { NotificationCenterProvider } from "./src/features/notifications/context/NotificationCenterContext";
import NotificationPushBridge from "./src/features/notifications/push/NotificationPushBridge";
import AdminPanelScreen from "./src/features/admin/screens/AdminPanelScreen";
import PreferenceSetupGate from "./src/navigation/PreferenceSetupGate";
import {
	rtlContentScreenOptions,
	rtlModalScreenOptions,
	rtlStackScreenOptions,
} from "./src/navigation/rtlStackOptions";
import withRequireAuth from "./src/navigation/withRequireAuth";
import ContentPublishBanner from "./src/features/publishing/ContentPublishBanner";
import { ContentPublishProvider } from "./src/features/publishing/ContentPublishContext";
import { AuthProvider } from "./src/features/auth/AuthContext";
import { BlockedUsersProvider } from "./src/features/moderation/BlockedUsersContext";
import AuthGateModal from "./src/features/auth/components/AuthGateModal";
import { CAPABILITIES } from "./src/constants/authPolicy";
import { addDiagnosticBreadcrumb, setDiagnosticTag } from "./src/services/ErrorReporting";
import { beginNoyaVisit } from "./src/features/profile/services/NoyaOnboardingStorage";


const Stack = createStackNavigator();
const navigationRef = createNavigationContainerRef();

const EditProfileAuthed = withRequireAuth(EditProfileScreen);
const NotificationSettingsAuthed = withRequireAuth(NotificationSettingsScreen);
const SettingsAuthed = withRequireAuth(SettingsScreen);
const ChangeNameAuthed = withRequireAuth(ChangeNameScreen);
const ChangePasswordAuthed = withRequireAuth(ChangePasswordScreen);
const BlockedUsersAuthed = withRequireAuth(BlockedUsersScreen);
const AdminPanelAuthed = withRequireAuth(AdminPanelScreen);
const AddRecommendationActive = withRequireAuth(AddRecommendationScreen, CAPABILITIES.ACTIVE);
const AddRoutesActive = withRequireAuth(AddRoutesScreen, CAPABILITIES.ACTIVE);

/**
 * Main App Component.
 * Sets up the Navigation Container and the Root Stack Navigator.
 *
 * Stack Screens:
 * - Login: Authentication screen
 * - Register: New user registration
 * - Main: Tab Navigator (Home, Community, etc.)
 * - EditProfile: User profile editing screen
 * - NotificationSettings: Native push and category preferences
 * - Route: Routes list
 * - AddRecommendation: Modal for adding new content
 * - LandingPage: Dashboard for Landing Page Screen
 * - AddRoutesScreen: Screen to create/edit routes
 * - RouteDetail: Detailed view of a specific route
 */
export default function App() {
	const initialRouteName = process.env.EXPO_PUBLIC_ADMIN_WEB === 'true' ? 'AdminPanel' : 'Main';
	const previousRouteNameRef = useRef(null);
	const [navigationReady, setNavigationReady] = useState(false);
	useEffect(() => {
		beginNoyaVisit().catch(() => {});
		const subscription = AppState.addEventListener('change', (state) => {
			if (state === 'active') beginNoyaVisit().catch(() => {});
		});
		return () => subscription.remove();
	}, []);
	const recordCurrentRoute = () => {
		const currentRouteName = navigationRef.getCurrentRoute()?.name;
		if (!currentRouteName || previousRouteNameRef.current === currentRouteName) return;
		setDiagnosticTag('screen', currentRouteName);
		addDiagnosticBreadcrumb({
			category: 'navigation',
			message: 'Navigation route changed',
			data: { from: previousRouteNameRef.current || 'initial', to: currentRouteName },
		});
		previousRouteNameRef.current = currentRouteName;
	};
	return (
		<AppFontProvider>
			<SafeAreaProvider initialMetrics={initialWindowMetrics}>
				<AuthProvider navigationRef={navigationRef}>
				 <BlockedUsersProvider>
				 <NotificationCenterProvider>
				 <ContentPublishProvider>
				<NavigationContainer
					ref={navigationRef}
					onReady={() => {
						setNavigationReady(true);
						recordCurrentRoute();
					}}
					onStateChange={recordCurrentRoute}
				>
				<Stack.Navigator
					initialRouteName={initialRouteName}
					screenOptions={rtlStackScreenOptions}
				>
					<Stack.Screen name='VerifyEmail' component={VerifyEmailScreen} />
					<Stack.Screen name='CompleteAccount' component={CompleteAccountScreen} />
					<Stack.Screen name='Terms' component={LegalDocumentScreen} />
					<Stack.Screen name='Privacy' component={LegalDocumentScreen} />
					<Stack.Screen name='CommunityGuidelines' component={LegalDocumentScreen} />
					<Stack.Screen name='Main' component={PreferenceSetupGate} />
					<Stack.Screen name='PreferenceSetup' component={PreferenceSetupScreen} />
					<Stack.Screen name="EditProfile" component={EditProfileAuthed} />
					<Stack.Screen name="NotificationSettings" component={NotificationSettingsAuthed} />
					<Stack.Screen name='Settings' component={SettingsAuthed} />
					<Stack.Screen name='BlockedUsers' component={BlockedUsersAuthed} />
					<Stack.Screen name="ChangeName" component={ChangeNameAuthed} />
					<Stack.Screen name="ChangePassword" component={ChangePasswordAuthed} /> 
					<Stack.Screen name='UserProfile' component={UserProfileScreen} />
					<Stack.Screen name="AdminPanel" component={AdminPanelAuthed} />
					<Stack.Screen name='Route' component={RoutesScreen} />
					<Stack.Screen
						name='AddRecommendation'
						component={AddRecommendationActive}
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
						component={AddRoutesActive}
						options={rtlModalScreenOptions}
					/>
					<Stack.Screen
						name='RouteDetail'
						component={RouteDetailScreen}
						options={rtlContentScreenOptions}
					/>
					<Stack.Screen
						name='RouteMap'
						component={RouteMapScreen}
						options={rtlContentScreenOptions}
					/>
				</Stack.Navigator>
				</NavigationContainer>
				<NotificationPushBridge
					navigationRef={navigationRef}
					navigationReady={navigationReady}
				/>
				<AuthGateModal />
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
				 </NotificationCenterProvider>
				 </BlockedUsersProvider>
				</AuthProvider>
			</SafeAreaProvider>
		</AppFontProvider>
	);
}

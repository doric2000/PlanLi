import { useEffect, useRef, useState } from "react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { AppState } from "react-native";
import AppFontProvider from "./src/components/AppFontProvider";

import VerifyEmailScreen from "./src/features/auth/screens/VerifyEmailScreen";
import CompleteAccountScreen from "./src/features/auth/screens/CompleteAccountScreen";
import TotpEnrollmentScreen from "./src/features/auth/screens/TotpEnrollmentScreen";
import LegalDocumentScreen from "./src/features/legal/screens/LegalDocumentScreen";
import ChangeNameScreen from "./src/features/profile/screens/ChangeNameScreen";
import ChangePasswordScreen from "./src/features/profile/screens/ChangePasswordScreen";
import AddRecommendationScreen from "./src/features/community/screens/AddRecommendationScreen";
import RecommendationDetailScreen from "./src/features/community/screens/RecommendationDetailScreen";
import AddRoutesScreen from "./src/features/roadtrip/screens/AddRoutesScreen";
import UserProfileScreen from "./src/features/profile/screens/UserProfileScreen";
import LegacyRoutesScreen from "./src/navigation/LegacyRoutesScreen";
import CreateMenuScreen from "./src/navigation/CreateMenuScreen";
import NotificationScreen from "./src/features/notifications/screens/NotificationScreen";
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
	profileStackScreenOptions,
	rtlContentScreenOptions,
	rtlModalScreenOptions,
	rtlStackScreenOptions,
} from "./src/navigation/rtlStackOptions";
import withRequireAuth from "./src/navigation/withRequireAuth";
import OperationBanner from "./src/features/operations/OperationBanner";
import { OperationProvider } from "./src/features/operations/OperationContext";
import ActivityScreen from "./src/features/operations/ActivityScreen";
import { openOperation } from "./src/features/operations/operationNavigation";
import { ProfilePhotoProvider } from "./src/features/operations/ProfilePhotoContext";
import { ContentPublishProvider } from "./src/features/publishing/ContentPublishContext";
import { AuthProvider } from "./src/features/auth/AuthContext";
import { BlockedUsersProvider } from "./src/features/moderation/BlockedUsersContext";
import AuthGateModal from "./src/features/auth/components/AuthGateModal";
import { CAPABILITIES } from "./src/constants/authPolicy";
import { addDiagnosticBreadcrumb, setDiagnosticTag } from "./src/services/ErrorReporting";
import { beginNoyaVisit } from "./src/features/profile/services/NoyaOnboardingStorage";
import { NoyaTourProvider } from "./src/features/noya/NoyaTourContext";
import NoyaTourOverlayHost from "./src/features/noya/NoyaTourOverlay";
import GuestPersonalizationBridge from "./src/features/profile/components/GuestPersonalizationBridge";
import { PersonalizationFeedbackProvider } from "./src/features/profile/context/PersonalizationFeedbackContext";
import RegionSelectorScreen from "./src/features/region/screens/RegionSelectorScreen";
import { RegionSelectionProvider } from "./src/features/region/context/RegionSelectionContext";


const Stack = createStackNavigator();
const navigationRef = createNavigationContainerRef();

const EditProfileAuthed = withRequireAuth(EditProfileScreen);
const ActivityAuthed = withRequireAuth(ActivityScreen);
const NotificationsAuthed = withRequireAuth(NotificationScreen);
const NotificationSettingsAuthed = withRequireAuth(NotificationSettingsScreen);
const SettingsAuthed = withRequireAuth(SettingsScreen);
const ChangeNameAuthed = withRequireAuth(ChangeNameScreen);
const ChangePasswordAuthed = withRequireAuth(ChangePasswordScreen);
const TotpEnrollmentAuthed = withRequireAuth(TotpEnrollmentScreen);
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
	const previousRouteNameRef = useRef(null);
	const [navigationReady, setNavigationReady] = useState(false);
	const [currentRouteName, setCurrentRouteName] = useState('');
	useEffect(() => {
		beginNoyaVisit().catch(() => {});
		const subscription = AppState.addEventListener('change', (state) => {
			if (state === 'active') beginNoyaVisit().catch(() => {});
		});
		return () => subscription.remove();
	}, []);
	const recordCurrentRoute = () => {
		const nextRouteName = navigationRef.getCurrentRoute()?.name;
		if (!nextRouteName) return;
		setCurrentRouteName(nextRouteName);
		if (previousRouteNameRef.current === nextRouteName) return;
		setDiagnosticTag('screen', nextRouteName);
		addDiagnosticBreadcrumb({
			category: 'navigation',
			message: 'Navigation route changed',
			data: { from: previousRouteNameRef.current || 'initial', to: nextRouteName },
		});
		previousRouteNameRef.current = nextRouteName;
	};
	return (
		<AppFontProvider>
			<SafeAreaProvider initialMetrics={initialWindowMetrics}>
				<AuthProvider navigationRef={navigationRef}>
				<OperationProvider>
				<ProfilePhotoProvider>
				<RegionSelectionProvider>
				 <PersonalizationFeedbackProvider>
				 <BlockedUsersProvider>
				 <NotificationCenterProvider>
				 <ContentPublishProvider>
				 <NoyaTourProvider currentRouteName={currentRouteName === 'CommunityFeed' ? 'Community' : currentRouteName} navigationReady={navigationReady} navigationRef={navigationRef}>
				<NavigationContainer
					ref={navigationRef}
					onReady={() => {
						setNavigationReady(true);
						recordCurrentRoute();
					}}
					onStateChange={recordCurrentRoute}
				>
				<Stack.Navigator
					initialRouteName="Main"
					screenOptions={rtlStackScreenOptions}
				>
					<Stack.Screen name='VerifyEmail' component={VerifyEmailScreen} />
					<Stack.Screen name='CompleteAccount' component={CompleteAccountScreen} />
					<Stack.Screen name='Terms' component={LegalDocumentScreen} options={profileStackScreenOptions} />
					<Stack.Screen name='Privacy' component={LegalDocumentScreen} options={profileStackScreenOptions} />
					<Stack.Screen name='CommunityGuidelines' component={LegalDocumentScreen} options={profileStackScreenOptions} />
					<Stack.Screen name='Main' component={PreferenceSetupGate} />
					<Stack.Screen name='RegionSelector' component={RegionSelectorScreen} options={profileStackScreenOptions} />
					<Stack.Screen name='PreferenceSetup' component={PreferenceSetupScreen} />
					<Stack.Screen name="EditProfile" component={EditProfileAuthed} options={profileStackScreenOptions} />
					<Stack.Screen name="Activity" component={ActivityAuthed} options={profileStackScreenOptions} />
					<Stack.Screen name="NotificationSettings" component={NotificationSettingsAuthed} options={profileStackScreenOptions} />
					<Stack.Screen name='Settings' component={SettingsAuthed} options={profileStackScreenOptions} />
					<Stack.Screen name='BlockedUsers' component={BlockedUsersAuthed} options={profileStackScreenOptions} />
					<Stack.Screen name="ChangeName" component={ChangeNameAuthed} options={profileStackScreenOptions} />
					<Stack.Screen name="ChangePassword" component={ChangePasswordAuthed} options={profileStackScreenOptions} />
					<Stack.Screen name="TotpEnrollment" component={TotpEnrollmentAuthed} options={profileStackScreenOptions} />
					<Stack.Screen name='UserProfile' component={UserProfileScreen} />
					<Stack.Screen name="AdminPanel" component={AdminPanelAuthed} options={profileStackScreenOptions} />
					<Stack.Screen name='Route' component={LegacyRoutesScreen} />
                    <Stack.Screen name='Routes' component={LegacyRoutesScreen} />
                    <Stack.Screen name='Notifications' component={NotificationsAuthed} options={profileStackScreenOptions} />
                    <Stack.Screen
                      name='CreateMenu'
                      component={CreateMenuScreen}
                      options={{
                        presentation: 'transparentModal',
                        cardStyle: { backgroundColor: 'transparent' },
                        gestureEnabled: false,
                        cardStyleInterpolator: ({ current }) => ({ cardStyle: { opacity: current.progress } }),
                      }}
                    />
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
				<OperationBanner
					hidden={currentRouteName === 'Activity'}
					onChooseRegion={() => navigationRef.isReady() && navigationRef.navigate('RegionSelector', { source: 'publish-change' })}
					onActivity={() => navigationRef.isReady() && navigationRef.navigate('Activity')}
					onOpen={(entry) => navigationRef.isReady() && openOperation(navigationRef, entry)}
				/>
				<NoyaTourOverlayHost />
				<GuestPersonalizationBridge />
				 </NoyaTourProvider>
				 </ContentPublishProvider>
				 </NotificationCenterProvider>
				 </BlockedUsersProvider>
				 </PersonalizationFeedbackProvider>
				</RegionSelectionProvider>
				</ProfilePhotoProvider>
				</OperationProvider>
				</AuthProvider>
			</SafeAreaProvider>
		</AppFontProvider>
	);
}

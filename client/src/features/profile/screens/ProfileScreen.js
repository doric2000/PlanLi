/**
 * Screen for displaying and editing user profile.
 */
import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { ActivityIndicator, FlatList, TouchableOpacity, View } from "react-native";
import { DrawerActions } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { db } from "../../../config/firebase";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { useAuthUser } from "../../../hooks/useAuthUser";
import { colors, common, createProfileScreenStyles } from "../../../styles";

import ProfileHeader from "../components/ProfileHeader";
import ProfileStatsCard from "../components/ProfileStatsCard";
import { ProfileContentEmpty, ProfileContentHeader, ProfileGridTile } from "../components/ProfileContentGrid";
import SupportModal from "../components/SupportModal";

import { useProfileData } from "../hooks/useProfileData";
import { useProfilePhoto } from "../hooks/useProfilePhoto";
import { useTabPressScrollOrRefresh } from "../../../hooks/useTabPressScrollOrRefresh";
import { getSmartProfileBadges } from "../utils/smartProfileBadges";

import {
	collection,
	getDocs,
	limit,
	orderBy,
	query,
	where,
} from "firebase/firestore";

function getRootNavigation(navigation) {
	let current = navigation;
	let parent = current?.getParent?.();
	while (parent) {
		current = parent;
		parent = current?.getParent?.();
	}
	return current;
}

function ProfileScreen({ navigation, route }) {
	const { isGuest, loading: authLoading } = useAuthUser();

	useEffect(() => {
		if (authLoading || !isGuest) return;

		try {
			navigation.navigate?.("Auth");
			return;
		} catch {
			// ignore
		}

		const rootNav = getRootNavigation(navigation);
		rootNav?.navigate?.("Login");
	}, [authLoading, isGuest, navigation]);

	if (authLoading) {
		return (
			<SafeAreaView style={common.container}>
				<View style={common.loadingContainer}>
					<ActivityIndicator size="large" color={colors.accent} />
				</View>
			</SafeAreaView>
		);
	}

	if (isGuest) return null;

	return <AuthedProfileScreen navigation={navigation} route={route} />;
}

function AuthedProfileScreen({ navigation, route }) {
	const { user } = useCurrentUser();
	const profileUid = route?.params?.uid || user?.uid;
	const isMyProfile = profileUid === user?.uid;
	const insets = useSafeAreaInsets();
	const profileStyles = createProfileScreenStyles(insets);

	const [supportOpen, setSupportOpen] = useState(false);
	const [contentTab, setContentTab] = useState("recommendations");
	const [myRecs, setMyRecs] = useState([]);
	const [myRoutes, setMyRoutes] = useState([]);
	const [contentLoading, setContentLoading] = useState(false);

	const activeData = contentTab === "recommendations" ? myRecs : myRoutes;

	const { userData, stats, loading, refresh, resetProfileState, setUserData } = useProfileData({
		uid: profileUid,
		user,
	});

	const loadMyContent = useCallback(async (isSilent = false) => {
		if (!profileUid) return;
		if (!isSilent) setContentLoading(true);

		try {
			let recSnap;
			try {
				const recQ = query(
					collection(db, "recommendations"),
					where("userId", "==", profileUid),
					orderBy("createdAt", "desc"),
					limit(30)
				);
				recSnap = await getDocs(recQ);
			} catch (err) {
				console.log("Ordered recs query failed, fallback:", err?.message);
				const recQFallback = query(
					collection(db, "recommendations"),
					where("userId", "==", profileUid),
					limit(30)
				);
				recSnap = await getDocs(recQFallback);
			}

			setMyRecs(recSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

			let routesSnap;
			try {
				const routesQ = query(
					collection(db, "routes"),
					where("userId", "==", profileUid),
					orderBy("createdAt", "desc"),
					limit(30)
				);
				routesSnap = await getDocs(routesQ);
			} catch (err) {
				console.log("Ordered routes query failed, fallback:", err?.message);
				const routesQFallback = query(
					collection(db, "routes"),
					where("userId", "==", profileUid),
					limit(30)
				);
				routesSnap = await getDocs(routesQFallback);
			}

			setMyRoutes(routesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
		} catch (e) {
			console.log("loadMyContent error:", e?.message || e);
		} finally {
			if (!isSilent) setContentLoading(false);
		}
	}, [profileUid]);

	useEffect(() => {
		if (route?.params?.openSupport) {
			setSupportOpen(true);
			navigation.setParams({ openSupport: false });
		}
	}, [route?.params?.openSupport, navigation]);

	const { onPickImage, uploading } = useProfilePhoto({
		uid: profileUid,
		user,
		userData,
		updateLocalUserData: setUserData,
	});

	useEffect(() => {
		loadMyContent();
	}, [loadMyContent]);

	useEffect(() => {
		const unsubscribe = navigation.addListener("focus", () => {
			refresh(true);
			loadMyContent(true);
		});
		return unsubscribe;
	}, [navigation, refresh, loadMyContent]);

	const profileListRef = useRef(null);
	const tabPressRefresh = useCallback(() => {
		refresh();
		loadMyContent();
	}, [refresh, loadMyContent]);

	const { onScroll: profileTabOnScroll } = useTabPressScrollOrRefresh({
		variant: 'flatlist',
		scrollRef: profileListRef,
		onRefresh: tabPressRefresh,
		enabled: !loading,
		scrollYResetKey: contentTab,
	});

	const smartBadges = useMemo(
		() => getSmartProfileBadges(userData?.smartProfile),
		[userData?.smartProfile]
	);

	if (loading) {
		return (
			<SafeAreaView style={common.container}>
				<View style={common.loadingContainer}>
					<ActivityIndicator size="large" color={colors.accent} />
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={profileStyles.screen}>
			<TouchableOpacity
				style={profileStyles.menuButton}
				onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
				activeOpacity={0.85}
			>
				<Ionicons name="menu" size={24} color={colors.textPrimary} />
			</TouchableOpacity>

			<FlatList
				ref={profileListRef}
				key={`profile-grid-${contentTab}`}
				data={activeData}
				keyExtractor={(item) => item.id}
				extraData={contentTab}
				numColumns={3}
				onScroll={profileTabOnScroll}
				scrollEventThrottle={16}
				columnWrapperStyle={profileStyles.gridRow}
				contentContainerStyle={profileStyles.listContent}
				ListHeaderComponent={
					<View style={profileStyles.headerBlock}>
						<ProfileHeader
							userData={userData}
							stats={stats}
							smartBadges={smartBadges}
							onPickImage={isMyProfile ? onPickImage : undefined}
							uploading={isMyProfile ? uploading : false}
							onEditSmartProfile={() => navigation.getParent?.()?.navigate?.("EditProfile")}
						/>

						<ProfileStatsCard stats={stats} />

						<ProfileContentHeader
							profileStyles={profileStyles}
							contentTab={contentTab}
							onChangeTab={setContentTab}
							contentLoading={contentLoading}
							title="התוכן שלי"
							subtitle="המלצות ומסלולים ששיתפת בקהילה"
						/>
					</View>
				}
				renderItem={({ item }) => (
					<ProfileGridTile
						item={item}
						contentTab={contentTab}
						contentLoading={contentLoading}
						navigation={navigation}
						profileStyles={profileStyles}
					/>
				)}
				ListEmptyComponent={
					!contentLoading ? (
						<ProfileContentEmpty contentTab={contentTab} profileStyles={profileStyles} ownerLabel="הפרופיל" />
					) : null
				}
			/>

		<SupportModal visible={supportOpen} onClose={() => setSupportOpen(false)} />
	</SafeAreaView>
	);
}

export default ProfileScreen;

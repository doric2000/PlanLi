import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";

import { auth, db } from "../../../config/firebase";
import { colors, common, createProfileScreenStyles } from "../../../styles";

import ProfileHeader from "../components/ProfileHeader";
import ProfileStatsCard from "../components/ProfileStatsCard";
import { ProfileContentEmpty, ProfileContentHeader, ProfileGridTile } from "../components/ProfileContentGrid";
import { useProfileData } from "../hooks/useProfileData";
import { getSmartProfileBadges } from "../utils/smartProfileBadges";

async function getProfileContentSnapshot(collectionName, uid) {
	try {
		return await getDocs(
			query(
				collection(db, collectionName),
				where("ownerId", "==", uid),
				where("status", "==", "active"),
				orderBy("createdAt", "desc"),
				limit(30)
			)
		);
	} catch (error) {
		console.log(`Ordered ${collectionName} query failed, fallback:`, error?.message);
		return getDocs(
			query(
				collection(db, collectionName),
				where("ownerId", "==", uid),
				where("status", "==", "active"),
				limit(30)
			)
		);
	}
}

export default function UserProfileScreen({ route, navigation }) {
	const uid = route?.params?.uid;
	const insets = useSafeAreaInsets();
	const profileStyles = createProfileScreenStyles(insets);
	const currentUser = auth.currentUser;

	const [contentTab, setContentTab] = useState("recommendations");
	const [myRecs, setMyRecs] = useState([]);
	const [myRoutes, setMyRoutes] = useState([]);
	const [contentLoading, setContentLoading] = useState(false);
	const profileListRef = useRef(null);

	const activeData = contentTab === "recommendations" ? myRecs : myRoutes;

	const { userData, stats, loading: profileLoading, refresh } = useProfileData({
		uid,
		user: currentUser,
	});

	const publicUserData = useMemo(() => {
		if (!userData) return userData;

		const smartProfile = userData?.smartProfile ? { ...userData.smartProfile } : null;
		if (smartProfile) {
			delete smartProfile.travelStyle;
			delete smartProfile.budget;
			delete smartProfile.budgetTag;
			delete smartProfile.travelStyleTag;
		}

		return {
			...userData,
			email: "",
			smartProfile,
		};
	}, [userData]);

	const smartBadges = useMemo(
		() => getSmartProfileBadges(publicUserData?.smartProfile),
		[publicUserData?.smartProfile]
	);

	const loadContent = useCallback(async (isSilent = false) => {
		if (!uid) return;
		if (!isSilent) setContentLoading(true);

		try {
			const [recSnap, routesSnap] = await Promise.all([
				getProfileContentSnapshot("recommendations", uid),
				getProfileContentSnapshot("routes", uid),
			]);

			setMyRecs(recSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
			setMyRoutes(routesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
		} catch (e) {
			console.log("loadContent error:", e?.message || e);
		} finally {
			if (!isSilent) setContentLoading(false);
		}
	}, [uid]);

	useEffect(() => {
		loadContent();
	}, [loadContent]);

	useEffect(() => {
		const unsubscribe = navigation?.addListener?.("focus", () => {
			refresh?.(true);
			loadContent(true);
		});
		return unsubscribe;
	}, [navigation, refresh, loadContent]);

	useEffect(() => {
		profileListRef.current?.scrollToOffset?.({ offset: 0, animated: false });
	}, [contentTab]);

	if (profileLoading) {
		return (
			<SafeAreaView style={profileStyles.screen}>
				<TouchableOpacity
					style={profileStyles.backButton}
					onPress={() => navigation.goBack()}
					activeOpacity={0.85}
				>
					<Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
				</TouchableOpacity>
				<View style={common.loadingContainer}>
					<ActivityIndicator size="large" color={colors.accent} />
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={profileStyles.screen}>
			<TouchableOpacity
				style={profileStyles.backButton}
				onPress={() => navigation.goBack()}
				activeOpacity={0.85}
			>
				<Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
			</TouchableOpacity>

			<FlatList
				ref={profileListRef}
				data={activeData}
				keyExtractor={(item) => item.id}
				extraData={contentTab}
				numColumns={3}
				initialNumToRender={3}
				maxToRenderPerBatch={3}
				windowSize={5}
				columnWrapperStyle={profileStyles.gridRow}
				contentContainerStyle={profileStyles.listContent}
				ListHeaderComponent={
					<View style={profileStyles.headerBlock}>
						<ProfileHeader
							userData={publicUserData}
							stats={stats}
							smartBadges={smartBadges}
							onPickImage={undefined}
							uploading={false}
							onEditSmartProfile={undefined}
						/>

						<ProfileStatsCard stats={stats} />

						<ProfileContentHeader
							profileStyles={profileStyles}
							contentTab={contentTab}
							onChangeTab={setContentTab}
							contentLoading={contentLoading}
							title={`התוכן של ${publicUserData?.displayName || "המטייל"}`}
							subtitle="המלצות ומסלולים ששותפו בקהילה"
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
						<ProfileContentEmpty
							contentTab={contentTab}
							profileStyles={profileStyles}
							ownerLabel={publicUserData?.displayName || "המשתמש"}
						/>
					) : null
				}
			/>
		</SafeAreaView>
	);
}

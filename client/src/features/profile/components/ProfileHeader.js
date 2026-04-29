import React, { useMemo } from "react";
import { ActivityIndicator, Image, Platform, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { colors, profileHeaderStyles as styles } from "../../../styles";
import ProfileBadge from "./ProfileBadge";
import { TRAVEL_STYLES, TRIP_TYPES } from "../constants/smartProfileOptions";

const labelFromOptions = (options, value) =>
	options?.find((o) => o.value === value)?.label || value;

const translateLevel = (label) => {
	const match = String(label || "").match(/level\s*(\d+)/i);
	return match ? `מטייל רמה ${match[1]}` : label || "מטייל רמה 1";
};

export default function ProfileHeader({
	userData,
	stats,
	smartBadges,
	onPickImage,
	uploading,
	onEditSmartProfile,
}) {
	const initial = userData?.displayName?.charAt(0)?.toUpperCase() || "T";
	const smartProfile = userData?.smartProfile || null;

	const travelStyleValue =
		smartProfile?.travelStyle ??
		smartProfile?.budget ??
		smartProfile?.budgetTag ??
		smartProfile?.travelStyleTag ??
		null;

	const tripTypeValue =
		smartProfile?.tripType ??
		smartProfile?.travelerType ??
		smartProfile?.tripGroup ??
		smartProfile?.groupType ??
		null;

	const travelStyleLabel = useMemo(() => {
		if (!travelStyleValue) return null;
		return labelFromOptions(TRAVEL_STYLES, travelStyleValue) || String(travelStyleValue);
	}, [travelStyleValue]);

	const tripTypeLabel = useMemo(() => {
		if (!tripTypeValue) return null;
		return labelFromOptions(TRIP_TYPES, tripTypeValue) || String(tripTypeValue);
	}, [tripTypeValue]);

	const hasSmartProfileMain = Boolean(travelStyleLabel || tripTypeLabel);
	const levelLabel = translateLevel(stats?.credibilityLabel);

	return (
		<View style={styles.hero}>
			<LinearGradient
				colors={["rgba(76,114,255,0.16)", "rgba(255,255,255,0)"]}
				style={styles.heroWash}
				pointerEvents="none"
			/>

			<View style={styles.avatarStage}>
				<View style={styles.avatarRing}>
					{userData?.photoURL ? (
						Platform.OS === "web" ? (
							<img src={userData.photoURL} alt="" style={styles.webAvatarImage} />
						) : (
							<Image source={{ uri: userData.photoURL }} style={styles.avatarImage} />
						)
					) : (
						<View style={[styles.avatarImage, styles.avatarPlaceholder]}>
							<Text style={styles.avatarInitial}>{initial}</Text>
						</View>
					)}

					{typeof onPickImage === "function" ? (
						<TouchableOpacity
							onPress={onPickImage}
							style={styles.cameraButton}
							disabled={uploading}
							activeOpacity={0.85}
						>
							{uploading ? (
								<ActivityIndicator size="small" color={colors.white} />
							) : (
								<Ionicons name="camera" size={18} color={colors.white} />
							)}
						</TouchableOpacity>
					) : null}
				</View>
			</View>

			<Text style={styles.name} numberOfLines={1}>
				{userData?.displayName}
			</Text>
			{userData?.email ? (
				<Text style={styles.email} numberOfLines={1}>
					{userData.email}
				</Text>
			) : null}

			<View style={styles.badgeRow}>
				<ProfileBadge text={levelLabel} variant="muted" />
				{userData?.isExpert ? <ProfileBadge text="מאומת" variant="verified" /> : null}
			</View>

			{hasSmartProfileMain ? (
				<View style={styles.badgeRow}>
					{travelStyleLabel ? <ProfileBadge text={travelStyleLabel} variant="muted" /> : null}
					{tripTypeLabel ? <ProfileBadge text={tripTypeLabel} variant="muted" /> : null}
				</View>
			) : typeof onEditSmartProfile === "function" ? (
				<TouchableOpacity
					onPress={onEditSmartProfile}
					style={styles.smartProfileCta}
					activeOpacity={0.85}
				>
					<Ionicons name="sparkles" size={15} color={colors.primary} />
					<Text style={styles.smartProfileCtaText}>התאם פרופיל חכם</Text>
				</TouchableOpacity>
			) : null}

			{smartBadges?.length ? (
				<View style={styles.badgeRow}>
					{smartBadges.map((badge, idx) => (
						<ProfileBadge key={`${badge}-${idx}`} text={badge} />
					))}
				</View>
			) : null}
		</View>
	);
}

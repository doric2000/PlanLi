import React from "react";
import { ActivityIndicator, Platform, Pressable, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import CachedImage from "../../../components/CachedImage";
import { colors } from "../../../styles";
import {
	getRecommendationImageUrls,
	getRouteImageUrls,
} from "../../../utils/mediaAssets";
import { loadRouteDetails } from "../../../services/RouteService";

export function ProfileContentHeader({
	profileStyles,
	contentTab,
	onChangeTab,
	contentLoading,
	title = "התוכן שלי",
	subtitle = "המלצות ומסלולים ששיתפת בקהילה",
}) {
	const renderTab = (tab, label, icon) => {
		const isActive = contentTab === tab;
		return (
			<TouchableOpacity
				key={tab}
				onPress={() => onChangeTab(tab)}
				style={[profileStyles.tabBtn, isActive ? profileStyles.tabBtnActive : profileStyles.tabBtnInactive]}
				activeOpacity={0.86}
			>
				<Ionicons
					name={icon}
					size={19}
					color={isActive ? colors.white : colors.textSecondary}
				/>
				<Text style={[profileStyles.tabText, isActive ? profileStyles.tabTextActive : profileStyles.tabTextInactive]}>
					{label}
				</Text>
			</TouchableOpacity>
		);
	};

	return (
		<>
			<View style={profileStyles.contentIntro}>
				<Text style={profileStyles.contentTitle}>{title}</Text>
				<Text style={profileStyles.contentSubtitle}>{subtitle}</Text>
			</View>

			<View style={profileStyles.tabRow}>
				{renderTab("recommendations", "המלצות", "thumbs-up-outline")}
				{renderTab("routes", "מסלולים", "map-outline")}
			</View>

			{contentLoading ? (
				<View style={profileStyles.contentLoading}>
					<ActivityIndicator size="small" color={colors.accent} />
				</View>
			) : null}
		</>
	);
}

export function ProfileGridTile({ item, contentTab, contentLoading, navigation, profileStyles }) {
	if (contentLoading) return null;

	const isRecommendation = contentTab === "recommendations";
	const image = isRecommendation
		? getRecommendationImageUrls(item, "thumb")[0] || null
		: getRouteImageUrls(item, "thumb")[0] || null;
	const title = isRecommendation
		? item?.title || item?.name || "המלצה"
		: item?.Title || item?.title || "מסלול";
	const subtitle = isRecommendation
		? item?.destination?.cityName || item?.destination?.countryName || ""
		: Array.isArray(item?.summaryPlaces)
			? item.summaryPlaces.filter(Boolean).slice(0, 2).join(" · ")
			: "";
	const icon = isRecommendation ? "thumbs-up" : "map";
	const fallbackIcon = isRecommendation ? "image-outline" : "map-outline";

	const handlePress = async () => {
		if (isRecommendation) {
			navigation.navigate("RecommendationDetail", { item });
			return;
		}
		const routeData = await loadRouteDetails(item.id);
		navigation.navigate("RouteDetail", { routeData });
	};

	return (
		<Pressable style={profileStyles.gridTile} onPress={handlePress}>
			{image ? (
				<CachedImage
					source={{ uri: image }}
					style={
						Platform.OS === "web"
							? profileStyles.gridWebImage
							: profileStyles.gridImage
					}
					contentFit="cover"
					priority="low"
				/>
			) : (
				<View style={profileStyles.gridFallback}>
					<Ionicons name={fallbackIcon} size={28} color={colors.white} />
				</View>
			)}
			<View style={profileStyles.gridShade} />
			<View style={profileStyles.gridTypeBadge}>
				<Ionicons name={icon} size={13} color={colors.white} />
			</View>
			<View style={profileStyles.gridTextWrap}>
				<Text style={profileStyles.gridTitle} numberOfLines={1}>
					{title}
				</Text>
				{!!subtitle && (
					<Text style={profileStyles.gridSubtitle} numberOfLines={1}>
						{subtitle}
					</Text>
				)}
			</View>
		</Pressable>
	);
}

export function ProfileContentEmpty({ contentTab, profileStyles, ownerLabel = "הפרופיל" }) {
	return (
		<View style={profileStyles.emptyState}>
			<Ionicons
				name={contentTab === "recommendations" ? "thumbs-up-outline" : "map-outline"}
				size={34}
				color={colors.textMuted}
			/>
			<Text style={profileStyles.emptyTitle}>
				{contentTab === "recommendations" ? "אין עדיין המלצות" : "אין עדיין מסלולים"}
			</Text>
			<Text style={profileStyles.emptyText}>
				{contentTab === "recommendations"
					? `המלצות של ${ownerLabel} יופיעו כאן.`
					: `מסלולים של ${ownerLabel} יופיעו כאן.`}
			</Text>
		</View>
	);
}

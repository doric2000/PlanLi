import React, { useEffect, useMemo, useRef, useState } from "react";
import {
	FlatList,
	Platform,
	Pressable,
	Text,
	TouchableOpacity,
	useWindowDimensions,
	View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useUserData } from "../../../hooks/useUserData";
import { useBoundedImageWindow } from "../../../hooks/useBoundedImageWindow";
import { Avatar } from "../../../components/Avatar";
import CachedImage, { prefetchImage } from "../../../components/CachedImage";
import PlacesRoute from "./PlacesRoute";
import { ActionMenu } from "../../../components/ActionMenu";
import ActionBar from "../../../components/ActionBar";
import FavoriteButton from "../../../components/FavoriteButton";
import { cards, tags as tagsStyle, routeCardStyles as styles } from "../../../styles";
import { auth } from "../../../config/firebase";
import { getUserTier } from "../../../utils/userTier";
import { useAdminClaim } from "../../../hooks/useAdminClaim";
import { formatTimestamp } from "../../../utils/formatTimestamp";
import { getRouteImageUrls } from "../../../utils/mediaAssets";
import {
	getOptionLabel,
	getTagLabel,
	INTERESTS,
	ROUTE_DIFFICULTIES,
	TRANSPORT_MODES,
} from "../../../constants/travelTaxonomy";
import { getPersonalizationReasonLabel } from "../../profile/constants/smartProfileOptions";

const text = {
	defaultUser: "\u05de\u05d8\u05d9\u05d9\u05dc PlanLi",
	menuTitle: "\u05e0\u05d9\u05d4\u05d5\u05dc \u05de\u05e1\u05dc\u05d5\u05dc",
	days: "\u05d9\u05de\u05d9\u05dd",
	km: "\u05e7\u05f4\u05de",
	noImage: "\u05de\u05e1\u05dc\u05d5\u05dc \u05d8\u05d9\u05d5\u05dc",
};

const getAllTags = (route) => {
	const tags = [
		...(route?.subcategoryIds || []).map(getTagLabel),
		...(route?.facets?.interests || [])
			.slice(0, 2)
			.map((interestId) => getOptionLabel(INTERESTS, interestId)),
	].filter(Boolean);

	return Array.from(new Set(tags));
};

const RenderTags = ({ tags }) => {
	const MAX_VISIBLE = 3;
	const [showAll, setShowAll] = useState(false);

	if (!Array.isArray(tags) || tags.length === 0) return null;

	const visibleTags = showAll ? tags : tags.slice(0, MAX_VISIBLE);
	const hasMore = tags.length > MAX_VISIBLE;

	return (
		<View style={tagsStyle.wrapper}>
			<ScrollViewLike>
				{visibleTags.map((tag, idx) => (
					<View key={`${tag}:${idx}`} style={tagsStyle.item}>
						<Text style={tagsStyle.text}>#{tag}</Text>
					</View>
				))}
				{!showAll && hasMore && (
					<TouchableOpacity onPress={() => setShowAll(true)} activeOpacity={0.8}>
						<Text style={styles.moreTagsText}>+{tags.length - MAX_VISIBLE}</Text>
					</TouchableOpacity>
				)}
			</ScrollViewLike>
		</View>
	);
};

const ScrollViewLike = ({ children }) => (
	<FlatList
		horizontal
		inverted
		data={React.Children.toArray(children)}
		keyExtractor={(_, index) => `tag-${index}`}
		renderItem={({ item }) => item}
		showsHorizontalScrollIndicator={false}
		style={tagsStyle.container}
	/>
);

export const RouteCard = ({
	item,
	onPress,
	isOwner,
	onEdit,
	onDelete,
	onCommentPress,
	showActionBar = true,
	showActionMenu = true,
	variant = "default",
}) => {
	const navigation = useNavigation();
	const { width: windowWidth } = useWindowDimensions();
	const isFeed = variant === "feed";
	const routeImages = useMemo(
		() => getRouteImageUrls(item, "feed"),
		[item]
	);
	const thumbnailUrl = useMemo(
		() => getRouteImageUrls(item, "thumb")[0] || null,
		[item]
	);
	const allTags = useMemo(() => getAllTags(item), [item]);
	const [carouselWidth, setCarouselWidth] = useState(null);
	const [activeImageIndex, setActiveImageIndex] = useState(0);
	const carouselRef = useRef(null);
	const imageWindow = useBoundedImageWindow(activeImageIndex, routeImages.length);
	useEffect(() => {
		prefetchImage(
			imageWindow.indices
				.filter((index) => index !== imageWindow.currentIndex)
				.map((index) => routeImages[index])
				.filter(Boolean)
		).catch(() => {});
	}, [imageWindow.currentIndex, imageWindow.indices, routeImages]);
	const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;
	const onViewableItemsChanged = useRef(({ viewableItems }) => {
		const first = viewableItems?.[0]?.index;
		if (typeof first === "number") setActiveImageIndex(first);
	}).current;

	const author = useUserData(item.ownerId);
	const displayUser = author.displayName || text.defaultUser;
	const userPhoto = author.photoURL;
	const descriptionPreview = item?.description
		? item.description.length > 100
			? `${item.description.substring(0, 100)}...`
			: item.description
		: "";
	const snapshotData = {
		name: item?.title || undefined,
		thumbnail_url: thumbnailUrl,
		sub_text: descriptionPreview,
		rating: item?.rating,
		days: item?.dayCount,
		distance: item?.distanceKm,
	};

	const tier = getUserTier(auth.currentUser);
	const { isAdmin } = useAdminClaim();
	const canManage = tier === "verified" && (isOwner || isAdmin);
	const places = Array.isArray(item?.summaryPlaces) ? item.summaryPlaces : [];

	const handleAuthorPress = () => {
		if (item.ownerId) navigation.navigate("UserProfile", { uid: item.ownerId });
	};

	const renderCarouselImage = (uri, index) => {
		const pageWidth = carouselWidth || windowWidth || 0;

		if (index !== imageWindow.currentIndex) {
			return (
				<View
					style={[
						cards.recCarouselImage,
						{ width: pageWidth || "100%" },
					]}
				/>
			);
		}

		return (
			<CachedImage
				source={{ uri }}
				style={[
					Platform.OS === "web" ? cards.recWebImage : cards.recCarouselImage,
					{ width: pageWidth || "100%" },
				]}
				contentFit="cover"
				priority={index === imageWindow.currentIndex ? "normal" : "low"}
			/>
		);
	};

	const scrollToImageIndex = (nextIndex) => {
		if (!routeImages.length) return;
		const clamped = Math.max(0, Math.min(nextIndex, routeImages.length - 1));
		try {
			carouselRef.current?.scrollToIndex?.({ index: clamped, animated: true });
			setActiveImageIndex(clamped);
		} catch {
			// ignore
		}
	};

	const renderOverlayHeader = () => (
		<View style={styles.feedHeaderOverlay}>
			<TouchableOpacity
				style={[cards.recAuthorInfo, styles.feedAuthorInfo]}
				activeOpacity={0.75}
				onPress={handleAuthorPress}
			>
				<View style={styles.feedAvatarRing}>
					<Avatar
						photoURL={userPhoto}
						photoMedia={author.photoMedia}
						displayName={displayUser}
						size={40}
					/>
				</View>
				<View style={styles.feedAuthorTextWrap}>
					<Text style={[cards.recUsername, styles.feedUsername]} numberOfLines={1}>
						{displayUser}
					</Text>
					{!!item.createdAt && (
						<Text style={[cards.recDate, styles.feedMetaText]} numberOfLines={1}>
							{formatTimestamp(item.createdAt)}
						</Text>
					)}
					{places.length > 0 && (
						<Text style={styles.feedMetaText} numberOfLines={1}>
							{places.join(" • ")}
						</Text>
					)}
				</View>
			</TouchableOpacity>

			<View style={[cards.recHeaderActionsRow, styles.feedHeaderActions]}>
				<FavoriteButton
					type="routes"
					id={item.id}
					variant="overlay"
					snapshotData={snapshotData}
				/>
				{canManage && showActionMenu ? (
					<ActionMenu
						iconColor="#FFFFFF"
						onEdit={onEdit}
						onDelete={onDelete}
						title={text.menuTitle}
					/>
				) : null}
			</View>
		</View>
	);

	const renderFeedMedia = () => (
		<View
			style={[cards.recCarouselContainer, styles.feedCarouselContainer]}
			onLayout={(event) => setCarouselWidth(event.nativeEvent.layout.width)}
		>
			{routeImages.length > 0 ? (
				<FlatList
					ref={carouselRef}
					data={routeImages}
					extraData={imageWindow.currentIndex}
					keyExtractor={(uri, index) => `${item.id || "route"}:${index}:${uri}`}
					horizontal
					pagingEnabled
					showsHorizontalScrollIndicator={false}
					scrollEnabled={routeImages.length > 1}
					nestedScrollEnabled
					initialNumToRender={1}
					maxToRenderPerBatch={1}
					windowSize={3}
					renderItem={({ item: uri, index }) => (
						<View style={[cards.recCarouselItem, { width: carouselWidth || windowWidth || "100%" }]}>
							{renderCarouselImage(uri, index)}
						</View>
					)}
					onViewableItemsChanged={onViewableItemsChanged}
					viewabilityConfig={viewabilityConfig}
					getItemLayout={(_, index) => {
						const pageWidth = carouselWidth || windowWidth || 0;
						return { length: pageWidth, offset: pageWidth * index, index };
					}}
				/>
			) : (
				<View style={styles.feedImagePlaceholder}>
					<Ionicons name="map-outline" size={54} color="rgba(255,255,255,0.62)" />
					<Text style={styles.feedPlaceholderText}>{text.noImage}</Text>
				</View>
			)}

			<LinearGradient
				pointerEvents="none"
				colors={["rgba(0,0,0,0.72)", "rgba(0,0,0,0.18)", "transparent"]}
				style={styles.feedTopGradient}
			/>
			{renderOverlayHeader()}

			{routeImages.length > 1 && (
				<View style={[cards.recDotsContainer, styles.feedDotsContainer]} pointerEvents="none">
					{routeImages.map((_, index) => (
						<View
							key={`${item.id || "route"}:dot:${index}`}
							style={[
								cards.recDot,
								index === activeImageIndex && cards.recDotActive,
							]}
						/>
					))}
				</View>
			)}

			{Platform.OS === "web" && routeImages.length > 1 && (
				<View style={cards.recNavOverlay} pointerEvents="box-none">
					<Pressable
						style={cards.recNavZoneLeft}
						onPress={() => scrollToImageIndex(activeImageIndex - 1)}
					>
						{activeImageIndex > 0 && (
							<View style={cards.recNavButton}>
								<Ionicons name="chevron-back" size={22} color="#FFFFFF" />
							</View>
						)}
					</Pressable>
					<Pressable
						style={cards.recNavZoneRight}
						onPress={() => scrollToImageIndex(activeImageIndex + 1)}
					>
						{activeImageIndex < routeImages.length - 1 && (
							<View style={cards.recNavButton}>
								<Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
							</View>
						)}
					</Pressable>
				</View>
			)}

			<LinearGradient
				pointerEvents="none"
				colors={["transparent", "rgba(0,0,0,0.36)", "rgba(0,0,0,0.74)"]}
				style={styles.feedBottomGradient}
			/>
			{showActionBar && (
				<View style={styles.feedActionOverlay}>
					<ActionBar
						item={item}
						onCommentPress={onCommentPress}
						collectionName="routes"
						variant="overlay"
					/>
				</View>
			)}
		</View>
	);

	const renderContent = (feed = false) => {
		const difficultyLabel = getOptionLabel(ROUTE_DIFFICULTIES, item.difficulty);
		const transportLabel = getOptionLabel(TRANSPORT_MODES, item.transportModes?.[0]);
		const personalizationReason = getPersonalizationReasonLabel(item?.personalization?.reasonCodes?.[0]);
		const content = (
			<View style={[cards.recContent, feed && styles.feedContent]}>
				<View style={cards.recTitleRow}>
					<Text style={[cards.recTitle, feed && styles.feedTitle]} numberOfLines={1}>
						{item.title}
					</Text>
					{difficultyLabel ? (
						<View style={cards.recCategoryChip}>
							<Text style={cards.recCategoryText}>{difficultyLabel}</Text>
						</View>
					) : null}
				</View>

				<View style={styles.metaRow}>
					{item.dayCount ? (
						<View style={styles.metaPill}>
							<Ionicons name="calendar-outline" size={14} color="#1F2937" />
							<Text style={styles.metaText}>{item.dayCount} {text.days}</Text>
						</View>
					) : null}
					{item.distanceKm ? (
						<View style={styles.metaPill}>
							<Ionicons name="navigate-outline" size={14} color="#1F2937" />
							<Text style={styles.metaText}>{item.distanceKm} {text.km}</Text>
						</View>
					) : null}
					{transportLabel ? (
						<View style={styles.metaPill}>
							<Ionicons name="trail-sign-outline" size={14} color="#1F2937" />
							<Text style={styles.metaText}>{transportLabel}</Text>
						</View>
					) : null}
				</View>

				{places.length > 0 ? (
					<View style={styles.placesPreview}>
						<PlacesRoute places={places} />
					</View>
				) : null}

				{!!personalizationReason && (
					<View style={styles.locationRow}>
						<Ionicons name="sparkles-outline" size={14} color="#2EC4B6" />
						<Text style={cards.recLocationText}>{personalizationReason}</Text>
					</View>
				)}

				{places.length > 0 ? (
					<View style={styles.locationRow}>
						<Ionicons name="location-outline" size={14} color="#2EC4B6" />
						<Text style={cards.recLocationText}>
							{places.join(" • ")}
						</Text>
					</View>
				) : null}

				<Text style={[cards.recDescription, feed && styles.feedDescription]} numberOfLines={feed ? 2 : 3}>
					{item.description}
				</Text>

				<RenderTags tags={allTags} />
			</View>
		);

		if (feed) {
			return <Pressable onPress={onPress}>{content}</Pressable>;
		}

		return content;
	};

	if (isFeed) {
		return (
			<View style={styles.feedCard}>
				{renderFeedMedia()}
				{renderContent(true)}
			</View>
		);
	}

	return (
		<Pressable style={cards.recommendation} onPress={onPress}>
			<View style={cards.recHeader}>
				<View style={cards.recAuthorInfo}>
					<Avatar
						photoURL={userPhoto}
						photoMedia={author.photoMedia}
						displayName={displayUser}
					/>
					<View>
						<Text style={cards.recUsername}>{displayUser}</Text>
						{item.createdAt && (
							<Text style={cards.recDate}>{formatTimestamp(item.createdAt)}</Text>
						)}
					</View>
				</View>

				<View style={styles.headerActions}>
					<FavoriteButton
						type="routes"
						id={item.id}
						variant="light"
						snapshotData={snapshotData}
					/>
					{canManage && showActionMenu && (
						<ActionMenu
							onEdit={onEdit}
							onDelete={onDelete}
							title={text.menuTitle}
						/>
					)}
				</View>
			</View>

			{thumbnailUrl ? (
				<CachedImage
					source={{ uri: thumbnailUrl }}
					style={cards.recImage}
					contentFit="cover"
					priority="normal"
				/>
			) : null}

			{renderContent(false)}

			{showActionBar && (
				<ActionBar
					item={item}
					onCommentPress={onCommentPress}
					collectionName="routes"
				/>
			)}
		</Pressable>
	);
};

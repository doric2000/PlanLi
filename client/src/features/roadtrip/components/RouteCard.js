import React, { useMemo, useRef, useState } from "react";
import {
	FlatList,
	Image,
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
import { Avatar } from "../../../components/Avatar";
import PlacesRoute from "./PlacesRoute";
import { ActionMenu } from "../../../components/ActionMenu";
import ActionBar from "../../../components/ActionBar";
import FavoriteButton from "../../../components/FavoriteButton";
import { cards, tags as tagsStyle, routeCardStyles as styles } from "../../../styles";
import { auth } from "../../../config/firebase";
import { getUserTier } from "../../../utils/userTier";
import { useAdminClaim } from "../../../hooks/useAdminClaim";
import { formatTimestamp } from "../../../utils/formatTimestamp";

const text = {
	defaultUser: "\u05de\u05d8\u05d9\u05d9\u05dc PlanLi",
	menuTitle: "\u05e0\u05d9\u05d4\u05d5\u05dc \u05de\u05e1\u05dc\u05d5\u05dc",
	days: "\u05d9\u05de\u05d9\u05dd",
	km: "\u05e7\u05f4\u05de",
	noImage: "\u05de\u05e1\u05dc\u05d5\u05dc \u05d8\u05d9\u05d5\u05dc",
};

const asDisplayableImage = (uri) =>
	typeof uri === "string" &&
	(uri.startsWith("http") || uri.startsWith("https") || uri.startsWith("file:"));

const getRouteImages = (route) => {
	const images = [];
	if (Array.isArray(route?.images)) images.push(...route.images);
	if (route?.image) images.push(route.image);

	if (Array.isArray(route?.tripDaysData)) {
		route.tripDaysData.forEach((day) => {
			if (day?.image) images.push(day.image);
			if (Array.isArray(day?.stops)) {
				day.stops.forEach((stop) => {
					if (stop?.image) images.push(stop.image);
				});
			}
		});
	}

	return Array.from(new Set(images.filter(asDisplayableImage)));
};

const getAllTags = (route) => {
	const tags = [
		...(Array.isArray(route?.tags) ? route.tags : []),
		route?.difficultyTag,
		route?.travelStyleTag,
		...(Array.isArray(route?.roadTripTags) ? route.roadTripTags : []),
		...(Array.isArray(route?.experienceTags) ? route.experienceTags : []),
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
	const routeImages = useMemo(() => getRouteImages(item), [item]);
	const allTags = useMemo(() => getAllTags(item), [item]);
	const [carouselWidth, setCarouselWidth] = useState(null);
	const [activeImageIndex, setActiveImageIndex] = useState(0);
	const carouselRef = useRef(null);
	const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;
	const onViewableItemsChanged = useRef(({ viewableItems }) => {
		const first = viewableItems?.[0]?.index;
		if (typeof first === "number") setActiveImageIndex(first);
	}).current;

	const author = useUserData(item.userId);
	const displayUser = author.displayName || text.defaultUser;
	const userPhoto = author.photoURL;
	const thumbnailUrl = routeImages[0] || null;
	const descriptionPreview = item?.desc
		? item.desc.length > 100
			? `${item.desc.substring(0, 100)}...`
			: item.desc
		: "";
	const snapshotData = {
		name: item?.Title || item?.title || undefined,
		thumbnail_url: thumbnailUrl,
		sub_text: descriptionPreview,
		rating: item?.rating,
		days: item?.days,
		distance: item?.distance,
	};

	const tier = getUserTier(auth.currentUser);
	const { isAdmin } = useAdminClaim();
	const canManage = tier === "verified" && (isOwner || isAdmin);
	const places = Array.isArray(item?.places) ? item.places : [];

	const handleAuthorPress = () => {
		if (item.userId) navigation.navigate("UserProfile", { uid: item.userId });
	};

	const renderCarouselImage = (uri) => {
		const pageWidth = carouselWidth || windowWidth || 0;

		if (Platform.OS === "web") {
			return (
				<img
					src={uri}
					alt=""
					width={typeof pageWidth === "number" && pageWidth > 0 ? pageWidth : undefined}
					style={cards.recWebImage}
				/>
			);
		}

		return (
			<Image
				source={{ uri }}
				style={[cards.recCarouselImage, { width: pageWidth || "100%" }]}
				resizeMode="cover"
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
					<Avatar photoURL={userPhoto} displayName={displayUser} size={40} />
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
					keyExtractor={(uri, index) => `${item.id || "route"}:${index}:${uri}`}
					horizontal
					pagingEnabled
					showsHorizontalScrollIndicator={false}
					scrollEnabled={routeImages.length > 1}
					nestedScrollEnabled
					renderItem={({ item: uri }) => (
						<View style={[cards.recCarouselItem, { width: carouselWidth || windowWidth || "100%" }]}>
							{renderCarouselImage(uri)}
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
		const content = (
			<View style={[cards.recContent, feed && styles.feedContent]}>
				<View style={cards.recTitleRow}>
					<Text style={[cards.recTitle, feed && styles.feedTitle]} numberOfLines={1}>
						{item.Title}
					</Text>
					{item.difficultyTag ? (
						<View style={cards.recCategoryChip}>
							<Text style={cards.recCategoryText}>{item.difficultyTag}</Text>
						</View>
					) : null}
				</View>

				<View style={styles.metaRow}>
					{item.days ? (
						<View style={styles.metaPill}>
							<Ionicons name="calendar-outline" size={14} color="#1F2937" />
							<Text style={styles.metaText}>{item.days} {text.days}</Text>
						</View>
					) : null}
					{item.distance ? (
						<View style={styles.metaPill}>
							<Ionicons name="navigate-outline" size={14} color="#1F2937" />
							<Text style={styles.metaText}>{item.distance} {text.km}</Text>
						</View>
					) : null}
					{item.travelStyleTag ? (
						<View style={styles.metaPill}>
							<Ionicons name="trail-sign-outline" size={14} color="#1F2937" />
							<Text style={styles.metaText}>{item.travelStyleTag}</Text>
						</View>
					) : null}
				</View>

				{places.length > 0 ? (
					<View style={styles.placesPreview}>
						<PlacesRoute places={places} />
					</View>
				) : null}

				{places.length > 0 ? (
					<View style={styles.locationRow}>
						<Ionicons name="location-outline" size={14} color="#2EC4B6" />
						<Text style={cards.recLocationText}>
							{places.join(" • ")}
						</Text>
					</View>
				) : null}

				<Text style={[cards.recDescription, feed && styles.feedDescription]} numberOfLines={feed ? 2 : 3}>
					{item.desc}
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
					<Avatar photoURL={userPhoto} displayName={displayUser} />
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
				<Image source={{ uri: thumbnailUrl }} style={cards.recImage} resizeMode="cover" />
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

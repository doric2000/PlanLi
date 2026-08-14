import React, { useEffect, useMemo, useRef, useState } from "react";
import {
	Platform,
	Pressable,
	TouchableOpacity,
	View,
} from "react-native";
import AppText from "../../../components/AppText";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useUserData } from "../../../hooks/useUserData";
import { useBoundedImageWindow } from "../../../hooks/useBoundedImageWindow";
import { useStableCarouselLayout } from "../../../hooks/useStableCarouselLayout";
import { Avatar } from "../../../components/Avatar";
import CachedImage, { prefetchImage } from "../../../components/CachedImage";
import RtlPagedFlatList from "../../../components/RtlPagedFlatList";
import PlacesRoute from "./PlacesRoute";
import { ActionMenu } from "../../../components/ActionMenu";
import ActionBar from "../../../components/ActionBar";
import FavoriteButton from "../../../components/FavoriteButton";
import PreferenceContextLine from "../../../components/PreferenceContextLine";
import { cards, routeCardStyles as styles } from "../../../styles";
import { useAdminClaim } from "../../../hooks/useAdminClaim";
import { formatTimestamp } from "../../../utils/formatTimestamp";
import { getRouteImageUrls } from "../../../utils/mediaAssets";
import {
	getOptionLabel,
	ROUTE_DIFFICULTIES,
	TRANSPORT_MODES,
} from "../../../constants/travelTaxonomy";
import { getRouteDestinationPreviews } from "../utils/routeDestinationPreviews";
import { useAuthUser } from "../../../hooks/useAuthUser";
import { CAPABILITIES } from "../../../constants/authPolicy";

const text = {
	defaultUser: "\u05de\u05d8\u05d9\u05d9\u05dc PlanLi",
	menuTitle: "\u05e0\u05d9\u05d4\u05d5\u05dc \u05de\u05e1\u05dc\u05d5\u05dc",
	days: "\u05d9\u05de\u05d9\u05dd",
	km: "\u05e7\u05f4\u05de",
	noImage: "\u05de\u05e1\u05dc\u05d5\u05dc \u05d8\u05d9\u05d5\u05dc",
};

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
	const { isActive, requireCapability } = useAuthUser();
	const isFeed = variant === "feed";
	const {
		pageWidth,
		frameHeight,
		onLayout: onCarouselLayout,
	} = useStableCarouselLayout({ aspectRatio: 1.25 });
	const routeImages = useMemo(
		() => getRouteImageUrls(item, "feed"),
		[item]
	);
	const thumbnailUrl = useMemo(
		() => getRouteImageUrls(item, "thumb")[0] || null,
		[item]
	);
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
	const imageIdentity = `${item?.id || ""}:${routeImages.join("|")}`;

	useEffect(() => {
		setActiveImageIndex(0);
		carouselRef.current?.scrollToOffset?.({ offset: 0, animated: false });
	}, [imageIdentity]);

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
		days: item?.dayCount,
		distance: item?.distanceKm,
	};

	const { isAdmin } = useAdminClaim();
	const canManage = isActive && (isOwner || isAdmin);
	const guardedDelete = () => {
		if (!requireCapability(CAPABILITIES.ACTIVE)) return;
		onDelete?.();
	};
	const destinationPreviews = useMemo(() => getRouteDestinationPreviews(item, 4), [item]);

	const handleAuthorPress = () => {
		if (item.ownerId) navigation.navigate("UserProfile", { uid: item.ownerId });
	};

	const renderCarouselImage = (uri, index) => {
		if (index !== imageWindow.currentIndex) {
			return (
				<View
					style={[
						cards.recCarouselImage,
						{ width: pageWidth, height: frameHeight },
					]}
				/>
			);
		}

		return (
			<CachedImage
				source={{ uri }}
				style={[
					Platform.OS === "web" ? cards.recWebImage : cards.recCarouselImage,
					{ width: pageWidth, height: frameHeight },
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
						insideRing
					/>
				</View>
				<View style={styles.feedAuthorTextWrap}>
					<AppText style={[cards.recUsername, styles.feedUsername]} numberOfLines={1}>
						{displayUser}
					</AppText>
					{!!item.createdAt && (
						<AppText style={[cards.recDate, styles.feedMetaText]} numberOfLines={1}>
							{formatTimestamp(item.createdAt)}
						</AppText>
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
						onDelete={guardedDelete}
						title={text.menuTitle}
					/>
				) : null}
			</View>
		</View>
	);

	const renderFeedMedia = () => (
		<View
			style={[
				cards.recCarouselContainer,
				styles.feedCarouselContainer,
				{ aspectRatio: undefined, height: frameHeight },
			]}
			onLayout={onCarouselLayout}
		>
			{routeImages.length > 0 ? (
				<RtlPagedFlatList
					ref={carouselRef}
					data={routeImages}
					extraData={imageWindow.currentIndex}
					style={[cards.recCarouselList, { width: pageWidth, height: frameHeight }]}
					keyExtractor={(uri, index) => `${item.id || "route"}:${index}:${uri}`}
					scrollEnabled={routeImages.length > 1}
					nestedScrollEnabled
					initialNumToRender={1}
					maxToRenderPerBatch={1}
					windowSize={3}
					renderItem={({ item: imageUri, index }) => (
						<Pressable
							style={[cards.recCarouselItem, { width: pageWidth, height: frameHeight }]}
							onPress={onPress}
							accessibilityRole="button"
							accessibilityLabel={`פתיחת פרטי המסלול: ${item.title || text.noImage}`}
							testID={`route-image-${item.id}-${index}`}
						>
							{renderCarouselImage(imageUri, index)}
						</Pressable>
					)}
					onViewableItemsChanged={onViewableItemsChanged}
					viewabilityConfig={viewabilityConfig}
					getItemLayout={(_, index) => {
						return { length: pageWidth, offset: pageWidth * index, index };
					}}
				/>
			) : (
				<View style={styles.feedImagePlaceholder}>
					<Ionicons name="map-outline" size={54} color="rgba(255,255,255,0.62)" />
					<AppText style={styles.feedPlaceholderText}>{text.noImage}</AppText>
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
						onPress={() => scrollToImageIndex(activeImageIndex + 1)}
					>
						{activeImageIndex < routeImages.length - 1 && (
							<View style={cards.recNavButton}>
								<Ionicons name="chevron-back" size={22} color="#FFFFFF" />
							</View>
						)}
					</Pressable>
					<Pressable
						style={cards.recNavZoneRight}
						onPress={() => scrollToImageIndex(activeImageIndex - 1)}
					>
						{activeImageIndex > 0 && (
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
		const personalizationReasonCode = item?.personalization?.reasonCodes?.[0];
		const content = (
			<View style={[cards.recContent, feed && styles.feedContent]}>
				<View style={cards.recTitleRow}>
					<AppText style={[cards.recTitle, feed && styles.feedTitle]} numberOfLines={1}>
						{item.title}
					</AppText>
					{difficultyLabel ? (
						<View style={cards.recCategoryChip}>
							<AppText style={cards.recCategoryText}>{difficultyLabel}</AppText>
						</View>
					) : null}
				</View>

				<View style={styles.metaRow}>
					{item.dayCount ? (
						<View style={styles.metaPill}>
							<Ionicons name="calendar-outline" size={14} color="#1F2937" />
							<AppText style={styles.metaText}>{item.dayCount} {text.days}</AppText>
						</View>
					) : null}
					{item.distanceKm ? (
						<View style={styles.metaPill}>
							<Ionicons name="navigate-outline" size={14} color="#1F2937" />
							<AppText style={styles.metaText}>{item.distanceKm} {text.km}</AppText>
						</View>
					) : null}
					{transportLabel ? (
						<View style={styles.metaPill}>
							<Ionicons name="trail-sign-outline" size={14} color="#1F2937" />
							<AppText style={styles.metaText}>{transportLabel}</AppText>
						</View>
					) : null}
				</View>

				{destinationPreviews.length > 0 ? (
					<View style={styles.placesPreview}>
						<PlacesRoute places={destinationPreviews} compact maximum={3} />
					</View>
				) : null}

				<PreferenceContextLine
					reasonCode={personalizationReasonCode}
					style={styles.locationRow}
					textStyle={cards.recLocationText}
				/>

				<AppText style={[cards.recDescription, feed && styles.feedDescription]} numberOfLines={feed ? 2 : 3}>
					{item.description}
				</AppText>

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
						<AppText style={cards.recUsername}>{displayUser}</AppText>
						{item.createdAt && (
							<AppText style={cards.recDate}>{formatTimestamp(item.createdAt)}</AppText>
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
							onDelete={guardedDelete}
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

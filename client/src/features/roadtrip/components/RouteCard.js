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
	getBudgetLabel,
	ROUTE_DIFFICULTIES,
	TRANSPORT_MODES,
} from "../../../constants/travelTaxonomy";
import { getRouteDestinationPreviews } from "../utils/routeDestinationPreviews";
import { useAuthUser } from "../../../hooks/useAuthUser";
import { CAPABILITIES } from "../../../constants/authPolicy";
import { usePersonalizationFeedback } from "../../profile/context/PersonalizationFeedbackContext";

const text = {
	defaultUser: "\u05de\u05d8\u05d9\u05d9\u05dc PlanLi",
	menuTitle: "\u05e0\u05d9\u05d4\u05d5\u05dc \u05de\u05e1\u05dc\u05d5\u05dc",
	days: "\u05d9\u05de\u05d9\u05dd",
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
	topContentInset = 0,
}) => {
	const navigation = useNavigation();
	const { isActive, ensureCapability } = useAuthUser();
	const personalizationTarget = { type: 'route', id: item?.id };
	const { isHidden } = usePersonalizationFeedback();
	const isFeed = variant === "feed";
	const feedTopInset = isFeed ? Math.max(0, Number(topContentInset) || 0) : 0;
	const {
		pageWidth,
		frameHeight,
		onLayout: onCarouselLayout,
	} = useStableCarouselLayout({ aspectRatio: 1.25, extraHeight: feedTopInset });
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
	const guardedDelete = async () => {
		if (!await ensureCapability(CAPABILITIES.ACTIVE)) return;
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
		<View style={[styles.feedHeaderOverlay, feedTopInset > 0 && { top: 12 + feedTopInset }]}>
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
			testID="route-media"
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
				style={[styles.feedTopGradient, feedTopInset > 0 && { height: 118 + feedTopInset }]}
			/>
			{renderOverlayHeader()}

			{routeImages.length > 1 && (
				<View style={cards.recDotsContainer} pointerEvents="none">
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

		</View>
	);

	const renderContent = (feed = false) => {
		const difficultyLabel = getOptionLabel(ROUTE_DIFFICULTIES, item.difficulty);
		const transportLabel = getOptionLabel(TRANSPORT_MODES, item.transportModes?.[0]);
		const budgetLabel = getBudgetLabel(item?.facets?.budgetLevel || item?.attributes?.budgetLevel || '');
		const personalizationReasonCode = item?.personalization?.reasonCodes?.[0];
		const content = (
			<View testID="route-content" style={[cards.recContent, feed && styles.feedContent]}>
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
					{budgetLabel ? (
						<View style={styles.metaPill}>
							<Ionicons name="wallet-outline" size={14} color="#1F2937" />
							<AppText style={styles.metaText}>{budgetLabel}</AppText>
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
					personalization={item?.personalization}
					target={personalizationTarget}
					item={item}
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

	if (isHidden(personalizationTarget)) return null;

	if (isFeed) {
		return (
			<View style={styles.feedCard}>
				{renderFeedMedia()}
				{showActionBar && (
					<ActionBar
						item={item}
						onCommentPress={onCommentPress}
						collectionName="routes"
					/>
				)}
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
					testID="route-media"
				/>
			) : null}

			{showActionBar && (
				<ActionBar
					item={item}
					onCommentPress={onCommentPress}
					collectionName="routes"
				/>
			)}

			{renderContent(false)}
		</Pressable>
	);
};

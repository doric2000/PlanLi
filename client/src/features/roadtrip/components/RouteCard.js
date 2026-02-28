import React, { useState } from "react";
import { useUserData } from "../../../hooks/useUserData";
import {
	View,
	Text,
	ScrollView,
	StyleSheet,
	Image,
	Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "../../../components/Avatar";
import PlacesRoute from "./PlacesRoute";
import { ActionMenu } from "../../../components/ActionMenu";
import ActionBar from "../../../components/ActionBar";
import FavoriteButton from "../../../components/FavoriteButton";
import { cards, typography, tags as tagsStyle, colors } from "../../../styles";
import { auth } from "../../../config/firebase";
import { getUserTier } from "../../../utils/userTier";
import { useAdminClaim } from "../../../hooks/useAdminClaim";
import { formatTimestamp } from "../../../utils/formatTimestamp";

/**
 * Component to display tags with a limit on visible items.
 * @param {Object} props
 * @param {string[]} props.tags - Array of tags to display.
 */
const RenderTags = ({ tags }) => {
	const MAX_VISIBLE = 3;
	const [showAll, setShowAll] = useState(false);

	const visibleTags = showAll ? tags : tags.slice(0, MAX_VISIBLE);
	const hasMore = tags.length > MAX_VISIBLE;

	return (
		<View style={tagsStyle.wrapper}>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={tagsStyle.container}
			>
				{visibleTags.map((tag, idx) => (
					<View key={idx} style={tagsStyle.item}>
						<Text style={tagsStyle.text}>#{tag}</Text>
					</View>
				))}
				{!showAll && hasMore && (
					<Text
						style={{
							...tagsStyle.text,
							color: colors.info,
							alignSelf: "center",
							marginLeft: 8,
						}}
					>
						+{tags.length - MAX_VISIBLE}
					</Text>
				)}
			</ScrollView>
		</View>
	);
};

/**
 * Card component to display route summary.
 *
 * @param {Object} props
 * @param {Object} props.item - Route data.
 * @param {Function} props.onPress - Callback for card press.
 * @param {boolean} props.isOwner - Whether the current user is the owner.
 * @param {Function} props.onEdit - Callback for edit action.
 * @param {Function} props.onDelete - Callback for delete action.
 * @param {Function} [props.onCommentPress] - Callback when comment button is pressed.
 * @param {boolean} [props.showActionBar=true] - Whether to show the ActionBar.
 * @param {boolean} [props.showActionMenu=true] - Whether to show the ActionMenu.
 */
export const RouteCard = ({
	item,
	onPress,
	isOwner,
	onEdit,
	onDelete,
	onCommentPress,
	showActionBar = true,
	showActionMenu = true,
}) => {
	// Always use useUserData for author info
	const author = useUserData(item.userId);
	const displayUser = author.displayName || "Anonymous";
	const userPhoto = author.photoURL;
    const descriptionPreview = item?.desc
        ? item.desc.length > 100
            ? `${item.desc.substring(0, 100)}...`
            : item.desc
        : "";
    const thumbnailUrl = Array.isArray(item?.tripDaysData)
        ? item.tripDaysData.find((day) => day?.image)?.image || null
        : null;
    const isDisplayableImage =
        typeof thumbnailUrl === "string" &&
        (thumbnailUrl.startsWith("http") ||
            thumbnailUrl.startsWith("https") ||
            thumbnailUrl.startsWith("file:"));
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
	const canManage = tier === 'verified' && (isOwner || isAdmin);

	return (
		<Pressable style={cards.recommendation} onPress={onPress}>
			{/* Header */}
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
						type='routes'
						id={item.id}
						variant='light'
						snapshotData={snapshotData}
					/>
					{canManage && showActionMenu && (
						<ActionMenu
							onEdit={onEdit}
							onDelete={onDelete}
							title='Manage Route'
						/>
					)}
				</View>
			</View>

			{/* Media */}
			{isDisplayableImage ? (
				<Image source={{ uri: thumbnailUrl }} style={cards.recImage} resizeMode="cover" />
			) : null}

			{/* Content */}
			<View style={cards.recContent}>
				<View style={cards.recTitleRow}>
					<Text style={cards.recTitle} numberOfLines={1}>
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
							<Text style={styles.metaText}>{item.days} ימים</Text>
						</View>
					) : null}
					{item.distance ? (
						<View style={styles.metaPill}>
							<Ionicons name="navigate-outline" size={14} color="#1F2937" />
							<Text style={styles.metaText}>{item.distance} ק\"מ</Text>
						</View>
					) : null}
					{item.travelStyleTag ? (
						<View style={styles.metaPill}>
							<Ionicons name="trail-sign-outline" size={14} color="#1F2937" />
							<Text style={styles.metaText}>{item.travelStyleTag}</Text>
						</View>
					) : null}
				</View>

				{Array.isArray(item.places) && item.places.length > 0 ? (
					<View style={{ marginBottom: 6 }}>
						<PlacesRoute places={item.places} />
					</View>
				) : null}

				{Array.isArray(item.places) && item.places.length > 0 ? (
					<View style={styles.locationRow}>
						<Ionicons name="location-outline" size={14} color="#2EC4B6" />
						<Text style={cards.recLocationText}>
							{item.places.join(" • ")}
						</Text>
					</View>
				) : null}

				<Text style={cards.recDescription} numberOfLines={3}>
					{item.desc}
				</Text>

				{item.tags && item.tags.length > 0 && (
					<RenderTags tags={item.tags} />
				)}
			</View>

			{showActionBar && (
				<ActionBar
					item={item}
					onCommentPress={onCommentPress}
					collectionName='routes'
				/>
			)}
		</Pressable>
	);
};

const styles = StyleSheet.create({
	headerActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 8,
		marginBottom: 8,
	},
	metaPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		backgroundColor: "#F3F4F6",
		borderRadius: 12,
		paddingHorizontal: 10,
		paddingVertical: 6,
	},
	metaText: {
		...typography.caption,
		color: "#111827",
	},
	locationRow: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 6,
	},
});

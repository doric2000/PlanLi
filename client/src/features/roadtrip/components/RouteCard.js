import React, { useState } from "react";
import { useUserData } from "../../../hooks/useUserData";
import {
	View,
	Text,
	TouchableOpacity,
	ScrollView,
	StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "../../../components/Avatar";
import PlacesRoute from "./PlacesRoute";
import { ActionMenu } from "../../../components/ActionMenu";
import ActionBar from "../../../components/ActionBar";
import FavoriteButton from "../../../components/FavoriteButton";
import { cards, typography, tags as tagsStyle, colors } from "../../../styles";

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
    const snapshotData = {
        name: item?.Title || item?.title || undefined,
        thumbnail_url: thumbnailUrl,
        sub_text: descriptionPreview,
        rating: item?.rating,
        days: item?.days,
        distance: item?.distance,
    };

	return (
		<TouchableOpacity onPress={onPress} activeOpacity={0.7}>
			<View style={cards.route}>
				<View style={styles.headerRow}>
					<Text style={[typography.h3, styles.title]}>
						{item.Title}
					</Text>
					<View style={styles.headerActions}>
						<FavoriteButton
							type='routes'
							id={item.id}
							variant='light'
							snapshotData={snapshotData}
						/>
						{isOwner && showActionMenu && (
							<ActionMenu
								onEdit={onEdit}
								onDelete={onDelete}
								title='Manage Route'
							/>
						)}
					</View>
				</View>
				<View style={styles.userContainer}>
					<Avatar
						photoURL={userPhoto}
						displayName={displayUser}
						size={24}
					/>
					<Text style={typography.meta}>by {displayUser}</Text>
				</View>
				<Text style={typography.body}>{item.desc}</Text>
				<Text style={{ ...typography.bodySmall, marginBottom: 12 }}>
					<Ionicons
						name='calendar-outline'
						size={16}
						color='#64748B'
					/>{" "}
					{item.days} days |{" "}
					<Ionicons
						name='navigate-outline'
						size={16}
						color='#64748B'
					/>{" "}
					{item.distance} km |
				</Text>

				<PlacesRoute places={item.places} />

				{item.tags && item.tags.length > 0 && (
					<RenderTags tags={item.tags} />
				)}

				{showActionBar && (
					<ActionBar
						item={item}
						onCommentPress={onCommentPress}
						collectionName='routes'
					/>
				)}
			</View>
		</TouchableOpacity>
	);
};

const styles = StyleSheet.create({
	headerRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
	},
	headerActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	title: {
		flex: 1,
		marginRight: 8,
	},
	userContainer: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 5,
		gap: 8,
	},
});

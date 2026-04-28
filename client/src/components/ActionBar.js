import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLikes } from "../features/community/hooks/useLikes";
import { useCommentsCount } from "../features/community/hooks/useCommentsCount";
import { cards, colors, actionBarStyles as styles } from "../styles";
import LikesModal from './LikesModal';
import { useState } from 'react';

/**
 * ActionBar - Reusable footer component for cards with like, comment, and share actions.
 *
 * Handles like toggling, displays like count with a modal showing who liked,
 * comment count, and share button.
 *
 * @param {Object} props
 * @param {Object} props.item - The data object (must have id, likes, likedBy fields)
 * @param {Function} props.onCommentPress - Callback when comment button is pressed, receives item.id
 * @param {string} [props.collectionName='recommendations'] - Firestore collection name for likes/comments
 *
 * @example
 * // In RecommendationCard:
 * <ActionBar
 *   item={item}
 *   onCommentPress={onCommentPress}
 *   collectionName="recommendations"
 * />
 *
 * @example
 * // In RouteCard:
 * <ActionBar
 *   item={route}
 *   onCommentPress={handleOpenComments}
 *   collectionName="routes"
 * />
 */
const ActionBar = ({ item, onCommentPress, collectionName = 'recommendations', variant = 'default' }) => {
	const [showLikesModal, setShowLikesModal] = useState(false);
	const isOverlay = variant === 'overlay';

	const { isLiked, likeCount, likedByList, toggleLike } = useLikes(
		collectionName,
		item.id,
		item.likes,
		item.likedBy
	);

	const handleCommentPress = () => {
		if (onCommentPress) {
			onCommentPress(item.id);
		}
	};

	const commentsCount = useCommentsCount(collectionName, item.id);

	return (
		<View style={[cards.recFooter, isOverlay && styles.overlayFooter]}>
			<View style={[cards.recActionGroup, isOverlay && styles.overlayActionGroup]}>
				<TouchableOpacity
					style={[cards.recActionButton, isOverlay && styles.overlayActionButton]}
					onPress={toggleLike}
				>
					<Ionicons
						name={isLiked ? "heart" : "heart-outline"}
						size={isOverlay ? 26 : 24}
						color={isOverlay ? "#FFFFFF" : (isLiked ? colors.heart : colors.textSecondary)}
					/>
				</TouchableOpacity>

				<TouchableOpacity
					onPress={() => likeCount > 0 && setShowLikesModal(true)}
				>
					<Text
						style={[
							cards.recLikeCount,
							likeCount > 0 && cards.recLikeCountClickable,
							isOverlay && styles.overlayText,
						]}
					>
						{likeCount > 0 ? `${likeCount} לייקים` : ""}
					</Text>
				</TouchableOpacity>

				<TouchableOpacity
					style={[cards.recActionButton, isOverlay && styles.overlayActionButton]}
					onPress={handleCommentPress}
				>
					<Ionicons
						name='chatbubble-outline'
						size={isOverlay ? 25 : 22}
						color={isOverlay ? "#FFFFFF" : "#4B5563"}
					/>
					<Text style={[cards.recActionText, isOverlay && styles.overlayText]}>
						תגובות {commentsCount > 0 && `(${commentsCount})`}
					</Text>
				</TouchableOpacity>
			</View>

			{/* <TouchableOpacity>
				<Ionicons
					name='share-social-outline'
					size={22}
					color='#4B5563'
				/>
			</TouchableOpacity> */}

			<LikesModal
				visible={showLikesModal}
				onClose={() => setShowLikesModal(false)}
				likedByUserIds={likedByList}
			/>
		</View>
	);
};

export default ActionBar;

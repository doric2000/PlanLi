import { useLikes } from "../features/community/hooks/useLikes";
import { useCommentsCount } from "../features/community/hooks/useCommentsCount";
import { useState } from 'react';
import LikesModal from './LikesModal';
import { RecommendationActionBar } from './RecommendationActionBar';

/**
 * ActionBar - Stateful card wrapper around RecommendationActionBar.
 *
 * Handles like toggling, displays like count with a modal showing who liked,
 * and subscribes to the comment count. Detail screens provide sharing directly
 * to RecommendationActionBar because cards do not expose that action.
 *
 * @param {Object} props
 * @param {Object} props.item - Content data with an id and stats counters.
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
const ActionBar = ({ item, onCommentPress, collectionName = 'recommendations' }) => {
	const [showLikesModal, setShowLikesModal] = useState(false);

	const { isLiked, likeCount, toggleLike } = useLikes(
		collectionName,
		item.id,
		item.stats?.likeCount || 0
	);

	const handleCommentPress = () => {
		if (onCommentPress) {
			onCommentPress(item.id);
		}
	};

	const commentsCount = useCommentsCount(collectionName, item.id);
	const contentLabel = collectionName === 'routes'
		? 'המסלול'
		: collectionName === 'trips'
			? 'הטיול'
			: 'ההמלצה';

	return (
		<>
			<RecommendationActionBar
				isLiked={isLiked}
				likeCount={likeCount}
				commentsCount={commentsCount}
				onCommentPress={handleCommentPress}
				onLikePress={toggleLike}
				onLikesListPress={() => setShowLikesModal(true)}
				contentLabel={contentLabel}
				reportTarget={{
					type: collectionName === 'routes' ? 'route' : collectionName === 'trips' ? 'trip' : 'recommendation',
					id: item.id,
				}}
				ownerId={item.ownerId}
			/>

			<LikesModal
				visible={showLikesModal}
				onClose={() => setShowLikesModal(false)}
				collectionName={collectionName}
				itemId={item.id}
				likeCount={likeCount}
			/>
		</>
	);
};

export default ActionBar;

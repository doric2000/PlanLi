import { useLikes } from "../features/community/hooks/useLikes";
import { useCommentsCount } from "../features/community/hooks/useCommentsCount";
import { useState } from 'react';
import LikesModal from './LikesModal';
import { RecommendationActionBar } from './RecommendationActionBar';
import AddToTripModal from '../features/tripPlanner/components/AddToTripModal';
import { useAuthUser } from '../hooks/useAuthUser';
import { CAPABILITIES } from '../constants/authPolicy';
import { useContentShare } from '../hooks/useContentShare';

/**
 * ActionBar - Stateful card wrapper around RecommendationActionBar.
 *
 * Handles like toggling, displays like count with a modal showing who liked,
 * subscribes to the comment count, and shares the public content link using
 * the same handler as detail screens.
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
const ActionBar = ({ item, onCommentPress, collectionName = 'recommendations', compact = false, onBeforeProtectedAction }) => {
	const [showLikesModal, setShowLikesModal] = useState(false);
	const [showAddToTrip, setShowAddToTrip] = useState(false);
	const { ensureCapability } = useAuthUser();
	const shareKind = collectionName === 'routes' ? 'route' : collectionName === 'recommendations' ? 'recommendation' : null;
	const handleShare = useContentShare({ kind: shareKind, id: item.id, title: item.title, status: item.status });
	const handleAddToTrip = async () => {
		if (onBeforeProtectedAction?.() === false) return;
		if (await ensureCapability(CAPABILITIES.ACTIVE, { name: 'TripPlanner' })) setShowAddToTrip(true);
	};

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
				onLikePress={() => { if (onBeforeProtectedAction?.() !== false) toggleLike(); }}
				onLikesListPress={() => setShowLikesModal(true)}
				contentLabel={contentLabel}
				compact={compact}
				onSharePress={shareKind ? handleShare : undefined}
				onAddToTrip={collectionName === 'recommendations' ? handleAddToTrip : undefined}
			/>

			<LikesModal
				visible={showLikesModal}
				onClose={() => setShowLikesModal(false)}
				collectionName={collectionName}
				itemId={item.id}
				likeCount={likeCount}
			/>
			<AddToTripModal
				visible={showAddToTrip}
				recommendationId={item.id}
				recommendationPreview={item}
				onClose={() => setShowAddToTrip(false)}
			/>
		</>
	);
};

export default ActionBar;

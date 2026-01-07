import { useState } from "react";
import {
	doc,
	updateDoc,
	increment,
	arrayUnion,
	arrayRemove,
	getDoc,
} from "firebase/firestore";
import { db, auth } from "../../../config/firebase";
import { notifyLikeEvent } from "../../notifications/services/NotificationObserver";
import { PostType } from "../../notifications/models/NotificationModel";

/**
 * Custom hook to handle like functionality for posts.
 *
 * @param {string} collectionName - Firestore collection name.
 * @param {string} postId - ID of the post.
 * @param {string[]} initialLikedBy - Initial array of user IDs who liked the post.
 * @returns {Object} Object containing:
 * - liked: Boolean indicating if the current user liked the post.
 * - likesCount: Total count of likes.
 * - handleLike: Function to toggle like status.
 */
export const useLikes = (
	collectionName,
	itemId,
	initialLikes = 0,
	initialLikedBy = []
) => {
	const currentUserId = auth.currentUser?.uid;
	const [isLiked, setIsLiked] = useState(
		initialLikedBy?.includes(currentUserId) || false
	);
	const [likeCount, setLikeCount] = useState(initialLikes);
	const [likedByList, setLikedByList] = useState(initialLikedBy || []);

	const toggleLike = async () => {
		if (!currentUserId) return;

		const newIsLiked = !isLiked;
		const newLikeCount = newIsLiked ? likeCount + 1 : likeCount - 1;
		const newLikedByList = newIsLiked
			? [...likedByList, currentUserId]
			: likedByList.filter((id) => id !== currentUserId);

		// Optimistic update
		setIsLiked(newIsLiked);
		setLikeCount(newLikeCount);
		setLikedByList(newLikedByList);

		try {
			const docRef = doc(db, collectionName, itemId);

			if (newIsLiked) {
				await updateDoc(docRef, {
					likes: increment(1),
					likedBy: arrayUnion(currentUserId),
				});

				// Trigger notification after successful like
				try {
					// Fetch post data to get owner and title
					const postSnap = await getDoc(docRef);
					if (postSnap.exists()) {
						const postData = postSnap.data();
						const currentUserDoc = await getDoc(doc(db, 'users', currentUserId));
						const currentUserData = currentUserDoc.exists() ? currentUserDoc.data() : {};

						// Trigger notification observer
						await notifyLikeEvent({
							postId: itemId,
							postTitle: postData.name || postData.title || 'Untitled Post',
							postType: collectionName === 'routes' ? PostType.ROUTE : PostType.RECOMMENDATION,
							postOwnerId: postData.userId,
							actorId: currentUserId,
							actorName: currentUserData.displayName || 'Anonymous',
							actorAvatar: currentUserData.photoURL || null,
							currentLikeCount: newLikeCount,
						});
					}
				} catch (notificationError) {
					console.error('Error sending like notification:', notificationError);
					// Don't fail the like operation if notification fails
				}
			} else {
				await updateDoc(docRef, {
					likes: increment(-1),
					likedBy: arrayRemove(currentUserId),
				});
			}
		} catch (error) {
			console.error("Error updating like:", error);
			// Rollback on error
			setIsLiked(!newIsLiked);
			setLikeCount(likeCount);
			setLikedByList(likedByList);
		}
	};

	return { isLiked, likeCount, likedByList, toggleLike };
};

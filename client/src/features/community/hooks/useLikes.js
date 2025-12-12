import { useState } from "react";
import {
	doc,
	updateDoc,
	increment,
	arrayUnion,
	arrayRemove,
} from "firebase/firestore";
import { db, auth } from "../../../config/firebase";

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

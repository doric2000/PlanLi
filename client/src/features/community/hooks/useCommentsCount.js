import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../config/firebase";

/**
 * Custom hook to track the number of comments on a post.
 *
 * @param {string} collectionName - Firestore collection name.
 * @param {string} postId - ID of the post.
 * @returns {number} The current count of comments.
 */
export const useCommentsCount = (collectionName, postId) => {
	const [commentsCount, setCommentsCount] = useState(0);

	useEffect(() => {
		if (!postId || !collectionName) return;

		const commentsRef = collection(db, collectionName, postId, "comments");
		const unsubscribe = onSnapshot(commentsRef, (snapshot) => {
			setCommentsCount(snapshot.size);
		});

		return () => unsubscribe();
	}, [postId, collectionName]);

	return commentsCount;
};

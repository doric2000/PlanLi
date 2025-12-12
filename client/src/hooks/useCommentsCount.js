import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";

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

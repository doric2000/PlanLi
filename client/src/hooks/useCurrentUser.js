import { useState, useEffect } from "react";
import { auth, db } from "../config/firebase";
import { getDoc, doc, onSnapshot } from "firebase/firestore";

/**
 * Custom hook to get the current authenticated user and their profile data from Firestore.
 * @returns {Object} An object containing:
 * - user: The user object (merged auth and firestore data) or null.
 * - loading: Boolean indicating if the data is being fetched.
 * - error: Any error object encountered during fetch.
 */
export const useCurrentUser = () => {
	const [user, setUser] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		const currentUser = auth.currentUser;

		if (!currentUser) {
			setUser(null);
			setLoading(false);
			return;
		}

		// Set up real-time listener for user document
		const unsubscribe = onSnapshot(
			doc(db, "users", currentUser.uid),
			(docSnapshot) => {
				setLoading(false);
				if (docSnapshot.exists()) {
					const userData = docSnapshot.data();
					setUser({
						uid: currentUser.uid,
						email: currentUser.email,
						displayName: userData.displayName || currentUser.email,
						...userData,
					});
				} else {
					// Document doesn't exist, use auth data
					setUser({
						uid: currentUser.uid,
						email: currentUser.email,
						displayName: currentUser.email,
					});
				}
			},
			(err) => {
				console.error("Error listening to user changes:", err);
				setError(err);
				setLoading(false);
				// Fallback to auth user
				setUser({
					uid: currentUser.uid,
					email: currentUser.email,
					displayName: currentUser.email,
				});
			}
		);

		// Cleanup listener on unmount
		return () => unsubscribe();
	}, []);

	return { user, loading, error };
};

import { useState, useEffect } from "react";
import { auth, db } from "../../../config/firebase";
import { getDoc, doc } from "firebase/firestore";

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
		const fetchUser = async () => {
			try {
				setLoading(true);
				const currentUser = auth.currentUser;

				if (currentUser) {
					const userDoc = await getDoc(
						doc(db, "users", currentUser.uid)
					);

					if (userDoc.exists()) {
						const userData = userDoc.data();
						setUser({
							uid: currentUser.uid,
							email: currentUser.email,
							displayName:
								userData.displayName || currentUser.email,
							...userData,
						});
					} else {
						setUser({
							uid: currentUser.uid,
							email: currentUser.email,
							displayName: currentUser.email,
						});
					}
				} else {
					setUser(null);
				}
			} catch (err) {
				console.error("Error fetching user:", err);
				setError(err);

				// Fallback to auth user
				if (auth.currentUser) {
					setUser({
						uid: auth.currentUser.uid,
						email: auth.currentUser.email,
						displayName: auth.currentUser.email,
					});
				}
			} finally {
				setLoading(false);
			}
		};

		fetchUser();
	}, []);

	return { user, loading, error };
};

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../../../config/firebase";

/**
 * Custom hook to fetch user data for a specific user ID.
 * @param {string} userId - The ID of the user to fetch.
 * @returns {Object} An object containing the user data (displayName, photoURL).
 */
export const useUserData = (userId) => {
	const [userData, setUserData] = useState({
		displayName: "Traveler",
		photoURL: null,
		loading: true,
	});

	useEffect(() => {
		const fetchUser = async () => {
			if (!userId) {
				setUserData((prev) => ({ ...prev, loading: false }));
				return;
			}

			try {
				const userDocRef = doc(db, "users", userId);
				const userDoc = await getDoc(userDocRef);

				if (userDoc.exists()) {
					const data = userDoc.data();
					setUserData({
						displayName:
							data.displayName || data.fullName || "Traveler",
						photoURL: data.photoURL || null,
						loading: false,
					});
				} else if (userId === auth.currentUser?.uid) {
					setUserData({
						displayName: auth.currentUser.displayName || "Traveler",
						photoURL: auth.currentUser.photoURL || null,
						loading: false,
					});
				} else {
					setUserData((prev) => ({ ...prev, loading: false }));
				}
			} catch (error) {
				console.log("Error fetching user:", error);
				setUserData((prev) => ({ ...prev, loading: false }));
			}
		};

		fetchUser();
	}, [userId]);

	return userData;
};

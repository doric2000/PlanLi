import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../config/firebase";

export const USER_DATA_CACHE_TTL_MS = 10 * 60 * 1000;

const DEFAULT_USER_DATA = {
	displayName: "Traveler",
	photoURL: null,
	photoMedia: null,
};

const userDataCache = new Map();
const inFlightUserRequests = new Map();
const cacheSubscribers = new Map();
const cacheVersions = new Map();
let cacheEpoch = 0;

const normalizeUserData = (data, fallback = DEFAULT_USER_DATA) => ({
	displayName:
		data?.displayName ||
		data?.fullName ||
		fallback?.displayName ||
		DEFAULT_USER_DATA.displayName,
	photoURL:
		data && Object.prototype.hasOwnProperty.call(data, "photoURL")
			? data.photoURL || null
			: fallback?.photoURL || null,
	photoMedia:
		data && Object.prototype.hasOwnProperty.call(data, "photoMedia")
			? data.photoMedia || null
			: fallback?.photoMedia || null,
});

const readUserDataCache = (userId) => {
	const entry = userDataCache.get(userId);
	if (!entry) return null;

	if (entry.expiresAt <= Date.now()) {
		userDataCache.delete(userId);
		return null;
	}

	return entry.data;
};

const notifyCacheSubscribers = (userId, data) => {
	cacheSubscribers.get(userId)?.forEach((subscriber) => subscriber(data));
};

const writeUserDataCache = (userId, data, { notify = true } = {}) => {
	const normalized = normalizeUserData(data);
	userDataCache.set(userId, {
		data: normalized,
		expiresAt: Date.now() + USER_DATA_CACHE_TTL_MS,
	});
	cacheVersions.set(userId, (cacheVersions.get(userId) || 0) + 1);

	if (notify) {
		notifyCacheSubscribers(userId, normalized);
	}

	return normalized;
};

/**
 * Adds or updates an author in the shared in-memory cache.
 * Passing only photoURL preserves an already cached display name, and vice versa.
 */
export const primeUserDataCache = (userId, userData) => {
	if (!userId || !userData) return null;

	const cached = readUserDataCache(userId) || DEFAULT_USER_DATA;
	return writeUserDataCache(userId, normalizeUserData(userData, cached));
};

/**
 * Invalidates one cached author, or all cached authors when no ID is provided.
 */
export const clearUserDataCache = (userId) => {
	if (userId) {
		userDataCache.delete(userId);
		cacheVersions.set(userId, (cacheVersions.get(userId) || 0) + 1);
		inFlightUserRequests.delete(userId);
		return;
	}

	userDataCache.clear();
	cacheVersions.clear();
	inFlightUserRequests.clear();
	cacheEpoch += 1;
};

const seedCurrentAuthUser = (userId) => {
	const cached = readUserDataCache(userId);
	if (cached) return cached;

	const currentUser = auth.currentUser;
	if (!currentUser || currentUser.uid !== userId) return null;

	return writeUserDataCache(
		userId,
		{
			displayName: currentUser.displayName || "Traveler",
			photoURL: currentUser.photoURL || null,
		},
		{ notify: false }
	);
};

const subscribeToUserDataCache = (userId, subscriber) => {
	const subscribers = cacheSubscribers.get(userId) || new Set();
	subscribers.add(subscriber);
	cacheSubscribers.set(userId, subscribers);

	return () => {
		subscribers.delete(subscriber);
		if (subscribers.size === 0) {
			cacheSubscribers.delete(userId);
		}
	};
};

const fetchUserData = async (userId) => {
	let userDoc;

	try {
		userDoc = await getDoc(doc(db, "publicProfiles", userId));
	} catch (error) {
		// Rollout compatibility: the previous production rules expose author data
		// through users but do not yet define publicProfiles. Once the hardened
		// rules are deployed, this fallback is never reached.
		if (error?.code !== "permission-denied") {
			throw error;
		}

		userDoc = await getDoc(doc(db, "users", userId));
	}

	if (userDoc.exists()) {
		return normalizeUserData(userDoc.data());
	}

	const currentUser = auth.currentUser;
	if (currentUser?.uid === userId) {
		return normalizeUserData(currentUser);
	}

	return DEFAULT_USER_DATA;
};

const getOrFetchUserData = (userId) => {
	const cached = readUserDataCache(userId) || seedCurrentAuthUser(userId);
	if (cached) return Promise.resolve(cached);

	const pendingRequest = inFlightUserRequests.get(userId);
	if (pendingRequest) return pendingRequest;

	const startingCacheVersion = cacheVersions.get(userId) || 0;
	const startingCacheEpoch = cacheEpoch;
	const request = fetchUserData(userId)
		.then((data) => {
			const currentCacheVersion = cacheVersions.get(userId) || 0;
			const newerCachedData = readUserDataCache(userId);

			// Do not let an older network response overwrite a freshly primed photo/name.
			if (
				cacheEpoch !== startingCacheEpoch ||
				currentCacheVersion !== startingCacheVersion
			) {
				return newerCachedData || DEFAULT_USER_DATA;
			}

			return writeUserDataCache(userId, data);
		})
		.finally(() => {
			if (inFlightUserRequests.get(userId) === request) {
				inFlightUserRequests.delete(userId);
			}
		});

	inFlightUserRequests.set(userId, request);
	return request;
};

/**
 * Custom hook to fetch user data for a specific user ID.
 * Reuses cached author data for ten minutes and shares concurrent Firestore reads.
 *
 * @param {string} userId - The ID of the user to fetch.
 * @returns {Object} An object containing the user data (displayName, photoURL, loading).
 */
export const useUserData = (userId) => {
	const [userData, setUserData] = useState(() => {
		if (!userId) {
			return { ...DEFAULT_USER_DATA, loading: true };
		}

		const cached = readUserDataCache(userId) || seedCurrentAuthUser(userId);
		return cached
			? { ...cached, loading: false }
			: { ...DEFAULT_USER_DATA, loading: true };
	});

	useEffect(() => {
		let isActive = true;

		if (!userId) {
			setUserData((prev) => ({ ...prev, loading: false }));
			return undefined;
		}

		const unsubscribe = subscribeToUserDataCache(userId, (nextUserData) => {
			if (isActive) {
				setUserData({ ...nextUserData, loading: false });
			}
		});

		const cached = readUserDataCache(userId) || seedCurrentAuthUser(userId);
		if (cached) {
			setUserData({ ...cached, loading: false });
			return () => {
				isActive = false;
				unsubscribe();
			};
		}

		setUserData({ ...DEFAULT_USER_DATA, loading: true });

		getOrFetchUserData(userId)
			.then((nextUserData) => {
				if (isActive) {
					setUserData({ ...nextUserData, loading: false });
				}
			})
			.catch((error) => {
				console.log("Error fetching user:", error);
				if (isActive) {
					setUserData((prev) => ({ ...prev, loading: false }));
				}
			});

		return () => {
			isActive = false;
			unsubscribe();
		};
	}, [userId]);

	return userData;
};

import { useState, useCallback } from 'react';

/**
 * Custom hook to handle pull-to-refresh logic.
 *
 * @param {Function} fetchAction - The async function to execute when refreshing.
 * @returns {Object} An object containing:
 * - isRefreshing: Boolean indicating if the refresh is in progress.
 * - onRefresh: Callback function to trigger the refresh.
 */
export const useRefresh = (fetchAction) => {
    const [isRefreshing, setIsRefreshing] = useState(false);

    const onRefresh = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await fetchAction();
        } catch (error) {
            console.error("Refresh failed:", error);
        } finally {
            setIsRefreshing(false);
        }
    }, [fetchAction]);

    return { isRefreshing, onRefresh };
};

import { useState, useCallback } from 'react';

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
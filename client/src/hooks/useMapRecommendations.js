import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMapRecommendations } from '../services/MapRecommendationsService';
import { useAuthUser } from './useAuthUser';

export function useMapRecommendations({ enabled, request = {} }) {
  const { user } = useAuthUser();
  const principal = user?.uid || 'guest';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [zoomInRequired, setZoomInRequired] = useState(false);
  const viewportRef = useRef(null);
  const lastRequestKeyRef = useRef(null);
  const serialRef = useRef(0);
  const requestKey = useMemo(() => JSON.stringify(request || {}), [request]);
  const requestRef = useRef(request);
  requestRef.current = request;
  const activeRequestKey = `${principal}:${requestKey}`;

  useEffect(() => {
    serialRef.current += 1;
    lastRequestKeyRef.current = null;
    setItems([]);
    setLoading(enabled);
    setError(null);
    setTruncated(false);
    setZoomInRequired(false);
  }, [principal]);

  const fetchViewport = useCallback(async (viewport, {
    forceRefresh = false,
    showLoader = true,
  } = {}) => {
    if (!enabled || !viewport) return null;
    viewportRef.current = viewport;
    lastRequestKeyRef.current = activeRequestKey;
    const serial = serialRef.current + 1;
    serialRef.current = serial;
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const response = await getMapRecommendations({
        ...requestRef.current,
        viewport,
      }, { forceRefresh });
      if (serialRef.current !== serial) return null;
      setItems(Array.isArray(response?.items) ? response.items : []);
      setTruncated(Boolean(response?.truncated));
      setZoomInRequired(Boolean(response?.zoomInRequired));
      return response;
    } catch (caught) {
      if (serialRef.current !== serial) return null;
      setError(caught);
      // Keep the last successful viewport visible. Clearing it here mutates the
      // entire map during a transient network failure and leaves the user with
      // no spatial context for retrying.
      return null;
    } finally {
      if (serialRef.current === serial) setLoading(false);
    }
  }, [activeRequestKey, enabled, requestKey]);

  useEffect(() => {
    if (!enabled) {
      serialRef.current += 1;
      setLoading(false);
      setError(null);
      return;
    }
    if (
      viewportRef.current &&
      lastRequestKeyRef.current !== activeRequestKey
    ) {
      fetchViewport(viewportRef.current, { showLoader: false });
    }
  }, [activeRequestKey, enabled, fetchViewport, requestKey]);

  return {
    items,
    loading,
    error,
    truncated,
    zoomInRequired,
    searchViewport: fetchViewport,
  };
}

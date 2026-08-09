import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMapRecommendations } from '../services/MapRecommendationsService';

export function useMapRecommendations({ enabled, request = {} }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [zoomInRequired, setZoomInRequired] = useState(false);
  const viewportRef = useRef(null);
  const serialRef = useRef(0);
  const requestKey = useMemo(() => JSON.stringify(request || {}), [request]);
  const requestRef = useRef(request);
  requestRef.current = request;

  const fetchViewport = useCallback(async (viewport, { showLoader = true } = {}) => {
    if (!enabled || !viewport) return null;
    viewportRef.current = viewport;
    const serial = serialRef.current + 1;
    serialRef.current = serial;
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const response = await getMapRecommendations({
        ...requestRef.current,
        viewport,
      });
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
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      serialRef.current += 1;
      setLoading(false);
      setItems([]);
      setError(null);
      setTruncated(false);
      setZoomInRequired(false);
      return;
    }
    if (viewportRef.current) fetchViewport(viewportRef.current, { showLoader: false });
  }, [enabled, fetchViewport, requestKey]);

  return {
    items,
    loading,
    error,
    truncated,
    zoomInRequired,
    searchViewport: fetchViewport,
  };
}

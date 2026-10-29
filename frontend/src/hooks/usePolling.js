import { useState, useEffect, useCallback, useRef } from 'react';

export function usePolling(fetchFn, intervalMs = 2000, enabled = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const isFetchingRef = useRef(false);
  const fetchFnRef = useRef(fetchFn);

  // Keep latest function reference without triggering re-render loops
  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  const fetchData = useCallback(async () => {
    // Prevent concurrent overlapping requests
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const result = await fetchFnRef.current();
      setData(result.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    fetchData();
    const interval = setInterval(fetchData, intervalMs);

    return () => {
      clearInterval(interval);
    };
  }, [fetchData, intervalMs, enabled]);

  return { data, error, loading, refetch: fetchData };
}

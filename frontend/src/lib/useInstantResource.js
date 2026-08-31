import { useCallback, useEffect, useState } from 'react';
import { pageCache } from '@/lib/pageCache';

export function useInstantResource(cacheKey, fetchFast, {
  fetchFull = fetchFast,
  deps = [],
  initialData = null,
  onError,
} = {}) {
  const [data, setData] = useState(() => pageCache.get(cacheKey) ?? initialData);
  const [loading, setLoading] = useState(() => !pageCache.get(cacheKey));
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async ({ forceFast = false } = {}) => {
    const cached = pageCache.get(cacheKey);
    if (cached && !forceFast) {
      setData(cached);
      setLoading(false);
      setRefreshing(true);
      try {
        const full = await fetchFull();
        pageCache.set(cacheKey, full);
        setData(full);
      } catch (error) {
        onError?.(error);
      } finally {
        setRefreshing(false);
      }
      return;
    }

    setLoading(true);
    setRefreshing(false);
    try {
      const fast = await fetchFast();
      pageCache.set(cacheKey, fast);
      setData(fast);
      setLoading(false);

      if (fetchFull !== fetchFast) {
        setRefreshing(true);
        try {
          const full = await fetchFull();
          pageCache.set(cacheKey, full);
          setData(full);
        } catch (error) {
          onError?.(error);
        } finally {
          setRefreshing(false);
        }
      }
    } catch (error) {
      setLoading(false);
      onError?.(error);
    }
  }, [cacheKey, fetchFast, fetchFull, onError]);

  useEffect(() => {
    let cancelled = false;
    const cached = pageCache.get(cacheKey);
    if (cached) {
      setData(cached);
      setLoading(false);
    }

    (async () => {
      if (cached) setRefreshing(true);
      else setLoading(true);
      try {
        const first = cached ? await fetchFull() : await fetchFast();
        if (cancelled) return;
        pageCache.set(cacheKey, first);
        setData(first);
        setLoading(false);

        if (!cached && fetchFull !== fetchFast) {
          setRefreshing(true);
          const full = await fetchFull();
          if (cancelled) return;
          pageCache.set(cacheKey, full);
          setData(full);
        }
      } catch (error) {
        if (!cancelled) {
          setLoading(false);
          onError?.(error);
        }
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, ...deps]);

  return { data, setData, loading, refreshing, reload: load };
}

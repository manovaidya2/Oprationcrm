import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useLazyList — fetch page 1 fast (blocks UI briefly), then keep fetching
 * subsequent pages ONE AT A TIME in the background and append them,
 * so the server never receives a burst of parallel requests and the
 * page is usable the moment page 1 arrives.
 *
 * @param {(page:number, limit:number) => Promise<{items:any[], total:number, pages:number}>} fetchPage
 *        Must return an object shaped like the app's existing pagination convention:
 *        { <anyKeyContainingArray>: [...], total, pages } — pass a small adapter
 *        if your endpoint's array key differs (see itemsKey below).
 * @param {object} opts
 * @param {number} [opts.limit=25]
 * @param {any[]}  [opts.deps=[]]      — when these change, restart from page 1
 * @param {string} [opts.itemsKey]     — key in the response holding the array (auto-detected if omitted)
 */
export function useLazyList(fetchPage, { limit = 25, deps = [] } = {}) {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [bgLoading, setBgLoading] = useState(false);
  const [total, setTotal]       = useState(0);
  const [error, setError]       = useState(null);
  const cancelledRef = useRef(false);

  const extractArray = (res) => {
    if (Array.isArray(res)) return res;
    if (!res) return [];
    const arrKey = Object.keys(res).find(k => Array.isArray(res[k]));
    return arrKey ? res[arrKey] : [];
  };

  const run = useCallback(async () => {
    cancelledRef.current = false;
    setLoading(true);
    setError(null);
    try {
      const first = await fetchPage(1, limit);
      if (cancelledRef.current) return;
      const firstItems = extractArray(first);
      setItems(firstItems);
      setTotal(first?.total ?? firstItems.length);
      setLoading(false);

      const pages = first?.pages ?? 1;
      if (pages > 1) {
        setBgLoading(true);
        for (let p = 2; p <= pages; p++) {
          if (cancelledRef.current) break;
          try {
            const next = await fetchPage(p, limit);
            if (cancelledRef.current) break;
            setItems(prev => [...prev, ...extractArray(next)]);
          } catch {
            break; // stop background fetching quietly on error; what's loaded so far stays visible
          }
        }
        if (!cancelledRef.current) setBgLoading(false);
      }
    } catch (e) {
      if (!cancelledRef.current) { setError(e); setLoading(false); }
    }
  }, [fetchPage, limit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    run();
    return () => { cancelledRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { items, setItems, loading, bgLoading, total, error, reload: run };
}
import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * usePagedFetch — click-through pagination (page 1, 2, 3 with Prev/Next/jump)
 * matching the app's existing {items, total, page, pages} convention.
 *
 * Behavior:
 * - Page 1 loads immediately (fast, blocking spinner only for this first fetch).
 * - Every page ever fetched is cached in-memory for this hook instance's
 *   lifetime — clicking back to a page you've already seen (or already
 *   silently prefetched) is instant, never refetches.
 * - Once page 1 arrives, the REST of this tab's pages are fetched
 *   automatically in the background, ONE AT A TIME (not in parallel), and
 *   quietly cached — so within a few seconds the whole tab is preloaded and
 *   clicking any page number shows data with no spinner at all.
 * - Background prefetching only ever updates the CACHE; it only updates the
 *   visible items/total/pages if the user happens to already be sitting on
 *   the page that just finished prefetching.
 * - Switching tabs (enabled=false) does not cancel a tab's own prefetch
 *   already in flight, but a tab that has never been enabled never starts one.
 *
 * @param {(page:number, limit:number) => Promise<any>} fetchFn
 *        Must return { <arrayKey>: [...], total, pages } (array key auto-detected).
 * @param {object} opts
 * @param {number}  [opts.limit=20]
 * @param {boolean} [opts.enabled=true]
 * @param {any[]}   [opts.deps=[]]  — changing these clears the cache, cancels any in-flight
 *                                    background prefetch, and restarts from page 1.
 */
export function usePagedFetch(fetchFn, { limit = 20, enabled = true, deps = [] } = {}) {
  const [page, setPage]         = useState(1);
  const [items, setItems]       = useState([]);
  const [total, setTotal]       = useState(0);
  const [pages, setPages]       = useState(1);
  const [loading, setLoading]   = useState(true);
  const [bgLoading, setBgLoading] = useState(false);

  const cacheRef   = useRef(new Map());   // page number -> { items, total, pages }
  const pageRef    = useRef(1);           // always mirrors current `page`, readable inside background loop
  const genRef     = useRef(0);           // bumped whenever deps change, cancels stale background loops

  useEffect(() => { pageRef.current = page; }, [page]);

  const extractArray = (res) => {
    if (Array.isArray(res)) return res;
    if (!res) return [];
    const arrKey = Object.keys(res).find(k => Array.isArray(res[k]));
    return arrKey ? res[arrKey] : [];
  };

  const fetchOnePage = useCallback(async (targetPage) => {
    const res = await fetchFn(targetPage, limit);
    return { items: extractArray(res), total: res?.total ?? 0, pages: res?.pages ?? 1 };
  }, [fetchFn, limit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filters changed → old cached pages belong to a different result set
  useEffect(() => {
    cacheRef.current.clear();
    genRef.current += 1;
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const loadPage = useCallback(async (targetPage, { force = false } = {}) => {
    if (!enabled) return;
    const cached = cacheRef.current.get(targetPage);
    if (cached && !force) {
      setItems(cached.items); setTotal(cached.total); setPages(cached.pages);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchOnePage(targetPage);
      cacheRef.current.set(targetPage, result);
      setItems(result.items); setTotal(result.total); setPages(result.pages);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, fetchOnePage]);

  // Background: after page 1 lands, silently prefetch every other page one at a time
  const prefetchRest = useCallback(async (totalPages, myGen) => {
    if (totalPages <= 1) return;
    setBgLoading(true);
    for (let p = 2; p <= totalPages; p++) {
      if (myGen !== genRef.current) break;          // deps changed mid-flight — abandon
      if (cacheRef.current.has(p)) continue;         // already cached (e.g. user clicked ahead)
      try {
        const result = await fetchOnePage(p);
        if (myGen !== genRef.current) break;
        cacheRef.current.set(p, result);
        if (pageRef.current === p) {                  // user is currently sitting on this page
          setItems(result.items); setTotal(result.total); setPages(result.pages);
          setLoading(false);
        }
      } catch { /* skip this page, keep going */ }
      await new Promise(r => setTimeout(r, 250));      // small gap between requests
    }
    if (myGen === genRef.current) setBgLoading(false);
  }, [fetchOnePage]);

  useEffect(() => {
    if (!enabled) return;
    const myGen = genRef.current;
    (async () => {
      await loadPage(page);
      // Only kick off the background sweep once, right after page 1's own load
      if (page === 1) {
        const cached = cacheRef.current.get(1);
        if (cached) prefetchRest(cached.pages, myGen);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, page, ...deps]);

  const reload = useCallback(() => loadPage(page, { force: true }), [loadPage, page]);

  return { items, setItems, total, page, setPage, pages, loading, bgLoading, reload };
}
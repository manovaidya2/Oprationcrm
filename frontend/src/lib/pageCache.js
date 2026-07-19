// Simple in-memory cache shared across the whole SPA session.
// Not persisted to disk/localStorage — resets on full page reload (F5),
// but survives navigating between routes/tabs within the app.
//
// Usage pattern (stale-while-revalidate):
//   const cached = pageCache.get('counselor-dashboard');
//   if (cached) { hydrateStateFrom(cached); setLoading(false); }
//   const fresh = await fetchEverything();
//   pageCache.set('counselor-dashboard', fresh);
//   hydrateStateFrom(fresh);

const store = new Map();

function get(key) {
  return store.has(key) ? store.get(key) : null;
}

function set(key, value) {
  store.set(key, value);
}

function clear(key) {
  if (key) store.delete(key);
  else store.clear();
}

export const pageCache = { get, set, clear };
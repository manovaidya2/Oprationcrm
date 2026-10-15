import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { deskApi } from '@/lib/api';

// ── Formatting ───────────────────────────────────────────────
export const EPS = 0.005;
export const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
export const fmt = n => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const toYmd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayYmd = () => toYmd(new Date());
export const monthStartYmd = () => { const d = new Date(); return toYmd(new Date(d.getFullYear(), d.getMonth(), 1)); };
export const dateInput = d => (d ? toYmd(new Date(d)) : '');
export const centerLabel = c => c?.name || c?.organisationName || '—';
export const statusText = s => String(s || '').replace(/_/g, ' ');

export const selectCls = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

// ── Data hooks ───────────────────────────────────────────────
let metaPromise = null;
export function useMeta() {
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    if (!metaPromise) metaPromise = deskApi.meta().catch(e => { metaPromise = null; throw e; });
    let cancelled = false;
    metaPromise.then(m => { if (!cancelled) setMeta(m); }).catch(e => toast.error(e.message));
    return () => { cancelled = true; };
  }, []);
  return meta;
}
export const resetMeta = () => { metaPromise = null; };

// Fetch whenever `key` changes; keeps the previous data on screen while the next arrives.
export function useDeskData(fetcher, key) {
  const [state, setState] = useState({ key: null, data: null });
  const [tick, setTick] = useState(0);
  const fullKey = JSON.stringify([key, tick]);
  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then(data => { if (!cancelled) setState({ key: fullKey, data }); })
      .catch(e => { if (!cancelled) { toast.error(e.message); setState(s => ({ ...s, key: fullKey })); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);
  return { data: state.data, loading: state.key !== fullKey, reload: () => setTick(t => t + 1) };
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export const TABLE_WRAP = 'overflow-x-auto rounded-xl border border-slate-300 bg-white shadow-sm';
export const TH = 'whitespace-nowrap border-b-2 border-r border-slate-300 bg-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600 last:border-r-0';
export const TD = 'border-r border-slate-200 px-4 py-3 align-middle last:border-r-0';
export const ROW = 'border-t border-slate-200 odd:bg-white even:bg-slate-50/70 hover:bg-indigo-50/50';
export const ROW_CLICK = `${ROW} cursor-pointer`;
export const SUMMARY = 'flex flex-wrap gap-x-10 gap-y-3 rounded-lg border border-slate-200 bg-slate-50 px-5 py-3';

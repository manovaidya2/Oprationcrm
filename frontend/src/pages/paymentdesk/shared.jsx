import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { deskApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { todayYmd, toYmd } from './helpers';

// ── Small components ─────────────────────────────────────────
export function Field({ label, children, className }) {
  return (
    <label className={cn('block space-y-1', className)}>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function Pill({ tone = 'bg-slate-100 text-slate-700 border-slate-200', children }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium', tone)}>{children}</span>;
}

export function Stat({ label, value, tone = 'text-slate-800', sub }) {
  return (
    <div className="min-w-[110px]">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn('text-base font-semibold tabular-nums', tone)}>{value}{sub && <span className="ml-1 text-[11px] font-normal text-slate-500">{sub}</span>}</div>
    </div>
  );
}

export function Spinner() {
  return <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
}

export function Pager({ page, pages, onPage }) {
  if (!pages || pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 text-sm">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <span>Page {page} of {pages}</span>
      <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
    </div>
  );
}

export function DownloadBtn({ path, params, label = 'Download CSV', size = 'sm' }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await deskApi.download(path, params); }
    catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };
  return (
    <Button size={size} variant="outline" onClick={go} disabled={busy}>
      {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}{label}
    </Button>
  );
}

// From / To dates with quick presets
export function RangeBar({ from, to, onChange }) {
  const preset = (kind) => {
    const now = new Date();
    if (kind === 'today') return onChange(todayYmd(), todayYmd());
    if (kind === 'month') return onChange(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)), todayYmd());
    if (kind === 'last') return onChange(toYmd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), toYmd(new Date(now.getFullYear(), now.getMonth(), 0)));
    if (kind === '30') { const d = new Date(now); d.setDate(d.getDate() - 29); return onChange(toYmd(d), todayYmd()); }
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="From"><Input type="date" value={from} onChange={e => onChange(e.target.value, to)} className="w-40" /></Field>
      <Field label="To"><Input type="date" value={to} onChange={e => onChange(from, e.target.value)} className="w-40" /></Field>
      <div className="flex flex-wrap gap-1 pb-0.5">
        {[['today', 'Today'], ['month', 'This month'], ['last', 'Last month'], ['30', 'Last 30 days']].map(([k, l]) => (
          <Button key={k} type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs text-indigo-600" onClick={() => preset(k)}>{l}</Button>
        ))}
      </div>
    </div>
  );
}

import { Field, Pill, RangeBar, DownloadBtn, Pager, Spinner } from './shared';
import {
  useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { deskApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  selectCls, fmtDate, todayYmd, monthStartYmd, useMeta, useDeskData, useDebounced, TABLE_WRAP, TH, TD, ROW,
} from './helpers';

const STAGES = [
  'Request in review', 'Yet to come from university', 'At resource centre', 'Dispatched to centre',
  'Delivered - confirmed by centre', 'Rejected / changes requested',
];
const STAGE_TONE = {
  'Request in review': 'bg-slate-100 text-slate-700 border-slate-200',
  'Yet to come from university': 'bg-amber-50 text-amber-700 border-amber-200',
  'At resource centre': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Dispatched to centre': 'bg-sky-50 text-sky-700 border-sky-200',
  'Delivered - confirmed by centre': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Rejected / changes requested': 'bg-red-50 text-red-700 border-red-200',
};
const FEE_TONE = { Paid: 'text-emerald-700', Due: 'text-red-600', 'Partly paid': 'text-amber-700', 'Paid - not verified': 'text-amber-700' };

export default function DocStatusTab() {
  const meta = useMeta();
  const [f, setF] = useState({ from: monthStartYmd(), to: todayYmd(), centerId: '', stage: '', origin: '', search: '' });
  const [page, setPage] = useState(1);
  const set = patch => { setF(p => ({ ...p, ...patch })); setPage(1); };
  const search = useDebounced(f.search, 350);
  const params = useMemo(() => ({ ...f, search }), [f, search]);
  const { data, loading } = useDeskData(() => deskApi.docStatus({ ...params, page, limit: 50 }), [params, page]);

  return (
    <div className="space-y-4">
      <Card><CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <RangeBar from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
          <DownloadBtn path="/payment-desk/export/doc-status.csv" params={params} />
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Centre">
            <select className={selectCls} value={f.centerId} onChange={e => set({ centerId: e.target.value })}>
              <option value="">All centres</option>
              {(meta?.centers || []).map(c => <option key={c._id} value={c._id}>{c.name || c.organisationName}</option>)}
            </select>
          </Field>
          <Field label="Status of document">
            <select className={selectCls} value={f.stage} onChange={e => set({ stage: e.target.value })}>
              <option value="">All</option>{STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Source">
            <select className={selectCls} value={f.origin} onChange={e => set({ origin: e.target.value })}>
              <option value="">All</option><option value="Request">Centre requests</option><option value="Inventory">Dispatch inventory</option>
            </select>
          </Field>
          <Field label="Search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-9" placeholder="Student, document, tracking…" value={f.search} onChange={e => set({ search: e.target.value })} />
            </div>
          </Field>
        </div>
        {data && (
          <div className="flex flex-wrap gap-2">
            {STAGES.filter(s => data.stages[s]).map(s => (
              <button key={s} type="button" onClick={() => set({ stage: f.stage === s ? '' : s })}>
                <Pill tone={cn(STAGE_TONE[s], f.stage === s && 'ring-2 ring-indigo-300')}>{s}: {data.stages[s]}</Pill>
              </button>
            ))}
          </div>
        )}
      </CardContent></Card>

      <div className={TABLE_WRAP}>
        <table className="w-full min-w-[1800px] text-sm">
          <thead className="bg-slate-50"><tr>
            {['Student name', 'Centre', 'Date of application', 'Document type', 'Status of fee', 'Date of apply in university', 'Date recd from university', 'Rejection (reason)', 'Status of document', 'Date of dispatch', 'Tracking ID', 'Centre confirmation'].map(h => <th key={h} className={TH}>{h}</th>)}
          </tr></thead>
          <tbody>
            {loading && !data && <tr><td colSpan={12}><Spinner /></td></tr>}
            {data?.rows.length === 0 && <tr><td colSpan={12} className="p-10 text-center text-slate-400">No documents in this period</td></tr>}
            {data?.rows.map(r => (
              <tr key={r.docId} className={cn(ROW, loading && 'opacity-60')}>
                <td className={TD}><div className="font-medium">{r.student}</div><div className="text-xs text-slate-500">{r.enrollmentNumber}</div></td>
                <td className={TD}>{r.center}</td>
                <td className={cn(TD, 'whitespace-nowrap')}>{fmtDate(r.appliedOn)}</td>
                <td className={TD}>{r.docType}<div className="text-[11px] text-slate-400">{r.requestType}{r.origin === 'Inventory' ? ' · inventory' : ''}</div></td>
                <td className={cn(TD, 'font-medium', FEE_TONE[r.feeStatus])}>{r.feeStatus}</td>
                <td className={cn(TD, 'whitespace-nowrap')}>{fmtDate(r.appliedInUniversity)}</td>
                <td className={cn(TD, 'whitespace-nowrap')}>{fmtDate(r.receivedFromUniversity)}</td>
                <td className={cn(TD, 'max-w-[200px] text-xs')}>{r.rejection || '—'}</td>
                <td className={TD}><Pill tone={STAGE_TONE[r.stage]}>{r.stage}</Pill></td>
                <td className={cn(TD, 'whitespace-nowrap')}>{fmtDate(r.dispatchedOn)}</td>
                <td className={cn(TD, 'text-xs')}>{r.tracking || '—'}</td>
                <td className={cn(TD, 'whitespace-nowrap')}>{fmtDate(r.deliveredOn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={data?.page || 1} pages={data?.pages || 1} onPage={setPage} />
    </div>
  );
}

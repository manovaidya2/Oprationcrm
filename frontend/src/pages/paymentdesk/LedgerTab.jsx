import { Field, Pill, Stat, RangeBar, DownloadBtn, Spinner } from './shared';
import {
  useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { deskApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  selectCls, fmt, todayYmd, monthStartYmd, statusText, useMeta, useDeskData, TABLE_WRAP, TH, TD, ROW, ROW_CLICK, SUMMARY,
} from './helpers';

const docText = r => (r.docsTotal ? `${r.docsDelivered} of ${r.docsTotal} delivered` : '—');

export default function LedgerTab() {
  const meta = useMeta();
  const [f, setF] = useState({ from: monthStartYmd(), to: todayYmd(), centerId: '', view: 'center' });
  const params = useMemo(() => f, [f]);
  const { data, loading } = useDeskData(() => deskApi.ledger(params), [params]);
  const set = patch => setF(p => ({ ...p, ...patch }));
  const openCenter = id => set({ centerId: String(id), view: 'student' });

  return (
    <div className="space-y-4">
      <Card><CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <RangeBar from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
          <DownloadBtn path="/payment-desk/export/ledger.csv" params={params} />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="View">
            <div className="flex overflow-hidden rounded-md border">
              {[['center', 'Centre wise'], ['student', 'Student wise']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => set({ view: k })}
                  className={cn('px-4 py-1.5 text-sm', f.view === k ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}>{l}</button>
              ))}
            </div>
          </Field>
          <Field label="Centre" className="w-64">
            <select className={selectCls} value={f.centerId} onChange={e => set({ centerId: e.target.value })}>
              <option value="">All centres</option>
              {(meta?.centers || []).map(c => <option key={c._id} value={c._id}>{c.name || c.organisationName}</option>)}
            </select>
          </Field>
          {f.view === 'student' && f.centerId && (
            <Button size="sm" variant="ghost" onClick={() => set({ view: 'center', centerId: '' })}><ArrowLeft className="mr-1 h-4 w-4" />All centres</Button>
          )}
          <div className="pb-2 text-xs text-slate-500">Students are counted by the date they were added. Paid = verified payments only.</div>
        </div>
        {data && (
          <div className={SUMMARY}>
            <Stat label="Students" value={data.totals.students} />
            {data.view === 'center' && <Stat label="Enrolled" value={data.totals.enrolled} />}
            {data.view === 'center' && <Stat label="Rejected / cancelled" value={data.totals.rejected} />}
            <Stat label="Total amount" value={fmt(data.totals.total)} />
            <Stat label="Paid" value={fmt(data.totals.paid)} tone="text-emerald-700" />
            <Stat label="Balance" value={fmt(data.totals.balance)} tone="text-red-600" />
          </div>
        )}
      </CardContent></Card>

      <div className={TABLE_WRAP}>
        {loading && !data ? <Spinner /> : data?.view === 'center' ? (
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-slate-50"><tr>
              {['Name of centre', 'Total students', 'Enrolled', 'Rejected / cancelled', 'Total amount', 'Paid', 'Balance', 'Status of document'].map((h, i) => <th key={h} className={cn(TH, i >= 1 && i <= 6 && 'text-right')}>{h}</th>)}
            </tr></thead>
            <tbody>
              {data.rows.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-slate-400">No students in this period</td></tr>}
              {data.rows.map(r => (
                <tr key={r.centerId} className={ROW_CLICK} onClick={() => openCenter(r.centerId)} title="Open student-wise ledger">
                  <td className={cn(TD, 'font-medium')}>{r.center}</td>
                  <td className={cn(TD, 'text-right')}>{r.students}</td><td className={cn(TD, 'text-right')}>{r.enrolled}</td><td className={cn(TD, 'text-right')}>{r.rejected}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{fmt(r.total)}</td>
                  <td className={cn(TD, 'text-right tabular-nums text-emerald-700')}>{fmt(r.paid)}</td>
                  <td className={cn(TD, 'text-right font-semibold tabular-nums', r.balance > 0 && 'text-red-600')}>{fmt(r.balance)}</td>
                  <td className={TD}>{docText(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="bg-slate-50"><tr>
              {['Centre', 'Student', 'Enrollment', 'Course', 'Status', 'Total amount', 'Paid', 'Balance', 'Status of document'].map((h, i) => <th key={h} className={cn(TH, i >= 5 && i <= 7 && 'text-right')}>{h}</th>)}
            </tr></thead>
            <tbody>
              {data?.rows.length === 0 && <tr><td colSpan={9} className="p-10 text-center text-slate-400">No students in this period</td></tr>}
              {data?.rows.map(r => (
                <tr key={r.studentId} className={ROW}>
                  <td className={TD}>{r.center}</td><td className={cn(TD, 'font-medium')}>{r.name}</td><td className={TD}>{r.enrollmentNumber}</td><td className={TD}>{r.course}</td>
                  <td className={TD}><Pill>{statusText(r.status)}</Pill>{r.reason && !r.enrollmentNumber && <div className="mt-0.5 text-[11px] text-slate-500">{r.reason}</div>}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{fmt(r.total)}</td>
                  <td className={cn(TD, 'text-right tabular-nums text-emerald-700')}>{fmt(r.paid)}</td>
                  <td className={cn(TD, 'text-right font-semibold tabular-nums', r.balance > 0 && 'text-red-600')}>{fmt(r.balance)}</td>
                  <td className={TD}>{docText(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

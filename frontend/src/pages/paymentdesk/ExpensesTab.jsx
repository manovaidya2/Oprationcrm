import { Field, Pill, Stat, RangeBar, DownloadBtn, Spinner } from './shared';
import {
  useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { deskApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  selectCls, fmt, fmtDate, todayYmd, monthStartYmd, useMeta, useDeskData, TABLE_WRAP, TH, TD, ROW, SUMMARY,
} from './helpers';
import EntryDialog from './EntryDialog';

export default function ExpensesTab() {
  const meta = useMeta();
  const [f, setF] = useState({ from: monthStartYmd(), to: todayYmd(), kind: '', head: '' });
  const [dlg, setDlg] = useState(null);
  const params = useMemo(() => f, [f]);
  const { data, loading, reload } = useDeskData(() => deskApi.entries(params), [params]);
  const heads = meta?.expenseHeads || [];

  const remove = async (e) => {
    if (!window.confirm(`Delete this ${e.kind.toLowerCase()} of ${fmt(e.amount)}?`)) return;
    try { await deskApi.deleteEntry(e._id); toast.success('Deleted'); reload(); }
    catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-4">
      <Card><CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <RangeBar from={f.from} to={f.to} onChange={(from, to) => setF(p => ({ ...p, from, to }))} />
          <div className="flex gap-2">
            <DownloadBtn path="/payment-desk/export/entries.csv" params={params} />
            <Button size="sm" onClick={() => setDlg({ kind: 'Expense' })}><Plus className="mr-1.5 h-4 w-4" />Add expense / withdrawal</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Show" className="w-48">
            <select className={selectCls} value={f.kind} onChange={e => setF(p => ({ ...p, kind: e.target.value }))}>
              <option value="">Expenses + withdrawals</option><option value="Expense">Expenses only</option><option value="Withdrawal">Withdrawals only</option>
            </select>
          </Field>
          <Field label="Particulars" className="w-72">
            <select className={selectCls} value={f.head} onChange={e => setF(p => ({ ...p, head: e.target.value }))}>
              <option value="">All</option>{heads.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </Field>
        </div>
        {data && (
          <div className={SUMMARY}>
            <Stat label="Total collection" value={fmt(data.totals.collection)} tone="text-emerald-700" />
            <Stat label="Expenses" value={fmt(data.totals.expenses)} tone="text-amber-700" />
            <Stat label="Withdrawals" value={fmt(data.totals.withdrawals)} tone="text-amber-700" />
            <Stat label="Collection − expenses − withdrawals" value={fmt(data.totals.net)} tone={data.totals.net < 0 ? 'text-red-600' : 'text-slate-800'} />
          </div>
        )}
      </CardContent></Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1"><CardContent className="space-y-2 p-4">
          <div className="text-sm font-semibold">Expenses by head</div>
          <div className="overflow-hidden rounded-lg border border-slate-300">
            <table className="w-full text-sm">
              <thead><tr><th className={TH}>Particulars</th><th className={cn(TH, 'text-right')}>Paid</th></tr></thead>
              <tbody>
                {heads.map(h => (
                  <tr key={h} className={ROW}>
                    <td className={cn(TD, 'py-2 text-xs')}>{h}</td>
                    <td className={cn(TD, 'py-2 text-right tabular-nums', !data?.byHead[h] && 'text-slate-300')}>{fmt(data?.byHead[h] || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent></Card>

        <div className={cn(TABLE_WRAP, 'lg:col-span-2')}>
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50"><tr>
              {['Date', 'Particulars', 'Paid', 'Cash / Bank', 'Account name', 'Note', ''].map((h, i) => <th key={i} className={cn(TH, h === 'Paid' && 'text-right')}>{h}</th>)}
            </tr></thead>
            <tbody>
              {loading && !data && <tr><td colSpan={7}><Spinner /></td></tr>}
              {data?.entries.length === 0 && <tr><td colSpan={7} className="p-10 text-center text-slate-400">No entries in this period</td></tr>}
              {data?.entries.map(e => (
                <tr key={e._id} className={cn(ROW, loading && 'opacity-60')}>
                  <td className={cn(TD, 'whitespace-nowrap')}>{fmtDate(e.date)}</td>
                  <td className={TD}>{e.head || <Pill tone="bg-amber-50 text-amber-700 border-amber-200">Withdrawal</Pill>}</td>
                  <td className={cn(TD, 'text-right font-semibold tabular-nums')}>{fmt(e.amount)}</td>
                  <td className={TD}>{e.mode === 'Cash' ? 'Cash' : 'Bank'}</td>
                  <td className={TD}>{e.account?.label || '—'}</td>
                  <td className={cn(TD, 'text-xs text-slate-500')}>{e.note}</td>
                  <td className={cn(TD, 'whitespace-nowrap text-right')}>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setDlg({ kind: e.kind, entry: e })}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600" onClick={() => remove(e)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dlg && <EntryDialog kind={dlg.kind} entry={dlg.entry} accounts={meta?.accounts || []} heads={heads}
        onClose={() => setDlg(null)} onSaved={() => { setDlg(null); reload(); }} />}
    </div>
  );
}

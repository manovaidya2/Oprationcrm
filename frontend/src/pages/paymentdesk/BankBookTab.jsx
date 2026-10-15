import { Field, Stat, RangeBar, DownloadBtn, Spinner } from './shared';
import {
  useMemo, useState } from 'react';
import { Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { deskApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  selectCls, fmt, fmtDate, todayYmd, monthStartYmd, useMeta, useDeskData, TABLE_WRAP, TH, TD, ROW, SUMMARY,
} from './helpers';
import EntryDialog from './EntryDialog';

export default function BankBookTab() {
  const meta = useMeta();
  const [f, setF] = useState({ from: monthStartYmd(), to: todayYmd(), accountId: '' });
  const [dlg, setDlg] = useState(null);       // { kind, entry? }
  const params = useMemo(() => f, [f]);
  const { data, loading, reload } = useDeskData(() => deskApi.bankBook(params), [params]);
  const openings = useDeskData(() => deskApi.entries({ kind: 'Opening', from: '2000-01-01', to: todayYmd() }), [dlg === null]);
  const accounts = meta?.accounts || [];

  const removeOpening = async (e) => {
    if (!window.confirm('Delete this opening balance?')) return;
    try { await deskApi.deleteEntry(e._id); toast.success('Deleted'); reload(); openings.reload(); }
    catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-4">
      <Card><CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <RangeBar from={f.from} to={f.to} onChange={(from, to) => setF(p => ({ ...p, from, to }))} />
          <div className="flex flex-wrap gap-2">
            <DownloadBtn path="/payment-desk/export/bank-book.csv" params={params} />
            <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'Opening' })}><Landmark className="mr-1.5 h-4 w-4" />Set opening balance</Button>
            <Button size="sm" onClick={() => setDlg({ kind: 'Withdrawal' })}><Plus className="mr-1.5 h-4 w-4" />Add withdrawal</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Account" className="w-64">
            <select className={selectCls} value={f.accountId} onChange={e => setF(p => ({ ...p, accountId: e.target.value }))}>
              <option value="">All accounts</option><option value="cash">Cash in hand</option>
              {accounts.map(a => <option key={a._id} value={a._id}>{a.label}</option>)}
            </select>
          </Field>
          <div className="max-w-xl pb-2 text-xs text-slate-500">
            Account balance = opening balance + total collection (verified student payments, by UTR date) − withdrawn − expenses paid from that account.
          </div>
        </div>
        {data && (
          <div className={SUMMARY}>
            <Stat label="Opening" value={fmt(data.totals.opening)} />
            <Stat label="Collection" value={fmt(data.totals.collection)} tone="text-emerald-700" />
            <Stat label="Withdrawn" value={fmt(data.totals.withdrawn)} tone="text-amber-700" />
            <Stat label="Expenses" value={fmt(data.totals.expenses)} tone="text-amber-700" />
            <Stat label="Balance" value={fmt(data.totals.balance)} />
          </div>
        )}
      </CardContent></Card>

      <div className={TABLE_WRAP}>
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50"><tr>
            {['Account', 'Opening balance as on date', 'Total collection', 'Withdrawn', 'Expenses paid', 'Account balance'].map((h, i) => <th key={h} className={cn(TH, i > 0 && 'text-right')}>{h}</th>)}
          </tr></thead>
          <tbody>
            {loading && !data && <tr><td colSpan={6}><Spinner /></td></tr>}
            {data?.rows.map(r => (
              <tr key={r.key} className={cn(ROW, loading && 'opacity-60')}>
                <td className={TD}><div className="font-medium">{r.label}</div>
                  {!r.hasOpening && <div className="text-[11px] text-amber-700">No opening balance set. Showing only what the CRM knows.</div>}
                  {r.openingAsOn && <div className="text-[11px] text-slate-400">opening entered as on {fmtDate(r.openingAsOn)}</div>}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{fmt(r.opening)}</td>
                <td className={cn(TD, 'text-right tabular-nums text-emerald-700')}>{fmt(r.collection)}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{fmt(r.withdrawn)}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{fmt(r.expenses)}</td>
                <td className={cn(TD, 'text-right text-base font-semibold tabular-nums', r.balance < 0 && 'text-red-600')}>{fmt(r.balance)}</td>
              </tr>
            ))}
            {data && data.unassignedCollection > 0 && (
              <tr className="border-t border-slate-200 bg-amber-50 text-xs text-amber-800">
                <td className={TD} colSpan={6}>{fmt(data.unassignedCollection)} was collected in this period with no account recorded. It is not part of any balance above. Set the account in the Day Book (filter: “No account recorded”).</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardContent className="space-y-2 p-4">
          <div className="text-sm font-semibold">Collection date wise</div>
          <div className="max-h-80 overflow-auto rounded-lg border border-slate-300">
            <table className="w-full text-sm">
              <thead><tr><th className={TH}>Date</th><th className={TH}>Account</th><th className={cn(TH, 'text-right')}>Collection</th><th className={cn(TH, 'text-right')}>Payments</th></tr></thead>
              <tbody>
                {data?.daily.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-400">No collection in this period</td></tr>}
                {data?.daily.map((d, i) => (
                  <tr key={i} className={ROW}><td className={TD}>{fmtDate(d.date)}</td><td className={TD}>{d.account}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{fmt(d.collection)}</td><td className={cn(TD, 'text-right')}>{d.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent></Card>

        <Card><CardContent className="space-y-2 p-4">
          <div className="text-sm font-semibold">Opening balances entered</div>
          <div className="max-h-80 overflow-auto rounded-lg border border-slate-300">
            <table className="w-full text-sm">
              <thead><tr><th className={TH}>As on</th><th className={TH}>Account</th><th className={cn(TH, 'text-right')}>Amount</th><th /></tr></thead>
              <tbody>
                {openings.data?.entries.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-400">None yet. Use “Set opening balance”.</td></tr>}
                {openings.data?.entries.map(e => (
                  <tr key={e._id} className={ROW}><td className={TD}>{fmtDate(e.date)}</td><td className={TD}>{e.mode === 'Cash' ? 'Cash in hand' : e.account?.label}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{fmt(e.amount)}</td>
                    <td className={cn(TD, 'whitespace-nowrap text-right')}>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setDlg({ kind: 'Opening', entry: e })}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600" onClick={() => removeOpening(e)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-slate-500">If several are entered for one account, the latest one on or before the report start date is used.</div>
        </CardContent></Card>
      </div>

      {dlg && <EntryDialog kind={dlg.kind} entry={dlg.entry} accounts={accounts} heads={meta?.expenseHeads || []}
        onClose={() => setDlg(null)} onSaved={() => { setDlg(null); reload(); }} />}
    </div>
  );
}

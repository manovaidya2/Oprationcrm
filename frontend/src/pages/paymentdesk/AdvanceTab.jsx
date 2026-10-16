import { useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Loader2, Paperclip, Plus, Search, Undo2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deskApi, MEDIA } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Field, DownloadBtn, Pill, ScreenshotField, Spinner, Stat } from './shared';
import { fmt, fmtDate, selectCls, todayYmd, useDebounced, useDeskData, useMeta, TABLE_WRAP, TH, TD, ROW } from './helpers';

// A centre paid in advance (before its students were admitted): record it here, then adjust it against students later.
export function AdvanceDepositDialog({ initialCenterId = '', onClose, onSaved }) {
  const meta = useMeta();
  const accounts = (meta?.accounts || []).filter(a => a.isActive !== false);
  const [f, setF] = useState({ centerId: initialCenterId, amount: '', mode: 'UPI', utrRef: '', paidAt: todayYmd(), accountId: '', note: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = patch => setF(p => ({ ...p, ...patch }));
  const ready = f.centerId && Number(f.amount) > 0 && f.utrRef.trim() && f.paidAt;
  const save = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, v ?? ''));
      if (file) fd.append('paymentScreenshot', file);
      const r = await deskApi.addAdvance(fd);
      toast.success(`Advance of ${fmt(Number(f.amount))} added. Centre balance is now ${fmt(r.balance)}.`);
      onSaved(f.centerId);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add advance payment</DialogTitle>
          <DialogDescription>Money a centre has paid in advance. It is kept in the centre's advance account and counted in the Bank Book on this date. Use it later when adjusting students.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Centre *" className="sm:col-span-2">
            <select className={selectCls} value={f.centerId} onChange={e => set({ centerId: e.target.value })}>
              <option value="">Select centre…</option>
              {(meta?.centers || []).map(c => <option key={c._id} value={c._id}>{c.name || c.organisationName}{c.city ? ` · ${c.city}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Amount received (₹) *"><Input type="number" min="0" value={f.amount} onChange={e => set({ amount: e.target.value })} /></Field>
          <Field label="Date of UTR (payment date) *"><Input type="date" value={f.paidAt} onChange={e => set({ paidAt: e.target.value })} /></Field>
          <Field label="UTR / reference no. *" className="sm:col-span-2"><Input value={f.utrRef} onChange={e => set({ utrRef: e.target.value })} /></Field>
          <Field label="Mode">
            <select className={selectCls} value={f.mode} onChange={e => set({ mode: e.target.value })}><option value="UPI">UPI</option><option value="Bank Transfer">Bank Transfer</option></select>
          </Field>
          <Field label="Account name (received in)">
            <select className={selectCls} value={f.accountId} onChange={e => { const a = accounts.find(x => x._id === e.target.value); set({ accountId: e.target.value, mode: a?.mode || f.mode }); }}>
              <option value="">— Not specified —</option>{accounts.map(a => <option key={a._id} value={a._id}>{a.label} ({a.mode})</option>)}
            </select>
          </Field>
          <Field label="Note (optional)" className="sm:col-span-2"><Input value={f.note} onChange={e => set({ note: e.target.value })} placeholder="e.g. advance for the January batch" /></Field>
        </div>
        <ScreenshotField file={file} onFile={setFile} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || !ready}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save advance</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function History({ centerId, onChanged }) {
  const { data, loading, reload } = useDeskData(() => deskApi.advanceHistory(centerId), [centerId]);
  const [busy, setBusy] = useState('');
  const reverse = async e => {
    const why = window.prompt(`Reverse this ${e.kind === 'Deposit' ? 'advance' : 'use'} of ${fmt(e.amount)}? Reason (optional):`, '');
    if (why === null) return;
    setBusy(e._id);
    try { await deskApi.reverseAdvance(e._id, why); toast.success('Entry reversed. The balance is updated.'); reload(); onChanged(); }
    catch (err) { toast.error(err.message); } finally { setBusy(''); }
  };
  if (loading && !data) return <Spinner />;
  if (!data) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-6">
          <Stat label="Advance received" value={fmt(data.deposited)} tone="text-emerald-700" />
          <Stat label="Used for students" value={fmt(data.used)} tone="text-amber-700" />
          <Stat label="Balance" value={fmt(data.balance)} tone={data.balance > 0 ? 'text-indigo-700' : 'text-slate-500'} />
        </div>
        <DownloadBtn path="/payment-desk/advance/export.csv" params={{ centerId }} label="History CSV" />
      </div>
      <div className={TABLE_WRAP}>
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50"><tr>
            {['Date', 'Type', 'Amount', 'Balance after', 'Details', 'Entered by', ''].map((h, i) => <th key={i} className={cn(TH, i >= 2 && i <= 3 && 'text-right')}>{h}</th>)}
          </tr></thead>
          <tbody>
            {data.entries.length === 0 && <tr><td colSpan={7} className="p-10 text-center text-slate-400">No advance activity for this centre yet</td></tr>}
            {data.entries.map(e => {
              const dep = e.kind === 'Deposit', gone = e.status === 'Reversed';
              return (
                <tr key={e._id} className={cn(ROW, gone && 'bg-slate-50 text-slate-400')}>
                  <td className={cn(TD, 'whitespace-nowrap')}>{fmtDate(e.date)}</td>
                  <td className={TD}>
                    {dep ? <Pill tone="bg-emerald-50 text-emerald-700 border-emerald-200"><ArrowDownCircle className="mr-1 h-3 w-3" />Advance received</Pill>
                         : <Pill tone="bg-amber-50 text-amber-700 border-amber-200"><ArrowUpCircle className="mr-1 h-3 w-3" />Used</Pill>}
                    {gone && <Pill tone="bg-red-50 text-red-700 border-red-200">reversed</Pill>}
                  </td>
                  <td className={cn(TD, 'text-right font-semibold tabular-nums', !gone && (dep ? 'text-emerald-700' : 'text-amber-700'), gone && 'line-through')}>{dep ? '+' : '−'}{fmt(e.amount)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{e.balanceAfter === null ? '—' : fmt(e.balanceAfter)}</td>
                  <td className={cn(TD, 'text-xs')}>
                    {dep && <div>{e.mode} · UTR <b>{e.utrRef}</b>{e.accountName && <> · {e.accountName}</>}{e.screenshot && <a className="ml-2 inline-flex items-center text-indigo-600 underline" href={`${MEDIA}${e.screenshot}`} target="_blank" rel="noreferrer"><Paperclip className="mr-0.5 h-3 w-3" />screenshot</a>}</div>}
                    {!dep && e.student && <div>Paid to <b>{e.student.name}</b> {e.student.enrollmentNumber}</div>}
                    {!dep && e.settlement && <div>Adjusted in a settlement for <b>{e.settlement.studentCount}</b> student{e.settlement.studentCount === 1 ? '' : 's'}</div>}
                    {e.note && <div className="text-slate-500">{e.note}</div>}
                    {gone && <div className="text-red-600">Reversed by {e.reversedBy || '—'}{e.reversalReason ? `: ${e.reversalReason}` : ''}</div>}
                  </td>
                  <td className={cn(TD, 'whitespace-nowrap text-xs')}>{e.recordedBy}</td>
                  <td className={TD}>
                    {!gone && !e.settlement && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600" disabled={busy === e._id} onClick={() => reverse(e)} title={dep ? 'Undo this advance entry' : 'Undo: the student payment is removed and the amount returns to the advance'}>
                        <Undo2 className="mr-1 h-3.5 w-3.5" />Reverse
                      </Button>
                    )}
                    {!gone && e.settlement && <span className="text-[11px] text-slate-400" title="Reverse the settlement from the Day Book">via settlement</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdvanceTab() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const [open, setOpen] = useState('');                 // centre whose history is shown
  const [adding, setAdding] = useState(null);           // null | centreId ('' = choose in the dialog)
  const { data, loading, reload } = useDeskData(() => deskApi.advanceSummary({ search: dq }), [dq]);
  const centres = useMemo(() => data?.centres || [], [data]);
  const picked = centres.find(c => String(c.centerId) === String(open));

  return (
    <div className="space-y-4">
      <Card><CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold"><Wallet className="h-4 w-4 text-indigo-600" />Centre advance accounts</h3>
            <p className="text-xs text-slate-500">Money centres paid in advance. It goes down as you adjust it against students; every movement is in the history.</p>
          </div>
          <div className="flex gap-2">
            <DownloadBtn path="/payment-desk/advance/export.csv" params={{}} label="Balances CSV" />
            <Button className="bg-gradient-to-r from-indigo-600 to-violet-600 font-semibold" onClick={() => setAdding('')}><Plus className="mr-1.5 h-4 w-4" />Add advance</Button>
          </div>
        </div>
        {data && (
          <div className="flex flex-wrap gap-8 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <Stat label="Advance received" value={fmt(data.totals.deposited)} tone="text-emerald-700" />
            <Stat label="Used for students" value={fmt(data.totals.used)} tone="text-amber-700" />
            <Stat label="Total balance (all centres)" value={fmt(data.totals.balance)} tone="text-indigo-700" />
          </div>
        )}
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search centre…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </CardContent></Card>

      <div className={TABLE_WRAP}>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50"><tr>
            <th className={TH}>Centre</th><th className={cn(TH, 'text-right')}>Advance received</th><th className={cn(TH, 'text-right')}>Used</th><th className={cn(TH, 'text-right')}>Balance</th><th className={TH}>Last activity</th><th className={TH} />
          </tr></thead>
          <tbody>
            {loading && !data && <tr><td colSpan={6}><Spinner /></td></tr>}
            {data && centres.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-slate-400">No centres found</td></tr>}
            {centres.map(c => (
              <tr key={c.centerId} className={cn(ROW, 'cursor-pointer', String(open) === String(c.centerId) && 'bg-indigo-50/60')} onClick={() => setOpen(String(open) === String(c.centerId) ? '' : String(c.centerId))}>
                <td className={TD}><div className="font-medium">{c.name}</div><div className="text-xs text-slate-500">{c.city}</div></td>
                <td className={cn(TD, 'text-right tabular-nums text-emerald-700')}>{fmt(c.deposited)}</td>
                <td className={cn(TD, 'text-right tabular-nums text-amber-700')}>{fmt(c.used)}</td>
                <td className={cn(TD, 'text-right text-base font-semibold tabular-nums', c.balance > 0 ? 'text-indigo-700' : 'text-slate-400')}>{fmt(c.balance)}</td>
                <td className={cn(TD, 'whitespace-nowrap text-xs')}>{c.lastActivity ? fmtDate(c.lastActivity) : '—'}</td>
                <td className={cn(TD, 'text-right')}>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={e => { e.stopPropagation(); setAdding(String(c.centerId)); }}><Plus className="mr-1 h-3.5 w-3.5" />Add advance</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Card><CardContent className="space-y-3 p-4">
          <h3 className="font-semibold">History · {picked?.name}</h3>
          <History centerId={open} onChanged={reload} />
        </CardContent></Card>
      )}

      {adding !== null && <AdvanceDepositDialog initialCenterId={adding} onClose={() => setAdding(null)} onSaved={id => { setAdding(null); setOpen(String(id)); reload(); }} />}
    </div>
  );
}

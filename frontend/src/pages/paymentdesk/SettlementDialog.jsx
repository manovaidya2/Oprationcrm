import { useMemo, useState } from 'react';
import { Loader2, Search, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deskApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Field, Pill, ScreenshotField, Spinner } from './shared';
import { EPS, fmt, fmtDate, r2, todayYmd, selectCls, statusText, useDeskData, useMeta, TH, TD, ROW } from './helpers';

// Payment adjustment = a settlement: ONE payment (one UTR, one screenshot) from a centre, spread over many students.
// The same UTR on several students is expected. This creates the same settlement record Centre Billing uses.
export default function SettlementDialog({ initialCenterId = '', initialStudentId = '', onClose, onSaved }) {
  const meta = useMeta();
  const accounts = (meta?.accounts || []).filter(a => a.isActive !== false);
  const [centerId, setCenterId] = useState(initialCenterId);
  const [search, setSearch] = useState('');
  const [picks, setPicks] = useState(() => (initialStudentId ? { [initialStudentId]: '' } : {}));   // studentId -> amount ('' = full balance)
  const [received, setReceived] = useState('');
  const [f, setF] = useState({ utrRef: '', paidAt: todayYmd(), mode: 'UPI', accountId: '', note: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data: rows, loading } = useDeskData(() => (centerId ? deskApi.settlementStudents({ centerId }) : Promise.resolve([])), [centerId]);
  const list = useMemo(() => rows || [], [rows]);

  const q = search.trim().toLowerCase();
  const targets = useMemo(() => list.filter(r => !r.universityRejected), [list]);
  const visible = useMemo(() => (q ? list.filter(r => r.name.toLowerCase().includes(q) || r.enrollmentNumber.toLowerCase().includes(q)) : list), [list, q]);
  const amountOf = r => { if (r.universityRejected) return 0; const v = picks[r.studentId]; return v === undefined ? 0 : (v === '' ? r.due : (Number(v) || 0)); };
  const chosenAll = list.filter(r => picks[r.studentId] !== undefined && !r.noFee);
  const chosen = chosenAll.filter(r => !r.universityRejected);          // students who receive the payment
  const sources = chosenAll.filter(r => r.universityRejected);          // rejected students whose payment is adjusted here
  const total = r2(chosen.reduce((s, r) => s + amountOf(r), 0));
  const bad = chosen.some(r => amountOf(r) <= 0 || amountOf(r) > r.due + EPS);
  const receivedNum = Number(received) || 0;
  const diff = receivedNum > 0 ? r2(receivedNum - total) : 0;
  const ready = chosen.length > 0 && !bad && f.utrRef.trim() && f.paidAt;

  const toggle = r => setPicks(p => { const n = { ...p }; if (n[r.studentId] !== undefined) delete n[r.studentId]; else n[r.studentId] = ''; return n; });
  const tickAll = () => setPicks(p => { const n = { ...p }; visible.filter(r => !r.universityRejected && !r.noFee).forEach(r => { if (n[r.studentId] === undefined) n[r.studentId] = ''; }); return n; });
  // Spread the amount received over the students, oldest first (same idea as Centre Billing)
  const distribute = () => {
    let left = receivedNum;
    const next = {};
    for (const r of targets.filter(x => !x.noFee)) { if (left <= EPS) break; const give = Math.min(r.due, left); next[r.studentId] = String(r2(give)); left = r2(left - give); }
    sources.forEach(r => { next[r.studentId] = ''; });
    setPicks(next);
    toast.success(left > EPS ? `Spread over ${Object.keys(next).length} students. ${fmt(left)} is more than their total balance.` : `Spread over ${Object.keys(next).length} students (oldest first).`);
  };

  const save = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('centerId', centerId);
      fd.append('allocations', JSON.stringify(chosen.map(r => ({ studentId: r.studentId, amount: amountOf(r) }))));
      fd.append('sources', JSON.stringify(sources.map(r => r.studentId)));
      ['mode', 'utrRef', 'paidAt', 'accountId', 'note'].forEach(k => fd.append(k, f[k] ?? ''));
      if (file) fd.append('paymentScreenshot', file);
      const s = await deskApi.createSettlement(fd);
      toast.success(`${fmt(s.amount)} adjusted across ${s.studentCount} student${s.studentCount === 1 ? '' : 's'}.${sources.length ? ` ${sources.length} rejected student${sources.length === 1 ? '' : 's'}' payment marked adjusted.` : ''} Balances are updated everywhere.`);
      onSaved();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}>
      <DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payment adjustment (settlement)</DialogTitle>
          <DialogDescription>
            One payment from a centre, spread over its students. The same UTR and screenshot go on every selected student, they are marked <b>verified</b>, and balances update everywhere.
            This is the same settlement you see in Centre Billing. Students <b className="text-red-700">rejected by the university</b> are listed in red: tick them to mark their waiting payment as <b>adjusted</b> into this settlement (it is not verified).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Centre *" className="md:col-span-1">
            <select className={selectCls} value={centerId} onChange={e => { setCenterId(e.target.value); setPicks({}); }}>
              <option value="">Select centre…</option>
              {(meta?.centers || []).map(c => <option key={c._id} value={c._id}>{c.name || c.organisationName}{c.city ? ` · ${c.city}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Total amount received (optional, to spread automatically)">
            <div className="flex gap-2">
              <Input type="number" min="0" value={received} onChange={e => setReceived(e.target.value)} placeholder="e.g. 50000" />
              <Button type="button" variant="outline" disabled={!centerId || receivedNum <= 0} onClick={distribute} title="Fill the students' amounts from this total, oldest first"><Wand2 className="mr-1.5 h-4 w-4" />Spread</Button>
            </div>
          </Field>
          <Field label="Find a student">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-9" placeholder="Name or enrollment no." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </Field>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-300">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 bg-slate-50 px-4 py-2 text-xs text-slate-600">
            <span>{centerId ? `${targets.length} student${targets.length === 1 ? '' : 's'} with a balance${list.length > targets.length ? ` · ${list.length - targets.length} rejected by university` : ''}` : 'Choose a centre to see its students'}</span>
            <span className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={!visible.length} onClick={tickAll}>Select all shown</Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={!chosen.length} onClick={() => setPicks({})}>Clear</Button>
            </span>
          </div>
          <div className="max-h-[300px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className={cn(TH, 'w-10')} />
                  <th className={TH}>Student</th>
                  <th className={cn(TH, 'text-right')}>Total fee</th>
                  <th className={cn(TH, 'text-right')}>Paid</th>
                  <th className={cn(TH, 'text-right')}>Balance due</th>
                  <th className={cn(TH, 'w-40 text-right')}>Adjust now (₹)</th>
                </tr>
              </thead>
              <tbody>
                {centerId && loading && !rows && <tr><td colSpan={6}><Spinner /></td></tr>}
                {centerId && rows && visible.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">No students with a balance{q ? ' match your search' : ''}</td></tr>}
                {visible.map(r => {
                  const on = picks[r.studentId] !== undefined;
                  const amt = amountOf(r);
                  if (r.universityRejected) {
                    return (
                      <tr key={r.studentId} className={cn(ROW, 'bg-red-50', on && 'bg-red-100')}>
                        <td className={cn(TD, 'text-center')}><input type="checkbox" checked={on} onChange={() => toggle(r)} /></td>
                        <td className={TD}>
                          <div className="font-medium">{r.name} <span className="text-xs font-normal text-slate-500">{r.enrollmentNumber}</span></div>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">{r.course}<Pill tone="bg-red-100 text-red-700 border-red-300">Rejected by university</Pill>{r.reason && <span className="text-red-700">{r.reason}</span>}</div>
                        </td>
                        <td className={cn(TD, 'text-right tabular-nums')}>{fmt(r.netFee)}</td>
                        <td className={cn(TD, 'text-right tabular-nums text-slate-400')}>{fmt(r.paid)}</td>
                        <td className={cn(TD, 'text-right text-xs text-slate-400')}>—</td>
                        <td className={cn(TD, 'text-right text-xs')}><b className="tabular-nums text-red-700">{fmt(r.adjustable)}</b><div className="text-red-700">to mark adjusted ({r.pendingCount} payment{r.pendingCount === 1 ? '' : 's'})</div></td>
                      </tr>
                    );
                  }
                  if (r.noFee) {
                    return (
                      <tr key={r.studentId} className={cn(ROW, 'bg-slate-50')}>
                        <td className={cn(TD, 'text-center')}><input type="checkbox" disabled title="Set this student's fee first" /></td>
                        <td className={TD}>
                          <div className="font-medium">{r.name} <span className="text-xs font-normal text-slate-500">{r.enrollmentNumber}</span></div>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">{r.course}<Pill>{statusText(r.applicationStatus)}</Pill><Pill tone="bg-amber-50 text-amber-700 border-amber-200">Fee not set</Pill></div>
                        </td>
                        <td colSpan={4} className={cn(TD, 'text-right text-xs text-slate-500')}>Set this student's fee (Day Book, edit) before adjusting a payment to them</td>
                      </tr>
                    );
                  }
                  const invalid = on && (amt <= 0 || amt > r.due + EPS);
                  return (
                    <tr key={r.studentId} className={cn(ROW, on && 'bg-indigo-50/60')}>
                      <td className={cn(TD, 'text-center')}><input type="checkbox" checked={on} onChange={() => toggle(r)} /></td>
                      <td className={TD}>
                        <div className="font-medium">{r.name} <span className="text-xs font-normal text-slate-500">{r.enrollmentNumber}</span></div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">{r.course}<Pill>{statusText(r.applicationStatus)}</Pill>{r.pendingCount > 0 && <Pill tone="bg-amber-50 text-amber-700 border-amber-200">{r.pendingCount} unverified</Pill>}</div>
                      </td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{fmt(r.netFee)}</td>
                      <td className={cn(TD, 'text-right tabular-nums text-emerald-700')}>{fmt(r.paid)}</td>
                      <td className={cn(TD, 'text-right font-semibold tabular-nums')}>{fmt(r.due)}</td>
                      <td className={cn(TD, 'text-right')}>
                        <Input type="number" min="0" disabled={!on} className={cn('h-8 text-right', invalid && 'border-red-400')}
                          value={on ? (picks[r.studentId] === '' ? String(r.due) : picks[r.studentId]) : ''}
                          onChange={e => setPicks(p => ({ ...p, [r.studentId]: e.target.value }))} />
                        {invalid && <div className="mt-0.5 text-[11px] text-red-600">{amt <= 0 ? 'Enter an amount' : `More than ${fmt(r.due)}`}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Field label="UTR / reference no. *" className="md:col-span-2"><Input value={f.utrRef} onChange={e => setF(p => ({ ...p, utrRef: e.target.value }))} placeholder="Same UTR is used for every selected student" /></Field>
          <Field label="Payment date *"><Input type="date" value={f.paidAt} onChange={e => setF(p => ({ ...p, paidAt: e.target.value }))} /></Field>
          <Field label="Mode">
            <select className={selectCls} value={f.mode} onChange={e => setF(p => ({ ...p, mode: e.target.value }))}>
              <option value="UPI">UPI</option><option value="Bank Transfer">Bank Transfer</option>
            </select>
          </Field>
          <Field label="Received in account" className="md:col-span-2">
            <select className={selectCls} value={f.accountId} onChange={e => { const a = accounts.find(x => x._id === e.target.value); setF(p => ({ ...p, accountId: e.target.value, mode: a?.mode || p.mode })); }}>
              <option value="">— Not specified —</option>
              {accounts.map(a => <option key={a._id} value={a._id}>{a.label} ({a.mode})</option>)}
            </select>
          </Field>
          <Field label="Note (optional)" className="md:col-span-2"><Input value={f.note} onChange={e => setF(p => ({ ...p, note: e.target.value }))} /></Field>
          <div className="md:col-span-4"><ScreenshotField file={file} onFile={setFile} /></div>
        </div>

        <DialogFooter className="items-center gap-2">
          <div className="mr-auto text-sm">
            <b className="tabular-nums">{chosen.length}</b> student{chosen.length === 1 ? '' : 's'} · adjusting <b className="tabular-nums text-indigo-700">{fmt(total)}</b>{sources.length > 0 && <span className="ml-2 text-xs text-red-700">+ {sources.length} rejected student{sources.length === 1 ? '' : 's'} marked adjusted ({fmt(r2(sources.reduce((a, r) => a + r.adjustable, 0)))})</span>}{sources.length > 0 && chosen.length === 0 && <span className="ml-2 text-xs text-slate-500">also tick who receives the payment</span>}
            {receivedNum > 0 && Math.abs(diff) > EPS && <span className={cn('ml-3 text-xs', diff < 0 ? 'text-red-600' : 'text-amber-700')}>{diff < 0 ? `${fmt(-diff)} more than received` : `${fmt(diff)} of the received amount is not assigned`}</span>}
            {receivedNum > 0 && Math.abs(diff) <= EPS && total > 0 && <span className="ml-3 text-xs text-emerald-700">matches the amount received</span>}
          </div>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || !ready}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Adjust {chosen.length || ''} student{chosen.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
        <div className="-mt-2 text-right text-[11px] text-slate-400">Date shown as {fmtDate(f.paidAt)}</div>
      </DialogContent>
    </Dialog>
  );
}

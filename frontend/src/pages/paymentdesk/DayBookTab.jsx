import { Field, Pill, Stat, Pager, RangeBar, DownloadBtn, Spinner } from './shared';
import {
  Fragment, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deskApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  selectCls, fmt, fmtDate, r2, EPS, todayYmd, monthStartYmd, dateInput, statusText, useMeta, useDeskData, useDebounced, TABLE_WRAP, TH, TD, SUMMARY,
} from './helpers';

const VERIFY_TONE = {
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};
const TYPE_TONE = {
  'NEW ADMISSION': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'OLD ADMISSION': 'bg-slate-100 text-slate-700 border-slate-200',
  'OTHER DOCUMENT': 'bg-sky-50 text-sky-700 border-sky-200',
};

function DuplicateWarning({ matches }) {
  if (!matches?.length) return null;
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /><b>This UTR is already on other payments:</b>
      <ul className="mt-1 list-disc pl-5">
        {matches.slice(0, 6).map((m, i) => <li key={i}>{m.source}: {m.studentName} — {fmt(m.amount)}</li>)}
      </ul>
      Save only if this is genuinely a different bank transfer.
    </div>
  );
}

// ── Add a payment (student details fill automatically) ───────
function AddPaymentDialog({ open, onClose, onSaved, accounts }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const [picked, setPicked] = useState(null);
  const [f, setF] = useState({ amount: '', mode: 'UPI', utrRef: '', paidAt: todayYmd(), accountId: '', note: '' });
  const [dup, setDup] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data: results, loading } = useDeskData(() => (dq.length >= 2 && !picked ? deskApi.searchStudents(dq) : Promise.resolve([])), [dq, picked, open]);

  const reset = () => { setQ(''); setPicked(null); setDup(null); setF({ amount: '', mode: 'UPI', utrRef: '', paidAt: todayYmd(), accountId: '', note: '' }); };
  const close = () => { reset(); onClose(); };
  const pick = s => { setPicked(s); setF(p => ({ ...p, amount: s.due > 0 ? String(s.due) : '' })); };

  const save = async (confirmDuplicate = false) => {
    setBusy(true);
    try {
      await deskApi.addPayment({ studentId: picked.studentId, ...f, amount: Number(f.amount), confirmDuplicate });
      toast.success(`Payment of ${fmt(f.amount)} added for ${picked.name}`);
      reset(); onSaved();
    } catch (e) {
      if (e.status === 409 && e.details?.duplicateMatches) setDup(e.details.duplicateMatches);
      else toast.error(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && !busy && close()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add payment</DialogTitle>
          <DialogDescription>For money that went straight to the bank. Search the student; their details fill in automatically. The payment is saved as verified.</DialogDescription>
        </DialogHeader>

        {!picked ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input autoFocus className="pl-9" placeholder="Type student name, enrollment no. or phone" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            {dq.length >= 2 && loading && <Spinner />}
            {(results || []).map(s => (
              <button key={s.studentId} type="button" onClick={() => pick(s)} className="flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left hover:bg-slate-50">
                <div>
                  <div className="font-medium">{s.name} <span className="text-xs font-normal text-slate-500">{s.enrollmentNumber}</span></div>
                  <div className="text-xs text-slate-500">{[s.course, s.university, s.center].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="text-right text-xs"><div>Fee {fmt(s.netFee)}</div><div className="font-semibold text-slate-800">Due {fmt(s.due)}</div></div>
              </button>
            ))}
            {dq.length >= 2 && !loading && results?.length === 0 && <div className="p-4 text-center text-sm text-slate-400">No student found</div>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border bg-slate-50 p-3 text-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{picked.name} <span className="text-xs font-normal text-slate-500">{picked.enrollmentNumber}</span></div>
                  <div className="text-xs text-slate-500">{[picked.course, picked.university].filter(Boolean).join(' · ')}</div>
                  <div className="text-xs text-slate-500">Centre: {picked.center || '—'} · Counsellor: {picked.counselor || '—'} · {statusText(picked.applicationStatus)}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setPicked(null); setDup(null); }}>Change</Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-5">
                <Stat label="Total fee" value={fmt(picked.netFee)} />
                <Stat label="Already paid" value={fmt(picked.paid)} tone="text-emerald-700" />
                <Stat label="Balance due" value={fmt(picked.due)} />
              </div>
              {picked.lastPayment && (
                <div className="mt-2 text-xs text-slate-600">Last payment: {fmt(picked.lastPayment.amount)} on {fmtDate(picked.lastPayment.utrDate)}
                  {picked.lastPayment.utrRef ? ` · ${picked.lastPayment.utrRef}` : ''}{picked.lastPayment.accountName ? ` · ${picked.lastPayment.accountName}` : ''}</div>
              )}
              {picked.pendingCount > 0 && <div className="mt-1 text-xs text-amber-700">{picked.pendingCount} payment(s) for this student are still unverified.</div>}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Amount paid (₹)"><Input type="number" min="0" value={f.amount} onChange={e => setF(p => ({ ...p, amount: e.target.value }))} /></Field>
              <Field label="UTR / reference no."><Input value={f.utrRef} onChange={e => { setF(p => ({ ...p, utrRef: e.target.value })); setDup(null); }} /></Field>
              <Field label="Payment date (UTR date)"><Input type="date" value={f.paidAt} onChange={e => setF(p => ({ ...p, paidAt: e.target.value }))} /></Field>
              <Field label="Mode">
                <select className={selectCls} value={f.mode} onChange={e => setF(p => ({ ...p, mode: e.target.value }))}>
                  <option value="UPI">UPI</option><option value="Bank Transfer">Bank Transfer</option>
                </select>
              </Field>
              <Field label="Account name" className="md:col-span-2">
                <select className={selectCls} value={f.accountId} onChange={e => {
                  const a = accounts.find(x => x._id === e.target.value);
                  setF(p => ({ ...p, accountId: e.target.value, mode: a?.mode || p.mode }));
                }}>
                  <option value="">— Not specified —</option>
                  {accounts.filter(a => a.isActive !== false).map(a => <option key={a._id} value={a._id}>{a.label} ({a.mode})</option>)}
                </select>
              </Field>
              <Field label="Note (optional)" className="md:col-span-3"><Input value={f.note} onChange={e => setF(p => ({ ...p, note: e.target.value }))} /></Field>
            </div>
            <DuplicateWarning matches={dup} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
          {picked && (
            <Button onClick={() => save(!!dup)} disabled={busy || !f.amount || !f.utrRef.trim()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{dup ? 'Save anyway' : 'Save payment'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit a row: changes are written to the real payment / student ──
function EditDialog({ row, onClose, onSaved, accounts }) {
  const { data: sum, loading } = useDeskData(() => (row?.studentId ? deskApi.studentSummary(row.studentId) : Promise.resolve(null)), [row?.key]);
  const initPay = useMemo(() => row ? ({
    amount: String(row.paid), mode: row.mode || 'UPI', utrRef: row.utrRef, paidAt: dateInput(row.utrDate),
    accountId: row.accountId ? String(row.accountId) : '', note: row.note || '',
  }) : null, [row]);
  const initStu = useMemo(() => sum ? ({
    name: sum.name, courseName: sum.courseName, courseYear: sum.courseYear, enrollmentNumber: sum.enrollmentNumber,
    totalFee: String(sum.totalFee), discount: String(sum.discount),
  }) : null, [sum]);
  const [pay, setPay] = useState(null);
  const [stu, setStu] = useState(null);
  const [reason, setReason] = useState('');
  const [dup, setDup] = useState(null);
  const [busy, setBusy] = useState(false);
  const payV = pay || initPay;
  const stuV = stu || initStu;

  if (!row) return null;
  const diff = (a, b) => Object.fromEntries(Object.entries(a || {}).filter(([k, v]) => String(v ?? '') !== String(b?.[k] ?? '')));
  const payChanges = payV ? diff(payV, initPay) : {};
  const stuChanges = stuV ? diff(stuV, initStu) : {};
  const hasChanges = Object.keys(payChanges).length + Object.keys(stuChanges).length > 0;

  const save = async (confirmDuplicate = false) => {
    if (!reason.trim()) return toast.error('Enter a reason for the change');
    setBusy(true);
    try {
      if (Object.keys(payChanges).length) {
        const call = row.kind === 'fee' ? deskApi.editFeePayment : deskApi.editDocPayment;
        await call(row.parentId, row.txId, { ...payChanges, reason, confirmDuplicate });
      }
      if (Object.keys(stuChanges).length) await deskApi.editStudent(row.studentId, { ...stuChanges, reason });
      toast.success('Saved. The student and payment records are updated.');
      setPay(null); setStu(null); setReason(''); setDup(null);
      onSaved();
    } catch (e) {
      if (e.status === 409 && e.details?.duplicateMatches) setDup(e.details.duplicateMatches);
      else toast.error(e.message);
    } finally { setBusy(false); }
  };

  const setP = (k, v) => { setPay({ ...payV, [k]: v }); setDup(null); };
  const setS = (k, v) => setStu({ ...stuV, [k]: v });
  const net = stuV ? Math.max(0, r2(Number(stuV.totalFee || 0) - Number(stuV.discount || 0))) : 0;

  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit — {row.student}</DialogTitle>
          <DialogDescription>{row.type} · {row.course}. Saving updates the actual student and payment records and is written to the Activity Log.</DialogDescription>
        </DialogHeader>
        {loading && !sum ? <Spinner /> : (
          <div className="space-y-4">
            <section className="space-y-2">
              <div className="text-sm font-semibold">Payment</div>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Paid (₹)"><Input type="number" min="0" value={payV.amount} onChange={e => setP('amount', e.target.value)} /></Field>
                <Field label="UTR / reference"><Input value={payV.utrRef} onChange={e => setP('utrRef', e.target.value)} /></Field>
                <Field label="Date of UTR"><Input type="date" value={payV.paidAt} onChange={e => setP('paidAt', e.target.value)} /></Field>
                <Field label="Mode">
                  <select className={selectCls} value={payV.mode} onChange={e => setP('mode', e.target.value)}>
                    <option value="UPI">UPI</option><option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </Field>
                <Field label="Account name" className="md:col-span-2">
                  <select className={selectCls} value={payV.accountId} onChange={e => setP('accountId', e.target.value)}>
                    <option value="">— Not specified —</option>
                    {accounts.map(a => <option key={a._id} value={a._id}>{a.label} ({a.mode})</option>)}
                  </select>
                </Field>
                <Field label="Note" className="md:col-span-3"><Input value={payV.note} onChange={e => setP('note', e.target.value)} /></Field>
              </div>
            </section>
            {stuV && (
              <section className="space-y-2">
                <div className="text-sm font-semibold">Student & fee</div>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Student name" className="md:col-span-2"><Input value={stuV.name} onChange={e => setS('name', e.target.value)} /></Field>
                  <Field label="Enrollment no."><Input value={stuV.enrollmentNumber} onChange={e => setS('enrollmentNumber', e.target.value)} /></Field>
                  <Field label="Course name" className="md:col-span-2"><Input value={stuV.courseName} onChange={e => setS('courseName', e.target.value)} /></Field>
                  <Field label="Course year"><Input value={stuV.courseYear} onChange={e => setS('courseYear', e.target.value)} /></Field>
                  <Field label="Total fee (₹)"><Input type="number" min="0" value={stuV.totalFee} onChange={e => setS('totalFee', e.target.value)} /></Field>
                  <Field label="Discount (₹)"><Input type="number" min="0" value={stuV.discount} onChange={e => setS('discount', e.target.value)} /></Field>
                  <div className="self-end pb-2 text-xs text-slate-500">Net fee <b>{fmt(net)}</b> · counsellor {sum?.counselor || '—'} · centre {sum?.center || '—'}</div>
                </div>
              </section>
            )}
            <Field label="Reason for change (required)"><Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. UTR typed wrongly" /></Field>
            <DuplicateWarning matches={dup} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => save(!!dup)} disabled={busy || !hasChanges || !reason.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{dup ? 'Save anyway' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Day Book tab ─────────────────────────────────────────────
const HEADS = [['Status'], ['Date of transaction'], ['Student'], ['Course / document'], ['Total fee', true], ['Paid', true], ['Payment adjustment', true], ['Date of UTR'], ['UTR ref'], ['Account name'], ['Balance', true], ['Enrollment / reason'], ['Counsellor'], ['Viewer counsellor'], ['Centre'], ['Doc status']];

export default function DayBookTab() {
  const colCount = HEADS.length + 1;
  const meta = useMeta();
  const [f, setFilters] = useState({ from: monthStartYmd(), to: todayYmd(), dateBasis: 'createdAt', centerId: '', accountId: '', type: 'all', ver: 'verified', search: '' });
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const set = (patch) => { setFilters(p => ({ ...p, ...patch })); setPage(1); };
  const search = useDebounced(f.search, 350);
  const params = useMemo(() => ({ ...f, search }), [f, search]);
  const { data, loading, reload } = useDeskData(() => deskApi.dayBook({ ...params, page, limit: 50 }), [params, page]);
  const accounts = meta?.accounts || [];

  return (
    <div className="space-y-4">
      <Card><CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <RangeBar from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
          <div className="flex gap-2">
            <DownloadBtn path="/payment-desk/export/day-book.csv" params={params} />
            <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-4 w-4" />Add payment</Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-6">
          <Field label="Date based on">
            <select className={selectCls} value={f.dateBasis} onChange={e => set({ dateBasis: e.target.value })}>
              <option value="createdAt">Entry date (date of transaction)</option>
              <option value="paidAt">UTR date (payment date)</option>
            </select>
          </Field>
          <Field label="Centre">
            <select className={selectCls} value={f.centerId} onChange={e => set({ centerId: e.target.value })}>
              <option value="">All centres</option>
              {(meta?.centers || []).map(c => <option key={c._id} value={c._id}>{c.name || c.organisationName}</option>)}
            </select>
          </Field>
          <Field label="Account">
            <select className={selectCls} value={f.accountId} onChange={e => set({ accountId: e.target.value })}>
              <option value="">All accounts</option><option value="none">No account recorded</option>
              {accounts.map(a => <option key={a._id} value={a._id}>{a.label}</option>)}
            </select>
          </Field>
          <Field label="Type">
            <select className={selectCls} value={f.type} onChange={e => set({ type: e.target.value })}>
              <option value="all">All</option><option value="new">New admission</option><option value="old">Old admission</option><option value="document">Other documents</option>
            </select>
          </Field>
          <Field label="Verification">
            <select className={selectCls} value={f.ver} onChange={e => set({ ver: e.target.value })}>
              <option value="verified">Verified</option><option value="pending">Unverified (pending)</option><option value="rejected">Rejected</option><option value="all">All</option>
            </select>
          </Field>
          <Field label="Search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-9" placeholder="Student, UTR, centre…" value={f.search} onChange={e => set({ search: e.target.value })} />
            </div>
          </Field>
        </div>
        {data && (
          <div className={SUMMARY}>
            <Stat label="Entries" value={data.totals.count} />
            <Stat label="Total paid" value={fmt(data.totals.paid)} tone="text-emerald-700" />
            {Object.entries(data.totals.byType).map(([k, v]) => <Stat key={k} label={k.toLowerCase()} value={fmt(v)} />)}
          </div>
        )}
      </CardContent></Card>

      <div className="text-xs text-slate-500">
        Scroll the table sideways to see every column (counsellors, centre, document status…). Use the pencil at the start of a row to edit it.
      </div>
      <div className={TABLE_WRAP}>
        <table className="w-full min-w-[1800px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={cn(TH, 'w-12 text-center')}>Edit</th>
              {HEADS.map(([h, right]) => <th key={h} className={cn(TH, right && 'text-right')}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && !data && <tr><td colSpan={colCount}><Spinner /></td></tr>}
            {data?.rows.length === 0 && <tr><td colSpan={colCount} className="p-12 text-center text-slate-400">No payments in this period</td></tr>}
            {data?.rows.map(r => (
              <Fragment key={r.key}>
                <tr className={cn('border-t-2 border-slate-300 bg-white hover:bg-indigo-50/40', loading && 'opacity-60')}>
                  <td className={cn(TD, 'text-center')}>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditing(r)} title="Edit this payment / student"><Pencil className="h-4 w-4" /></Button>
                  </td>
                  <td className={cn(TD, 'min-w-[150px]')}>
                    <Pill tone={TYPE_TONE[r.type]}>{r.type}</Pill>
                    {r.verification !== 'verified' && <div className="mt-1.5"><Pill tone={VERIFY_TONE[r.verification]}>{r.verification}</Pill></div>}
                  </td>
                  <td className={cn(TD, 'whitespace-nowrap')}>{fmtDate(r.entryDate)}</td>
                  <td className={cn(TD, 'min-w-[200px] font-medium text-slate-900')}>{r.student}</td>
                  <td className={cn(TD, 'min-w-[130px]')}>{r.course}</td>
                  <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums')}>{fmt(r.totalFee)}</td>
                  <td className={cn(TD, 'whitespace-nowrap text-right font-semibold tabular-nums text-emerald-700')}>{fmt(r.paid)}</td>
                  <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums')}>{fmt(r.adjustment)}</td>
                  <td className={cn(TD, 'whitespace-nowrap')}>{fmtDate(r.utrDate)}</td>
                  <td className={cn(TD, 'min-w-[110px] font-mono text-xs')}>{r.utrRef}</td>
                  <td className={cn(TD, 'min-w-[110px]')}>{r.accountName || <span className="text-slate-400">—</span>}</td>
                  <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums', r.balance > EPS ? 'font-semibold text-red-600' : 'text-slate-500')}>{fmt(r.balance)}</td>
                  <td className={cn(TD, 'min-w-[150px] text-xs')}>{r.reason || <span className="text-slate-400">—</span>}</td>
                  <td className={cn(TD, 'min-w-[110px]')}>{r.counselor || <span className="text-slate-400">—</span>}</td>
                  <td className={cn(TD, 'min-w-[130px]')}>{r.viewerCounselor || <span className="text-slate-400">—</span>}</td>
                  <td className={cn(TD, 'min-w-[140px]')}>{r.center}</td>
                  <td className={cn(TD, 'min-w-[110px] text-xs')}>{statusText(r.docStatus) || <span className="text-slate-400">—</span>}</td>
                </tr>
                {r.prev && (
                  <tr className="border-t border-dashed border-slate-300 bg-slate-50 text-xs text-slate-600">
                    <td colSpan={colCount} className="px-4 py-2">
                      <span className="font-medium text-slate-700">Previous payment:</span> {fmt(r.prev.amount)} on {fmtDate(r.prev.entryDate)}
                      <span className="mx-2 text-slate-300">|</span>UTR date {fmtDate(r.prev.utrDate)}
                      <span className="mx-2 text-slate-300">|</span>{r.prev.utrRef || 'no UTR'}
                      <span className="mx-2 text-slate-300">|</span>{r.prev.accountName || 'no account'}
                      <span className="mx-2 text-slate-300">|</span>balance after it {fmt(r.prev.balance)}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={data?.page || 1} pages={data?.pages || 1} onPage={setPage} />

      <AddPaymentDialog open={adding} onClose={() => setAdding(false)} accounts={accounts} onSaved={() => { setAdding(false); reload(); }} />
      {editing && <EditDialog key={editing.key} row={editing} accounts={accounts} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

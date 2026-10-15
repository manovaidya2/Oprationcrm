import { Field, Pill, ScreenshotField, Stat, Pager, RangeBar, DownloadBtn, Spinner } from './shared';
import SettlementDialog from './SettlementDialog';
import SettlementEditDialog from './SettlementEditDialog';
import {
  Fragment, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Paperclip, Pencil, Plus, Scale, Search, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deskApi, MEDIA } from '@/lib/api';
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
  const blank = () => ({ amount: '', mode: 'UPI', utrRef: '', paidAt: todayYmd(), accountId: '', note: '' });
  const [f, setF] = useState(blank);
  const [file, setFile] = useState(null);
  const [dup, setDup] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data: results, loading } = useDeskData(() => (dq.length >= 2 && !picked ? deskApi.searchStudents(dq) : Promise.resolve([])), [dq, picked, open]);

  const reset = () => { setQ(''); setPicked(null); setDup(null); setFile(null); setF(blank()); };
  const close = () => { reset(); onClose(); };
  // Fill the form from the student: balance as the amount, and the account / mode they paid into last time
  const pick = s => {
    const last = s.lastPayment;
    const acc = last?.accountId && accounts.find(a => String(a._id) === String(last.accountId) && a.isActive !== false);
    setPicked(s);
    setF({ ...blank(), amount: s.due > 0 ? String(s.due) : '', accountId: acc ? String(acc._id) : '', mode: acc?.mode || last?.mode || 'UPI' });
  };

  const amount = Number(f.amount) || 0;
  const over = picked && amount > picked.due + EPS;
  const after = picked ? Math.max(0, r2(picked.due - amount)) : 0;
  const ready = picked && amount > 0 && !over && f.utrRef.trim() && f.paidAt;

  const save = async (confirmDuplicate = false) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('studentId', picked.studentId);
      ['amount', 'mode', 'utrRef', 'paidAt', 'accountId', 'note'].forEach(k => fd.append(k, f[k] ?? ''));
      if (confirmDuplicate) fd.append('confirmDuplicate', 'true');
      if (file) fd.append('paymentScreenshot', file);
      await deskApi.addPayment(fd);
      toast.success(`Payment of ${fmt(amount)} added for ${picked.name}. It is verified and counted as paid everywhere.`);
      reset(); onSaved();
    } catch (e) {
      if (e.status === 409 && e.details?.duplicateMatches) setDup(e.details.duplicateMatches);
      else toast.error(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && !busy && close()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add payment</DialogTitle>
          <DialogDescription>For money that went straight to the bank. Search the student; their details and balance fill in automatically. The payment is saved as <b>verified</b> and updates the student's paid amount everywhere.</DialogDescription>
        </DialogHeader>

        {!picked ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input autoFocus className="pl-9" placeholder="Type student name, enrollment no. or phone" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            {dq.length >= 2 && loading && <Spinner />}
            {(results || []).map(s => (
              <button key={s.studentId} type="button" onClick={() => pick(s)} className="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-300 p-3 text-left hover:border-indigo-400 hover:bg-indigo-50/40">
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
          <div className="grid gap-4 md:grid-cols-5">
            {/* Student (filled automatically) */}
            <div className="space-y-3 rounded-xl border border-slate-300 bg-slate-50 p-4 md:col-span-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-semibold leading-tight">{picked.name}</div>
                  <div className="text-xs text-slate-500">{picked.enrollmentNumber || 'No enrollment no. yet'}</div>
                </div>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setPicked(null); setDup(null); }}>Change</Button>
              </div>
              <dl className="space-y-1 text-xs">
                {[['Course', picked.course], ['University', picked.university], ['Centre', picked.center], ['Counsellor', picked.counselor], ['Status', statusText(picked.applicationStatus)]].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium text-slate-800">{v || '—'}</dd></div>
                ))}
              </dl>
              <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Total fee</span><b className="tabular-nums">{fmt(picked.netFee)}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Already paid</span><b className="tabular-nums text-emerald-700">{fmt(picked.paid)}</b></div>
                <div className="flex justify-between border-t pt-1.5"><span className="text-slate-500">Balance due</span><b className="tabular-nums">{fmt(picked.due)}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">After this payment</span><b className={cn('tabular-nums', over ? 'text-red-600' : 'text-indigo-700')}>{over ? '—' : fmt(after)}</b></div>
              </div>
              {picked.lastPayment && (
                <div className="text-xs text-slate-600">
                  <span className="font-medium text-slate-700">Last payment:</span> {fmt(picked.lastPayment.amount)} on {fmtDate(picked.lastPayment.utrDate)}
                  {picked.lastPayment.utrRef ? ` · ${picked.lastPayment.utrRef}` : ''}{picked.lastPayment.accountName ? ` · ${picked.lastPayment.accountName}` : ''}
                </div>
              )}
              {picked.pendingCount > 0 && <div className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{picked.pendingCount} earlier payment(s) for this student are still unverified. Verify them from the Day Book first if one of them is this payment.</div>}
              {picked.due <= EPS && <div className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">This student has no balance due. Correct the fee first if it is wrong.</div>}
            </div>

            {/* Payment details */}
            <div className="space-y-3 md:col-span-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Amount paid (₹) *">
                  <Input type="number" min="0" value={f.amount} onChange={e => setF(p => ({ ...p, amount: e.target.value }))} className={cn(over && 'border-red-400')} />
                  {over && <span className="text-[11px] text-red-600">More than the balance due of {fmt(picked.due)}</span>}
                </Field>
                <Field label="Date of UTR (payment date) *"><Input type="date" value={f.paidAt} onChange={e => setF(p => ({ ...p, paidAt: e.target.value }))} /></Field>
                <Field label="UTR / reference no. *" className="sm:col-span-2"><Input value={f.utrRef} onChange={e => { setF(p => ({ ...p, utrRef: e.target.value })); setDup(null); }} placeholder="e.g. 4123 5678 9012" /></Field>
                <Field label="Mode">
                  <select className={selectCls} value={f.mode} onChange={e => setF(p => ({ ...p, mode: e.target.value }))}>
                    <option value="UPI">UPI</option><option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </Field>
                <Field label="Account name (received in)">
                  <select className={selectCls} value={f.accountId} onChange={e => {
                    const a = accounts.find(x => x._id === e.target.value);
                    setF(p => ({ ...p, accountId: e.target.value, mode: a?.mode || p.mode }));
                  }}>
                    <option value="">— Not specified —</option>
                    {accounts.filter(a => a.isActive !== false).map(a => <option key={a._id} value={a._id}>{a.label} ({a.mode})</option>)}
                  </select>
                </Field>
                <Field label="Note (optional)" className="sm:col-span-2"><Input value={f.note} onChange={e => setF(p => ({ ...p, note: e.target.value }))} /></Field>
              </div>
              <ScreenshotField file={file} onFile={setFile} />
              <DuplicateWarning matches={dup} />
            </div>
          </div>
        )}

        <DialogFooter className="items-center gap-2">
          {picked && <span className="mr-auto text-xs text-slate-500">{ready ? 'Ready to save' : 'Fill the fields marked *'}</span>}
          <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
          {picked && (
            <Button onClick={() => save(!!dup)} disabled={busy || !ready}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{dup ? 'Save anyway' : 'Save as verified payment'}
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
  const [file, setFile] = useState(null);
  const [dup, setDup] = useState(null);
  const [busy, setBusy] = useState(false);
  const payV = pay || initPay;
  const stuV = stu || initStu;

  if (!row) return null;
  const diff = (a, b) => Object.fromEntries(Object.entries(a || {}).filter(([k, v]) => String(v ?? '') !== String(b?.[k] ?? '')));
  const payChanges = payV ? diff(payV, initPay) : {};
  const stuChanges = stuV ? diff(stuV, initStu) : {};
  const changeCount = Object.keys(payChanges).length + Object.keys(stuChanges).length + (file ? 1 : 0);
  const hasChanges = changeCount > 0;

  const save = async (confirmDuplicate = false) => {
    setBusy(true);
    try {
      if (Object.keys(payChanges).length || file) {
        const call = row.kind === 'fee' ? deskApi.editFeePayment : deskApi.editDocPayment;
        const body = { ...payChanges, reason, confirmDuplicate };
        let payload = body;
        if (file) {
          payload = new FormData();
          Object.entries(body).forEach(([k, v]) => payload.append(k, v ?? ''));
          payload.append('paymentScreenshot', file);
        }
        await call(row.parentId, row.txId, payload);
      }
      if (Object.keys(stuChanges).length) await deskApi.editStudent(row.studentId, { ...stuChanges, reason });
      toast.success('Saved. The student and payment records are updated.');
      setPay(null); setStu(null); setReason(''); setFile(null); setDup(null);
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
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 tabular-nums">
                  <span>Total fee <b>{fmt(row.totalFee)}</b></span>
                  <span>This payment <b className="text-emerald-700">{fmt(row.paid)}</b></span>
                  <span>Balance after this row <b className={row.balance > EPS ? 'text-red-600' : ''}>{fmt(row.balance)}</b></span>
                </div>
              </div>
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
                <div className="md:col-span-3"><ScreenshotField file={file} onFile={setFile} current={row.screenshot} /></div>
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
            {stuV && sum?.installmentCount > 0 && Math.abs(net - sum.installmentTotal) > EPS && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                This student has an installment plan of {fmt(sum.installmentTotal)}, which does not match the net fee of {fmt(net)}.
                The plan is not changed automatically. Update it in Payment Coordinator if needed.
              </div>
            )}
            <Field label="Reason for change (optional)"><Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. UTR typed wrongly. If left empty, it is saved as “Edited from Payment Desk”." /></Field>
            <DuplicateWarning matches={dup} />
          </div>
        )}
        <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 items-center gap-2 border-t bg-white px-6 py-4">
          <span className="mr-auto text-xs text-slate-500">
            {hasChanges ? `${changeCount} change(s)` : 'Change any field above to enable Save'}
          </span>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => save(!!dup)} disabled={busy || !hasChanges}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{dup ? 'Save anyway' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Day Book tab ─────────────────────────────────────────────
const HEADS = [['Status'], ['Date of transaction'], ['Student'], ['Course / document'], ['Total fee', true], ['Paid', true], ['Payment adjustment', true, 'A settlement: one centre payment (one UTR, one screenshot) spread over many students, made here or in Centre Billing. Empty for ordinary payments.'], ['Date of UTR'], ['UTR ref'], ['Account name'], ['Balance', true, 'Fee still to pay after this row (payments and adjustments both count).'], ['Unverified amount', true, 'This student\'s payments that are still waiting to be verified. They are NOT counted as paid yet.'], ['Enrollment / reason'], ['Counsellor'], ['Viewer counsellor'], ['Centre'], ['Doc status']];

export default function DayBookTab() {
  const meta = useMeta();
  const [f, setFilters] = useState({ from: monthStartYmd(), to: todayYmd(), dateBasis: 'createdAt', centerId: '', accountId: '', type: 'all', ver: 'all', search: '' });
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [adjusting, setAdjusting] = useState(null);                // { centerId, studentId } -> settlement (payment adjustment) dialog
  const [editingSettlement, setEditingSettlement] = useState(null);  // settlement id
  const [selected, setSelected] = useState(() => new Set());     // keys of unverified rows ticked for verify / reject
  const [verifying, setVerifying] = useState(null);               // { list, note } — confirm + optional note before verifying
  const [rejecting, setRejecting] = useState(null);               // { list, note }
  const [reviewBusy, setReviewBusy] = useState(false);
  const set = (patch) => { setFilters(p => ({ ...p, ...patch })); setPage(1); setSelected(new Set()); };
  const search = useDebounced(f.search, 350);
  const params = useMemo(() => ({ ...f, search }), [f, search]);
  const { data, loading, reload } = useDeskData(() => deskApi.dayBook({ ...params, page, limit: 50 }), [params, page]);
  const accounts = meta?.accounts || [];
  const rows = data?.rows;
  const pendingRows = useMemo(() => (rows || []).filter(r => r.verification === 'pending'), [rows]);
  const selectable = pendingRows.length > 0;
  const colCount = HEADS.length + 1 + (selectable ? 1 : 0);
  const pickedRows = pendingRows.filter(r => selected.has(r.key));
  const pickedAmount = pickedRows.reduce((s, r) => s + r.paid, 0);
  const allPicked = selectable && pickedRows.length === pendingRows.length;
  const toggle = (key) => setSelected(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const toItems = list => list.map(r => ({ kind: r.kind, parentId: r.parentId, txId: r.txId }));

  const review = async (action, list, note = '') => {
    if (!list.length) return;
    setReviewBusy(true);
    try {
      const res = await deskApi.reviewPayments({ action, note, items: toItems(list) });
      const verb = action === 'verify' ? 'verified' : 'rejected';
      toast.success(`${res.done} payment${res.done === 1 ? '' : 's'} ${verb}. ${action === 'verify' ? 'They now count as paid everywhere and are gone from the pending queues.' : 'The centre has been told.'}`);
      if (res.skipped?.length) toast.info(`${res.skipped.length} skipped: ${[...new Set(res.skipped.map(s => s.reason))].join(', ')}`);
      setSelected(new Set()); setRejecting(null); setVerifying(null);
      reload();
    } catch (e) { toast.error(e.message); }
    finally { setReviewBusy(false); }
  };
  const startVerify = (list) => { if (list.length) setVerifying({ list, note: '' }); };
  const startReject = (list) => {
    const feeOnly = list.filter(r => r.kind === 'fee');
    if (!feeOnly.length) return toast.error('Document payments can only be verified here, not rejected.');
    if (feeOnly.length < list.length) toast.info(`${list.length - feeOnly.length} document payment(s) left out. They can only be verified.`);
    setRejecting({ list: feeOnly, note: '' });
  };

  return (
    <div className="space-y-4">
      <Card><CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <RangeBar from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
          <div className="flex gap-2">
            <DownloadBtn path="/payment-desk/export/day-book.csv" params={params} />
            <Button size="sm" variant="outline" onClick={() => setAdjusting({ centerId: '', studentId: '' })}><Scale className="mr-1.5 h-4 w-4" />Adjust payments</Button>
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
              <option value="all">All</option><option value="verified">Verified</option><option value="pending">Unverified (pending)</option><option value="rejected">Rejected</option>
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
            {data.totals.adjusted > 0 && <Stat label="Payment adjustment" value={fmt(data.totals.adjusted)} tone="text-amber-700" />}
            {Object.entries(data.totals.byType).map(([k, v]) => <Stat key={k} label={k.toLowerCase()} value={fmt(v)} />)}
          </div>
        )}
      </CardContent></Card>

      {data?.totals.unverified.count > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            <AlertTriangle className="mr-1.5 inline h-4 w-4" />
            <b>{data.totals.unverified.count} unverified payment{data.totals.unverified.count === 1 ? '' : 's'}</b> ({fmt(data.totals.unverified.amount)}) in this period.
            Verify them here and they are marked verified everywhere, including the Accountant's queue.
          </span>
          {f.ver !== 'pending' && <Button size="sm" variant="outline" className="border-amber-400 bg-white" onClick={() => set({ ver: 'pending' })}>Show unverified</Button>}
        </div>
      )}
      {pickedRows.length > 0 && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-3 shadow-sm">
          <span className="text-sm font-medium text-indigo-900">{pickedRows.length} selected · {fmt(pickedAmount)}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={reviewBusy}>Clear</Button>
            <Button size="sm" variant="outline" className="border-red-300 bg-white text-red-700 hover:bg-red-50" onClick={() => startReject(pickedRows)} disabled={reviewBusy}><XCircle className="mr-1.5 h-4 w-4" />Reject selected</Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => startVerify(pickedRows)} disabled={reviewBusy}>
              {reviewBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}Verify selected
            </Button>
          </div>
        </div>
      )}
      <div className="text-xs text-slate-500">
        Scroll the table sideways to see every column (counsellors, centre, document status…). Use the pencil at the start of a row to edit it.
      </div>
      <div className={TABLE_WRAP}>
        <table className="w-full min-w-[1800px] border-collapse text-[13px]">
          <thead>
            <tr>
              {selectable && (
                <th className={cn(TH, 'w-10 text-center')}>
                  <input type="checkbox" title="Tick all unverified payments on this page" checked={allPicked}
                    onChange={e => setSelected(e.target.checked ? new Set(pendingRows.map(r => r.key)) : new Set())} />
                </th>
              )}
              <th className={cn(TH, 'w-28 text-center')}>Actions</th>
              {HEADS.map(([h, right, hint]) => <th key={h} title={hint} className={cn(TH, right && 'text-right', hint && 'cursor-help')}>{h}{hint && <span className="ml-1 text-slate-400">ⓘ</span>}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && !data && <tr><td colSpan={colCount}><Spinner /></td></tr>}
            {data?.rows.length === 0 && <tr><td colSpan={colCount} className="p-12 text-center text-slate-400">No payments in this period</td></tr>}
            {data?.rows.map(r => (
              <Fragment key={r.key}>
                <tr className={cn('border-t-2 border-slate-300 bg-white hover:bg-indigo-50/40', loading && 'opacity-60')}>
                  {selectable && (
                    <td className={cn(TD, 'text-center')}>
                      {r.verification === 'pending' && <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)} />}
                    </td>
                  )}
                  <td className={cn(TD, 'text-center')}>
                    <div className="flex items-center justify-center gap-1">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => (r.isAdjustment && r.settlementId ? setEditingSettlement(r.settlementId) : setEditing(r))} title={r.isAdjustment ? 'Edit or reverse this settlement' : 'Edit this payment / student'}><Pencil className="h-4 w-4" /></Button>
                      {r.studentId && <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={() => setAdjusting({ centerId: String(r.centerId || ''), studentId: String(r.studentId) })} title="Payment adjustment (settlement) for this student"><Scale className="mr-1 h-3.5 w-3.5" />Adjust</Button>}
                    </div>
                  </td>
                  <td className={cn(TD, 'min-w-[150px]')}>
                    <Pill tone={TYPE_TONE[r.type]}>{r.type}</Pill>
                    {r.isAdjustment && <div className="mt-1.5"><Pill tone="bg-amber-50 text-amber-800 border-amber-300">ADJUSTMENT{r.settlement ? ` · ${r.settlement.studentCount} student${r.settlement.studentCount === 1 ? '' : 's'}` : ''}</Pill></div>}
                    {r.verification !== 'verified' && <div className="mt-1.5"><Pill tone={VERIFY_TONE[r.verification]}>{r.verification}</Pill></div>}
                    {r.verification === 'pending' && (
                      <div className="mt-2 flex gap-1.5">
                        <Button size="sm" className="h-7 bg-emerald-600 px-2.5 text-xs hover:bg-emerald-700" disabled={reviewBusy} onClick={() => startVerify([r])}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Verify</Button>
                        {r.kind === 'fee' && <Button size="sm" variant="outline" className="h-7 border-red-300 px-2.5 text-xs text-red-700 hover:bg-red-50" disabled={reviewBusy} onClick={() => startReject([r])}>Reject</Button>}
                      </div>
                    )}
                  </td>
                  <td className={cn(TD, 'whitespace-nowrap')}>{fmtDate(r.entryDate)}</td>
                  <td className={cn(TD, 'min-w-[200px] font-medium text-slate-900')}>{r.student}</td>
                  <td className={cn(TD, 'min-w-[130px]')}>{r.course}</td>
                  <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums')}>{fmt(r.totalFee)}</td>
                  <td className={cn(TD, 'whitespace-nowrap text-right font-semibold tabular-nums text-emerald-700')}>{r.isAdjustment ? '' : fmt(r.paid)}</td>
                  <td className={cn(TD, 'whitespace-nowrap text-right font-semibold tabular-nums text-amber-700')}>{r.isAdjustment ? fmt(r.adjustment) : ''}</td>
                  <td className={cn(TD, 'whitespace-nowrap')}>{fmtDate(r.utrDate)}</td>
                  <td className={cn(TD, 'min-w-[110px] font-mono text-xs')}>{r.utrRef}{r.screenshot && <a href={`${MEDIA}${r.screenshot}`} target="_blank" rel="noreferrer" title="View payment screenshot" className="ml-1.5 inline-flex align-middle text-indigo-600 hover:text-indigo-800"><Paperclip className="h-3.5 w-3.5" /></a>}</td>
                  <td className={cn(TD, 'min-w-[110px]')}>{r.accountName || <span className="text-slate-400">—</span>}</td>
                  <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums', r.balance > EPS ? 'font-semibold text-red-600' : 'text-slate-500')}>{fmt(r.balance)}</td>
                  <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums', r.unverifiedAmount > 0 && 'font-semibold text-amber-700')}>{r.unverifiedAmount > 0 ? fmt(r.unverifiedAmount) : ''}</td>
                  <td className={cn(TD, 'min-w-[150px] text-xs')}>{r.reason || <span className="text-slate-400">—</span>}</td>
                  <td className={cn(TD, 'min-w-[110px]')}>{r.counselor || <span className="text-slate-400">—</span>}</td>
                  <td className={cn(TD, 'min-w-[130px]')}>{r.viewerCounselor || <span className="text-slate-400">—</span>}</td>
                  <td className={cn(TD, 'min-w-[140px]')}>{r.center}</td>
                  <td className={cn(TD, 'min-w-[110px] text-xs')}>{statusText(r.docStatus) || <span className="text-slate-400">—</span>}</td>
                </tr>
                {(r.payments?.length > 0 || r.unverified?.length > 0) && (
                  <tr className="border-t border-dashed border-slate-300 bg-slate-50 text-xs text-slate-600">
                    <td colSpan={colCount} className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span className="font-medium text-slate-700">All verified payments of this {r.kind === 'doc' ? 'document' : 'student'}:</span>
                        {r.payments.length === 0 && <span className="text-slate-400">none yet</span>}
                        {r.payments.map(x => (
                          <span key={x.txId} className={cn('inline-flex flex-wrap items-center gap-x-1.5 rounded-md border px-2 py-1',
                            String(x.txId) === String(r.txId) ? 'border-indigo-400 bg-indigo-50 text-indigo-900' : x.isAdjustment ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-300 bg-white')}>
                            <b className="tabular-nums">{fmt(x.amount)}</b><span>{fmtDate(x.paidAt)}</span>
                            {x.utrRef && <span className="font-mono">{x.utrRef}</span>}
                            {x.accountName && <span>· {x.accountName}</span>}
                            {x.isAdjustment && <span className="font-medium">· adjustment</span>}
                          </span>
                        ))}
                        <span className="ml-1 font-semibold text-slate-800">= {fmt(r.verifiedTotal)} verified</span>
                        <span className="text-slate-300">|</span>
                        <span>Balance now <b className={Math.max(0, r2(r.totalFee - r.verifiedTotal)) > EPS ? 'text-red-600' : 'text-emerald-700'}>{fmt(Math.max(0, r2(r.totalFee - r.verifiedTotal)))}</b></span>
                      </div>
                      {r.unverified.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                          <span className="font-medium text-amber-800">Unverified ({fmt(r.unverifiedAmount)}), not counted yet:</span>
                          {r.unverified.map(x => (
                            <span key={x.txId} className="inline-flex flex-wrap items-center gap-x-1.5 rounded-md border border-dashed border-amber-400 bg-amber-50 px-2 py-1 text-amber-900">
                              <b className="tabular-nums">{fmt(x.amount)}</b><span>{fmtDate(x.paidAt)}</span>{x.utrRef && <span className="font-mono">{x.utrRef}</span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={data?.page || 1} pages={data?.pages || 1} onPage={p => { setPage(p); setSelected(new Set()); }} />

      <Dialog open={!!verifying} onOpenChange={o => !o && !reviewBusy && setVerifying(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Verify {verifying?.list.length} payment{verifying?.list.length === 1 ? '' : 's'}</DialogTitle>
            <DialogDescription>Check the details, add a note if you want, then confirm. Once verified, it counts as paid everywhere and leaves the Accountant's pending queue.</DialogDescription>
          </DialogHeader>
          {verifying && (
            <div className="space-y-3">
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-300">
                <table className="w-full text-sm">
                  <tbody>
                    {verifying.list.slice(0, 8).map(r => (
                      <tr key={r.key} className="border-b border-slate-200 last:border-b-0">
                        <td className="px-3 py-2"><div className="font-medium">{r.student}</div><div className="text-xs text-slate-500">{r.course} · {r.mode}{r.accountName ? ` · ${r.accountName}` : ''}</div></td>
                        <td className="px-3 py-2 text-right text-xs text-slate-600"><div className="font-mono">{r.utrRef || 'no UTR'}</div><div>{fmtDate(r.utrDate)}</div></td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-700">{fmt(r.paid)}</td>
                      </tr>
                    ))}
                    {verifying.list.length > 8 && <tr><td colSpan={3} className="px-3 py-2 text-center text-xs text-slate-500">…and {verifying.list.length - 8} more</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Total to verify</span><b className="tabular-nums">{fmt(verifying.list.reduce((a, r) => a + r.paid, 0))}</b></div>
              <Field label="Note (optional)">
                <Textarea autoFocus value={verifying.note} onChange={e => setVerifying(p => ({ ...p, note: e.target.value }))} placeholder="e.g. Checked in the bank statement" />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifying(null)} disabled={reviewBusy}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={reviewBusy} onClick={() => review('verify', verifying.list, verifying.note)}>
              {reviewBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Verify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejecting} onOpenChange={o => !o && !reviewBusy && setRejecting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject {rejecting?.list.length} payment{rejecting?.list.length === 1 ? '' : 's'}</DialogTitle>
            <DialogDescription>The centre is told the payment was rejected and why. Rejected payments do not count as paid.</DialogDescription>
          </DialogHeader>
          <Field label="Reason (required)"><Textarea autoFocus value={rejecting?.note || ''} onChange={e => setRejecting(p => ({ ...p, note: e.target.value }))} placeholder="e.g. UTR not found in the bank statement" /></Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)} disabled={reviewBusy}>Cancel</Button>
            <Button variant="destructive" disabled={reviewBusy || !rejecting?.note.trim()} onClick={() => review('reject', rejecting.list, rejecting.note)}>
              {reviewBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {adjusting && <SettlementDialog initialCenterId={adjusting.centerId} initialStudentId={adjusting.studentId} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); reload(); }} />}
      {editingSettlement && <SettlementEditDialog settlementId={editingSettlement} onClose={() => setEditingSettlement(null)} onSaved={() => { setEditingSettlement(null); reload(); }} />}

      <AddPaymentDialog open={adding} onClose={() => setAdding(false)} accounts={accounts} onSaved={() => { setAdding(false); reload(); }} />
      {editing && <EditDialog key={editing.key} row={editing} accounts={accounts} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

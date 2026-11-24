import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, CalendarClock, CheckCircle2, History, Landmark, Loader2, RotateCcw, Search, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { centersApi, paymentAccountsApi, studentsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { AdmissionTimeline } from '@/components/AdmissionTimeline';

const fmtAmt = n => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const today = () => new Date().toISOString().slice(0, 10);
const NO_ACCOUNT = 'none';
const UNI_FILTERS = [
  { key: 'pending', label: 'To cancel at university' },
  { key: 'done', label: 'Cancelled at university' },
  { key: 'all', label: 'All' },
];
const fmtDateTime = d => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
// History tab: what happened to an admission (from the students' status history)
const HISTORY_TYPES = {
  Cancelled:                   { label: 'Cancelled',                chip: 'bg-red-50 text-red-700',         icon: Ban },
  Restored:                    { label: 'Restored',                 chip: 'bg-emerald-50 text-emerald-700', icon: RotateCcw },
  Auto_Cancel_Reverted:        { label: 'Auto-cancel reverted',     chip: 'bg-emerald-50 text-emerald-700', icon: Undo2 },
  University_Cancel_Confirmed: { label: 'Cancelled at university',  chip: 'bg-rose-50 text-rose-700',       icon: Landmark },
  University_Cancel_Undone:    { label: 'University cancel undone', chip: 'bg-slate-100 text-slate-700',    icon: Undo2 },
};
const HISTORY_FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'cancelled', label: 'Cancelled', match: e => e.type === 'Cancelled' },
  { key: 'restored', label: 'Restored', match: e => e.type === 'Restored' || e.type === 'Auto_Cancel_Reverted' },
  { key: 'university', label: 'University', match: e => e.type.startsWith('University_') },
];

// Restore an auto-cancelled admission with the payment that came in late.
// Admin's / accountant's payment is verified at once; a counselor's goes to the accountant and counts only once verified.
function RestoreDialog({ student, graceDays, verifiedAtOnce, onClose, onRestored }) {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ amount: student.due || '', mode: 'UPI', utrRef: '', paidAt: today(), paidToAccount: NO_ACCOUNT, note: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => { paymentAccountsApi.list().then(setAccounts).catch(() => {}); }, []);

  const amount = Number(form.amount) || 0;
  const completes = student.feeSet && amount >= student.due;

  async function save() {
    if (!(amount > 0)) return toast.error('Enter the payment amount');
    if (!form.utrRef.trim()) return toast.error('Enter the UTR / reference number');
    setSaving(true);
    try {
      const account = accounts.find(a => a._id === form.paidToAccount);
      const res = await studentsApi.restore(student._id, {
        amount, mode: form.mode, utrRef: form.utrRef.trim(), paidAt: form.paidAt, note: form.note,
        paidToAccount: account?._id || '', paidToAccountLabel: account?.label || '',
      });
      toast.success(res.awaitingVerification
        ? `${student.name} restored — payment sent to the accountant for verification`
        : res.fullyPaid ? `${student.name} restored — course fee fully paid` : `${student.name} restored — ${res.graceDays} days to complete the fee`);
      onRestored();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><RotateCcw className="h-4 w-4"/>Restore admission — {student.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {student.feeSet ? <>Course fee {fmtAmt(student.netFee)} · paid {fmtAmt(student.paid)} · <b>{fmtAmt(student.due)} due</b></> : 'Course fee is not set — set it on the student page first.'}
            <div className="mt-1 text-slate-500">
              The admission goes back to <b>{(student.statusBeforeCancel || 'Submitted').replace(/_/g, ' ')}</b>.
              {' '}{verifiedAtOnce
                ? (completes ? 'This payment completes the fee, so it leaves the timeline.' : `If the fee is still not complete, it gets ${graceDays} days, then it is cancelled again.`)
                : `The payment goes to the accountant for verification and counts as paid only once verified. The fee must be complete within ${graceDays} days, or the admission is cancelled again.`}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount *</Label><Input type="number" min="0" value={form.amount} onChange={e => set('amount', e.target.value)}/></div>
            <div>
              <Label>Mode</Label>
              <Select value={form.mode} onValueChange={v => set('mode', v)}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent><SelectItem value="UPI">UPI</SelectItem><SelectItem value="Bank Transfer">Bank Transfer</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>UTR / Reference *</Label><Input value={form.utrRef} onChange={e => set('utrRef', e.target.value)}/></div>
            <div><Label>Paid on</Label><Input type="date" value={form.paidAt} onChange={e => set('paidAt', e.target.value)}/></div>
          </div>
          <div>
            <Label>Paid to account</Label>
            <Select value={form.paidToAccount} onValueChange={v => set('paidToAccount', v)}>
              <SelectTrigger><SelectValue placeholder="Select account"/></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ACCOUNT}>Not set</SelectItem>
                {accounts.map(a => <SelectItem key={a._id} value={a._id}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Note</Label><Input value={form.note} onChange={e => set('note', e.target.value)} placeholder="Optional"/></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !student.feeSet}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin"/>}Restore & add payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Confirm the admission was also cancelled at the university — permanent, no restore after this
function UniversityCancelDialog({ student, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await studentsApi.confirmUniversityCancel(student._id, note.trim());
      toast.success(`${student.name} marked as cancelled at the university`);
      onDone();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Landmark className="h-4 w-4"/>Cancelled at university — {student.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            Confirm that this admission has been <b>permanently cancelled at the university</b> as well.
            This cannot be undone — the admission can no longer be restored.
          </div>
          <div>
            <Label>Note / university reference</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional — e.g. cancellation letter no., date, who confirmed"/>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-red-600 hover:bg-red-700">{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin"/>}Confirm cancelled at university</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The university started the admission again: remove the mark so it can be restored with its payment
function UndoUniversityCancelDialog({ student, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (reason.trim().length < 3) return toast.error('Please write why this is being undone');
    setSaving(true);
    try {
      await studentsApi.undoUniversityCancel(student._id, reason.trim());
      toast.success(`${student.name}: university cancellation undone — it can be restored now`);
      onDone();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Undo2 className="h-4 w-4"/>Undo university cancellation — {student.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Use this if the university has started this admission again. The “Cancelled at university” mark is removed;
            the admission stays cancelled here until it is restored with its payment.
          </div>
          <div>
            <Label>Reason *</Label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. University re-opened the admission on 28 Nov"/>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin"/>}Undo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelledList({ list, canRestore, canConfirm, onRestore, onConfirm, onUndo, onOpen }) {
  const [filter, setFilter] = useState('pending');
  const counts = { pending: list.filter(s => !s.universityCancelled).length, done: list.filter(s => s.universityCancelled).length, all: list.length };
  const shown = list.filter(s => filter === 'all' || (filter === 'done' ? s.universityCancelled : !s.universityCancelled));

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-xs shadow-sm">
        {UNI_FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${filter === f.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {f.label} <span className="tabular-nums opacity-70">({counts[f.key]})</span>
          </button>
        ))}
      </div>

      {!shown.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-400">No admissions here</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {shown.map(s => (
            <div key={s._id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
              <button type="button" onClick={() => onOpen(s)} className="min-w-0 flex-1 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{s.name}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">was {(s.statusBeforeCancel || '—').replace(/_/g, ' ')}</span>
                  {s.restoreCount > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">cancelled again after restore</span>}
                  {s.settlementRequested && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">refund requested</span>}
                  {s.universityCancelled && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3"/>Cancelled at university
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-500">
                  {[s.center?.name, [s.courseName, s.courseYear].filter(Boolean).join(' '), `cancelled ${fmtDate(s.cancelledAt)}`].filter(Boolean).join(' · ')}
                </div>
                <div className="mt-0.5 text-xs tabular-nums text-slate-600">
                  {s.feeSet ? <>{fmtAmt(s.paid)} paid of {fmtAmt(s.netFee)} · <b>{fmtAmt(s.due)} due</b></> : 'Fee not set'}
                  {s.pending > 0 && <span className="text-blue-600"> · {fmtAmt(s.pending)} pending verification</span>}
                </div>
                {s.universityCancelled && (
                  <div className="mt-0.5 text-xs text-emerald-700">
                    Confirmed by {s.universityCancelledBy?.name || '—'}{s.universityCancelledBy?.role ? ` (${s.universityCancelledBy.role})` : ''} on {fmtDate(s.universityCancelledAt)}
                    {s.universityCancelNote ? ` · ${s.universityCancelNote}` : ''}
                  </div>
                )}
              </button>
              {s.universityCancelled && canConfirm && (
                <Button size="sm" variant="outline" className="flex-shrink-0" onClick={() => onUndo(s)}>
                  <Undo2 className="mr-1.5 h-3.5 w-3.5"/>Undo
                </Button>
              )}
              {!s.universityCancelled && (canRestore || canConfirm) && (
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                  {canRestore && (s.amountSettled
                    ? <span className="text-xs text-slate-400">Amount settled — cannot restore</span>
                    : <Button size="sm" variant="outline" onClick={() => onRestore(s)}><RotateCcw className="mr-1.5 h-3.5 w-3.5"/>Restore</Button>)}
                  {canConfirm && (
                    <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => onConfirm(s)}>
                      <Landmark className="mr-1.5 h-3.5 w-3.5"/>Cancelled at university
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryList({ events, total, limit, loading, onOpen }) {
  const [filter, setFilter] = useState('all');
  if (loading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-300"/></div>;
  const shown = events.filter(HISTORY_FILTERS.find(f => f.key === filter).match);

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-xs shadow-sm">
        {HISTORY_FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${filter === f.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {f.label} <span className="tabular-nums opacity-70">({events.filter(f.match).length})</span>
          </button>
        ))}
      </div>

      {!shown.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-400">No history yet</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {shown.map((e, i) => {
            const type = HISTORY_TYPES[e.type] || { label: e.type, chip: 'bg-slate-100 text-slate-700', icon: CalendarClock };
            const Icon = type.icon;
            const label = e.type === 'Cancelled' ? (e.auto ? 'Auto-cancelled' : 'Cancelled') : type.label;
            return (
              <div key={`${e.student._id}-${e.at}-${i}`} className="flex flex-wrap items-start gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-3 last:border-b-0">
                <div className="w-36 shrink-0 text-xs tabular-nums text-slate-500">{fmtDateTime(e.at)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${type.chip}`}>
                      <Icon className="h-3 w-3"/>{label}
                    </span>
                    <button type="button" onClick={() => onOpen(e.student)} className="truncate font-semibold text-slate-900 hover:text-indigo-600 hover:underline">
                      {e.student.name}
                    </button>
                    <span className="truncate text-xs text-slate-500">
                      {[e.center?.name, [e.student.courseName, e.student.courseYear].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  {e.note && <div className="mt-0.5 text-xs text-slate-600">{e.note}</div>}
                </div>
                <div className="shrink-0 text-right text-xs">
                  <div className="font-semibold text-slate-800">{e.by?.name || '—'}</div>
                  {e.by?.role && <div className="text-slate-400">{e.by.role}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {total > limit && <p className="text-xs text-slate-400">Showing the latest {limit} of {total} entries.</p>}
    </div>
  );
}

// Admission payment timeline + admissions auto-cancelled for late payment.
// Counselors see their own centres (the server limits the list); Admin and Accountant see every centre.
export default function AdmissionTimelinePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const allCentres = ['Admin', 'Accountant'].includes(user?.role);
  const canRestore = ['Admin', 'Counselor', 'Accountant'].includes(user?.role);
  const canConfirm = ['Admin', 'Counselor', 'Accountant'].includes(user?.role);
  const [centers, setCenters] = useState([]);
  const [centerId, setCenterId] = useState('all');
  const [search, setSearch] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState({ key: null, rows: [], cancelled: [], days: {} });
  const [restoring, setRestoring] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [undoing, setUndoing] = useState(null);
  const [tab, setTab] = useState('timeline');
  const [hist, setHist] = useState({ key: null, events: [], total: 0, limit: 0 });
  const loadKey = `${centerId}:${reloadKey}`;
  const reload = () => setReloadKey(k => k + 1);

  useEffect(() => { centersApi.getAll().then(setCenters).catch(() => {}); }, []);

  useEffect(() => {
    let off = false;
    studentsApi.admissionTimeline(centerId === 'all' ? {} : { centerId })
      .then(res => { if (!off) setData({ key: loadKey, rows: res?.rows || [], cancelled: res?.cancelled || [], days: res?.days || {}, autoCancelFrom: res?.autoCancelFrom }); })
      .catch(e => { if (!off) { toast.error(e.message || 'Failed to load timeline'); setData({ key: loadKey, rows: [], cancelled: [], days: {} }); } });
    return () => { off = true; };
  }, [centerId, loadKey]);

  // History is loaded only when its tab is opened
  useEffect(() => {
    if (tab !== 'history') return undefined;
    let off = false;
    studentsApi.admissionHistory(centerId === 'all' ? {} : { centerId })
      .then(res => { if (!off) setHist({ key: loadKey, events: res?.events || [], total: res?.total || 0, limit: res?.limit || 0 }); })
      .catch(e => { if (!off) { toast.error(e.message || 'Failed to load history'); setHist({ key: loadKey, events: [], total: 0, limit: 0 }); } });
    return () => { off = true; };
  }, [tab, centerId, loadKey]);

  const loading = data.key !== loadKey;
  const q = search.trim().toLowerCase();
  const matches = r => !q || [r.name, r.phone, r.center?.name, r.courseName].some(v => String(v || '').toLowerCase().includes(q));
  const rows = data.rows.filter(matches);
  const cancelled = data.cancelled.filter(matches);
  const historyEvents = hist.events.filter(e => !q || [e.student?.name, e.center?.name, e.by?.name, e.note]
    .some(v => String(v || '').toLowerCase().includes(q)));
  const openStudent = r => navigate(`/students/${r._id}`);
  const allLabel = allCentres ? 'All centres' : 'All my centres';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <CalendarClock className="h-5 w-5 text-indigo-600"/>Admission Timeline
        </h1>
        <p className="text-xs text-muted-foreground">
          Admissions {allCentres ? 'across all centres' : 'in your centres'} whose course fee is not fully paid.
          {' '}Admissions submitted from {data.autoCancelFrom ? fmtDate(data.autoCancelFrom) : 'the rule start date'} are cancelled automatically at day 50; older ones only by hand.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
          <Input className="pl-9 pr-9" placeholder="Search student, phone, centre, course..." value={search} onChange={e => setSearch(e.target.value)}/>
          {search && (
            <button type="button" aria-label="Clear search" onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4"/>
            </button>
          )}
        </div>
        <Select value={centerId} onValueChange={setCenterId}>
          <SelectTrigger className="w-56"><SelectValue placeholder={allLabel}/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{allLabel}</SelectItem>
            {centers.map(c => <SelectItem key={c._id} value={c._id}>{c.name || c.organisationName}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="timeline"><CalendarClock className="mr-1.5 h-3.5 w-3.5"/>Timeline ({data.rows.length})</TabsTrigger>
          <TabsTrigger value="cancelled"><Ban className="mr-1.5 h-3.5 w-3.5"/>Auto-cancelled ({data.cancelled.length})</TabsTrigger>
          <TabsTrigger value="history"><History className="mr-1.5 h-3.5 w-3.5"/>History</TabsTrigger>
        </TabsList>
        <TabsContent value="timeline" className="mt-4">
          <AdmissionTimeline rows={rows} loading={loading} showCentre onOpen={openStudent} autoCancelFrom={data.autoCancelFrom}/>
        </TabsContent>
        <TabsContent value="cancelled" className="mt-4">
          {loading
            ? <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-300"/></div>
            : <CancelledList list={cancelled} canRestore={canRestore} canConfirm={canConfirm} onRestore={setRestoring} onConfirm={setConfirming} onUndo={setUndoing} onOpen={openStudent}/>}
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryList events={historyEvents} total={hist.total} limit={hist.limit} loading={hist.key !== loadKey} onOpen={openStudent}/>
        </TabsContent>
      </Tabs>

      {restoring && (
        <RestoreDialog
          student={restoring}
          graceDays={data.days.restoreGrace || 20}
          verifiedAtOnce={['Admin', 'Accountant'].includes(user?.role)}
          onClose={() => setRestoring(null)}
          onRestored={() => { setRestoring(null); reload(); }}
        />
      )}
      {confirming && (
        <UniversityCancelDialog
          student={confirming}
          onClose={() => setConfirming(null)}
          onDone={() => { setConfirming(null); reload(); }}
        />
      )}
      {undoing && (
        <UndoUniversityCancelDialog
          student={undoing}
          onClose={() => setUndoing(null)}
          onDone={() => { setUndoing(null); reload(); }}
        />
      )}
    </div>
  );
}

import { MEDIA } from '../lib/api';
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Archive, Building2, CheckCircle2, ClipboardCheck, Download, Eye, EyeOff, Hash, History,
  Loader2, Package, PackageCheck, RotateCcw, Search, Trash2, Truck, Undo2, Upload, User, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { docsApi, newInventoryApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { usePanelDismissals } from '@/lib/usePanelDismissals';
import { requestSection } from '@/lib/documentOptions';

// One page for two desks: a list of the documents at one stage on the left, the chosen one (or the selected ones)
// on the right with what to do next.
//   Inventory Desk (/inventory-desk): Requests (waiting for the university's courier) → Correction check → Upload scan
//     → In progress (counselor / centre payment) · Closed
//   Dispatch (/dispatch): Ready to dispatch → Dispatched

const fmtDt   = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const fmtFull = d => d ? new Date(d).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}) : '—';
const fmtMoney = value => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const STATUS_INFO = {
  Sent_To_University:    { label:'Requested / Awaiting Receipt', color:'bg-amber-100 text-amber-700' },
  University_Dispatched: { label:'Incoming Courier',         color:'bg-purple-100 text-purple-700' },
  Dispatch_Received:     { label:'Receipt Confirmed',         color:'bg-blue-100 text-blue-700' },
  Scanned:               { label:'Scanned',                   color:'bg-indigo-100 text-indigo-700' },
  Accountant_Received:   { label:'With Accountant',           color:'bg-orange-100 text-orange-700' },
  Counselor_Received:    { label:'With Counselor',            color:'bg-amber-100 text-amber-700' },
  Center_Notified:       { label:'Center Notified',           color:'bg-orange-100 text-orange-700' },
  Payment_Submitted:     { label:'Payment Submitted',         color:'bg-sky-100 text-sky-700' },
  Payment_Verified:      { label:'Payment Verified - Ready',  color:'bg-green-100 text-green-700' },
  Dispatched:            { label:'Dispatched to Center',      color:'bg-teal-100 text-teal-700' },
  Delivered:             { label:'Delivered',                 color:'bg-emerald-100 text-emerald-700' },
  Closed:                { label:'Closed',                    color:'bg-slate-200 text-slate-600' },
};

// one colour per stage (the same on every page)
const STAGES = [
  { key: 'requests',   label: 'Requests',          dot: 'bg-blue-600',   count: 'bg-blue-50 text-blue-700' },
  { key: 'check',      label: 'Correction check',  dot: 'bg-orange-600', count: 'bg-orange-50 text-orange-700' },
  { key: 'scan',       label: 'Upload scan',       dot: 'bg-violet-600', count: 'bg-violet-50 text-violet-700' },
  { key: 'progress',   label: 'In progress',       dot: 'bg-teal-600',   count: 'bg-teal-50 text-teal-700' },
  { key: 'ready',      label: 'Ready to dispatch', dot: 'bg-green-600',  count: 'bg-green-50 text-green-700' },
  { key: 'dispatched', label: 'Dispatched',        dot: 'bg-slate-500',  count: 'bg-slate-100 text-slate-700' },
  { key: 'closed',     label: 'Closed',            dot: 'bg-zinc-400',   count: 'bg-zinc-100 text-zinc-600' },
];
// which stages each desk works (Admin can open both pages)
const DESKS = {
  inventory: {
    title: 'Inventory Desk', sub: 'Documents from the university — mark received, check for corrections, upload the scan',
    stages: ['requests', 'check', 'scan', 'progress', 'closed'], dismissKey: 'inventory-desk',
  },
  dispatch: {
    title: 'Dispatch', sub: 'Payment verified documents — courier them to the centres',
    stages: ['ready', 'dispatched'], dismissKey: 'dispatch',
  },
};

const STAGE_NOTE = {
  requests:   "Waiting for the university's courier. When it arrives, mark it received: it goes into the student's New Inventory and on to the correction check.",
  check:      'Check each copy from the university. Correct: a soft copy goes to Upload Scan, a hard copy goes to Dispatch (Ready to dispatch). Wrong: send it back to the university.',
  scan:       'Scan and upload. The scan goes straight to the counselor and is kept with the document in the New Inventory.',
  progress:   'Scanned — with the counselor, then the centre. It goes to Dispatch when the centre requests the courier.',
  ready:      'Payment verified — courier it to the centre.',
  dispatched: "Couriered to the centre. If the centre has it but hasn't confirmed, mark it received by the centre.",
  closed:     'Requests closed here. Nothing was erased — reopen one to put it back where it was.',
};

const TAG = {
  marksheet:  'bg-violet-50 text-violet-700',
  other:      'bg-sky-50 text-sky-800',
  soft:       'bg-slate-100 text-slate-700',
  hard:       'bg-amber-50 text-amber-800',
  urgent:     'bg-red-50 text-red-700',
  correction: 'bg-orange-50 text-orange-700',
  ok:         'bg-emerald-50 text-emerald-700',
  inv:        'bg-indigo-50 text-indigo-700',
};

// urgent: the counselor's mark, or the older inventory "urgent request"
const isUrgentDoc = d => !!d.urgent || (d.statusHistory || []).some(h => h.status === 'Urgent_Requested');
const lastAt = (d, status) => [...(d.statusHistory || [])].reverse().find(h => h.status === status)?.at;
const stageSince = d => lastAt(d, d.status) || d.updatedAt || d.createdAt;
const inInventory = d => !!(d.receivedIntoInventory || d.inventoryItem);
const isHard = d => d.requestType === 'Hard Copy';
const isPaid = d => Number(d.chargeFee || 0) <= 0 || (d.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0) >= Number(d.chargeFee);
// waiting for its correction check (answered from the New Inventory: only if that document itself is not checked yet)
const needsCheck = d => d.status === 'Dispatch_Received' && !d.correctionCheckedAt && (!d.inventoryItem || d.inventoryCheckPending);

// where a document is, in words
function whereText(d) {
  switch (d.status) {
    case 'Sent_To_University':    return d.correctionOpen ? 'At the university for correction' : "Waiting for the university's courier";
    case 'University_Dispatched': return 'Courier on the way from the university';
    case 'Dispatch_Received':     return needsCheck(d) ? (d.correctionOpen ? 'Corrected copy — check it again' : 'Check it for corrections') : 'Ready to scan';
    case 'Scanned':
    case 'Counselor_Received':    return 'With the counselor';
    case 'Accountant_Received':   return 'With the accountant (older scan)';
    case 'Center_Notified':       return isPaid(d) ? 'With the centre — courier when it asks' : "Waiting for the centre's payment";
    case 'Payment_Submitted':     return 'Payment being verified';
    case 'Payment_Verified':      return 'Ready to dispatch';
    case 'Dispatched':            return 'Couriered — the centre to confirm';
    case 'Delivered':             return 'Received by the centre';
    case 'Closed':                return 'Closed';
    default:                      return String(d.status || '').replace(/_/g, ' ');
  }
}

function docTags(d) {
  const tags = [];
  tags.push(requestSection(d) === 'Marksheet' ? { k: 'sec', tone: TAG.marksheet, label: 'Marksheet' } : { k: 'sec', tone: TAG.other, label: 'Other' });
  tags.push(isHard(d) ? { k: 'copy', tone: TAG.hard, label: 'Hard copy' } : { k: 'copy', tone: TAG.soft, label: 'Soft copy' });
  if (isUrgentDoc(d)) tags.push({ k: 'urgent', tone: TAG.urgent, label: 'Urgent' });
  if (d.correctionOpen && ['Sent_To_University', 'University_Dispatched'].includes(d.status)) tags.push({ k: 'corr', tone: TAG.correction, label: `Sent for correction${d.correctionCount > 1 ? ` ×${d.correctionCount}` : ''}` });
  if (d.correctionOpen && d.status === 'Dispatch_Received') tags.push({ k: 'corr', tone: TAG.correction, label: 'Corrected copy' });
  if (d.correctionCheckedAt && !['Sent_To_University', 'University_Dispatched'].includes(d.status)) tags.push({ k: 'checked', tone: TAG.ok, label: 'Correction checked' });
  if (inInventory(d) && ['Dispatch_Received', 'Scanned', 'Counselor_Received', 'Payment_Verified'].includes(d.status)) tags.push({ k: 'inv', tone: TAG.inv, label: 'In inventory' });
  return tags;
}

function Tag({ tone, children }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{children}</span>;
}

function WaitBadge({ since, now }) {
  if (!since) return null;
  const days = Math.max(0, Math.floor((now - new Date(since).getTime()) / 86400000));
  const tone = days >= 14 ? 'bg-red-50 text-red-700' : days >= 7 ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-600';
  return <span className={`shrink-0 self-start rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${tone}`} title={`Waiting since ${fmtDt(since)}`}>{days === 0 ? 'today' : `${days} d`}</span>;
}

// ── "Where it is": the steps a document goes through ──
const STEPS = [
  { key: 'req',    label: 'Requested',          at: d => d.createdAt },
  { key: 'uni',    label: 'At university',      at: d => lastAt(d, 'Sent_To_University') },
  { key: 'check',  label: 'Check',              at: d => lastAt(d, 'Dispatch_Received') },
  { key: 'scan',   label: 'Scan',               at: d => lastAt(d, 'Scanned') },
  { key: 'centre', label: 'Counselor',          at: d => lastAt(d, 'Counselor_Received') || lastAt(d, 'Center_Notified') },
  { key: 'ready',  label: 'Ready',              at: d => lastAt(d, 'Payment_Verified') },
  { key: 'sent',   label: 'Dispatched',         at: d => lastAt(d, 'Dispatched') },
  { key: 'got',    label: 'With centre',        at: d => lastAt(d, 'Delivered') },
];
function stepKey(d) {
  const s = d.status === 'Closed' ? d.closedFromStatus : d.status;
  switch (s) {
    case 'Sent_To_University': case 'University_Dispatched': return 'uni';
    case 'Dispatch_Received': return needsCheck({ ...d, status: 'Dispatch_Received' }) ? 'check' : (isHard(d) ? 'ready' : 'scan');
    case 'Scanned': case 'Accountant_Received': case 'Counselor_Received': case 'Center_Notified': case 'Payment_Submitted': return 'centre';
    case 'Payment_Verified': return 'ready';
    case 'Dispatched': return 'sent';
    case 'Delivered': return 'done';
    default: return 'req';
  }
}
function Progress({ doc }) {
  const steps = STEPS.filter(s => !(s.key === 'scan' && isHard(doc)));   // a hard copy is not scanned
  const cur = stepKey(doc);
  const idx = cur === 'done' ? steps.length : steps.findIndex(s => s.key === cur);
  return (
    <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((s, i) => {
        const done = i < idx;
        const now = i === idx && doc.status !== 'Closed';
        const at = done || now ? s.at(doc) : null;
        return (
          <li key={s.key} className="flex min-w-0 flex-col gap-1">
            <span className={`h-1.5 rounded-full ${done ? 'bg-emerald-500' : now ? 'bg-indigo-600' : 'bg-slate-200'}`}/>
            <span className={`truncate text-[11px] font-semibold ${now ? 'text-indigo-700' : done ? 'text-slate-700' : 'text-slate-400'}`} title={s.label}>{s.label}</span>
            {at && <span className="truncate text-[10px] text-slate-500">{fmtDt(at)}</span>}
          </li>
        );
      })}
    </ol>
  );
}

// ── Full Document Detail Modal ───────────────────────────────
function DocDetailModal({ doc, onClose }) {
  if (!doc) return null;
  const st = STATUS_INFO[doc.status] || { label: doc.status, color: 'bg-gray-100 text-gray-700' };
  const courseFee = doc.courseFeeSummary;
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4"/>
            {doc.name}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="bg-muted/30 rounded-lg p-3 grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3"/>Student</div>
              <div className="font-medium">{doc.student?.name || '—'}</div>
              {doc.student?.enrollmentNumber && <div className="text-xs font-mono text-emerald-700">{doc.student.enrollmentNumber}</div>}
            </div>
            <div>
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3"/>Center</div>
              <div className="font-medium">{doc.center?.name || '—'}</div>
            </div>
            {doc.type && <div><div className="text-xs text-muted-foreground">Type</div><div>{doc.type}</div></div>}
            {doc.note && <div className="col-span-2"><div className="text-xs text-muted-foreground">Note</div><div>{doc.note}</div></div>}
          </div>
          {doc.scannedUrl && (
            <div className="border rounded-lg p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Scanned Copy</p>
              <a href={`${MEDIA}${doc.scannedUrl}`} target="_blank" rel="noreferrer" className="text-blue-600 underline text-sm flex items-center gap-1">
                <Download className="h-3.5 w-3.5"/>{doc.scannedName || 'View scanned document'}
              </a>
            </div>
          )}
          {doc.courierInfo?.trackingNo && (
            <div className="border border-purple-200 bg-purple-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">University Courier Details</p>
              {doc.university?.name && (
                <div className="mb-2 bg-purple-100 rounded px-2 py-1.5 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">From University:</span>
                  <span className="font-semibold text-purple-800">{doc.university.name}</span>
                  {doc.university.shortName && <span className="text-xs text-purple-600">({doc.university.shortName})</span>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div><div className="text-xs text-muted-foreground">Company</div><div className="font-medium">{doc.courierInfo.company || '—'}</div></div>
                <div><div className="text-xs text-muted-foreground flex items-center gap-1"><Hash className="h-3 w-3"/>Tracking No.</div><div className="font-medium font-mono">{doc.courierInfo.trackingNo}</div></div>
                <div><div className="text-xs text-muted-foreground">Dispatch Date</div><div className="font-medium">{fmtDt(doc.courierInfo.dispatchDate)}</div></div>
                <div><div className="text-xs text-muted-foreground">Documents</div><div>{doc.courierInfo.documentsDesc || '—'}</div></div>
              </div>
            </div>
          )}
          {doc.centerCourierInfo?.trackingNo && (
            <div className="border border-teal-200 bg-teal-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-2">Dispatched to Center</p>
              <div className="grid grid-cols-2 gap-2">
                <div><div className="text-xs text-muted-foreground">Company</div><div className="font-medium">{doc.centerCourierInfo.company || '—'}</div></div>
                <div><div className="text-xs text-muted-foreground flex items-center gap-1"><Hash className="h-3 w-3"/>Tracking No.</div><div className="font-medium font-mono">{doc.centerCourierInfo.trackingNo}</div></div>
                <div><div className="text-xs text-muted-foreground">Dispatch Date</div><div className="font-medium">{fmtDt(doc.centerCourierInfo.dispatchDate)}</div></div>
                <div><div className="text-xs text-muted-foreground">Documents</div><div>{doc.centerCourierInfo.documentsDesc || '—'}</div></div>
              </div>
            </div>
          )}
          {courseFee && (
            <div className="border rounded-lg p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Course Fee</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-muted/30 rounded px-2 py-1.5"><div className="text-xs text-muted-foreground">Total</div><div className="font-bold">{fmtMoney(courseFee.totalFee ?? courseFee.netFee)}</div></div>
                <div className="bg-blue-50 rounded px-2 py-1.5"><div className="text-xs text-muted-foreground">Net</div><div className="font-bold text-blue-700">{fmtMoney(courseFee.netFee)}</div></div>
                <div className="bg-emerald-50 rounded px-2 py-1.5"><div className="text-xs text-muted-foreground">Paid</div><div className="font-bold text-emerald-700">{fmtMoney(courseFee.paidAmount)}</div></div>
                <div className={`rounded px-2 py-1.5 ${Number(courseFee.dueAmount || 0) > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                  <div className="text-xs text-muted-foreground">Balance</div>
                  <div className={`font-bold ${Number(courseFee.dueAmount || 0) > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{fmtMoney(courseFee.dueAmount)}</div>
                </div>
              </div>
            </div>
          )}
          {(doc.chargeFee > 0 || doc.totalPaid > 0) && (
            <div className="border rounded-lg p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payment</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-muted/30 rounded px-2 py-1.5"><div className="text-xs text-muted-foreground">Charge</div><div className="font-bold">{fmtMoney(doc.chargeFee)}</div></div>
                <div className="bg-emerald-50 rounded px-2 py-1.5"><div className="text-xs text-muted-foreground">Paid</div><div className="font-bold text-emerald-700">{fmtMoney(doc.totalPaid)}</div></div>
                <div className={`rounded px-2 py-1.5 ${doc.chargeFee > doc.totalPaid ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                  <div className="text-xs text-muted-foreground">Due</div>
                  <div className={`font-bold ${doc.chargeFee > doc.totalPaid ? 'text-amber-700' : 'text-emerald-700'}`}>{fmtMoney(Math.max(0, (doc.chargeFee || 0) - (doc.totalPaid || 0)))}</div>
                </div>
              </div>
              {doc.payments?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {doc.payments.map(p => (
                    <div key={p._id} className="text-xs flex gap-2 bg-muted/20 rounded px-2 py-1">
                      <span className="font-medium text-emerald-700">{fmtMoney(p.amount)}</span>
                      {p.mode && <span>{p.mode}</span>}
                      {p.utrRef && <span className="font-mono">UTR: {p.utrRef}</span>}
                      <span className="ml-auto text-muted-foreground">{fmtDt(p.paidAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {doc.statusHistory?.length > 0 && (
            <div className="border rounded-lg p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <History className="h-3.5 w-3.5"/>Complete History
              </p>
              <div className="space-y-1.5">
                {doc.statusHistory.map((h, i) => {
                  const info = STATUS_INFO[h.status] || { label: String(h.status || '').replace(/_/g, ' '), color: 'bg-gray-100 text-gray-700' };
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${i === 0 ? 'bg-muted-foreground' : 'bg-primary'}`}/>
                      <div className="flex-1">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${info.color}`}>{info.label}</span>
                        {h.note && <span className="text-muted-foreground ml-1">· {h.note}</span>}
                        {h.changedBy?.name && <span className="text-muted-foreground ml-1">by {h.changedBy.name}</span>}
                      </div>
                      <span className="text-muted-foreground whitespace-nowrap flex-shrink-0">{fmtFull(h.at)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── The forms in the right panel (each keeps its own fields; a new document or selection starts it afresh) ──
const fieldCls = 'mt-1 h-10 border-slate-200';

function ReceiveForm({ count, busy, onSubmit }) {
  const [f, setF] = useState({ receivedAt: todayInput(), company: '', trackingNo: '', note: '' });
  const set = patch => setF(p => ({ ...p, ...patch }));
  function submit(e) {
    e.preventDefault();
    if (!f.receivedAt) return toast.error('Choose the date it was received');
    if (f.receivedAt > todayInput()) return toast.error('The received date cannot be in the future');
    onSubmit(f);
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><PackageCheck className="h-4 w-4 text-indigo-600"/>Courier arrived?</div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><Label className="text-xs font-semibold text-slate-600">Received on *</Label><Input type="date" max={todayInput()} value={f.receivedAt} onChange={e => set({ receivedAt: e.target.value })} className={fieldCls}/></div>
        <div><Label className="text-xs font-semibold text-slate-600">Courier (optional)</Label><Input value={f.company} maxLength={80} onChange={e => set({ company: e.target.value })} placeholder="BlueDart, DTDC…" className={fieldCls}/></div>
        <div><Label className="text-xs font-semibold text-slate-600">Tracking no. (optional)</Label><Input value={f.trackingNo} maxLength={80} onChange={e => set({ trackingNo: e.target.value })} placeholder="e.g. BD123456" className={fieldCls}/></div>
      </div>
      <div><Label className="text-xs font-semibold text-slate-600">Note</Label><Input value={f.note} maxLength={300} onChange={e => set({ note: e.target.value })} placeholder="Optional" className={fieldCls}/></div>
      {count > 1 && <p className="text-xs text-slate-500">The same date and courier are saved for all {count}.</p>}
      <Button type="submit" disabled={busy} className="h-11 w-full bg-indigo-600 text-base hover:bg-indigo-700 sm:w-auto">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PackageCheck className="mr-2 h-4 w-4"/>}
        {count > 1 ? `Mark ${count} received` : 'Mark received'} → Correction check
      </Button>
    </form>
  );
}

// opens on a button: what was wrong is required
function SendBackForm({ count, busy, onSubmit }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  if (!open) {
    return (
      <Button type="button" variant="outline" className="h-10 border-amber-300 text-amber-800 hover:bg-amber-50" onClick={() => setOpen(true)}>
        <Undo2 className="mr-1.5 h-4 w-4"/>Send back to University{count > 1 ? ` (${count})` : ''}
      </Button>
    );
  }
  return (
    <form onSubmit={e => { e.preventDefault(); if (!note.trim()) return toast.error('Write what needs to be corrected'); onSubmit(note.trim()); }}
      className="w-full space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <Label className="text-xs font-semibold text-amber-900">What needs to be corrected? *</Label>
      <Input autoFocus value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="e.g. Father's name misspelt" className="h-10 border-amber-200 bg-white"/>
      <p className="text-xs text-amber-800">It goes to the university's Correction Needed tab, and back to Requests here marked "Sent for correction".</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy} className="bg-amber-600 hover:bg-amber-700">{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/>}Send back to University</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

// Delete = close (nothing erased, can be reopened); opens on a button with an optional reason
function CloseForm({ count, busy, onSubmit }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) {
    return (
      <Button type="button" variant="outline" className="h-10 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setOpen(true)}>
        <Trash2 className="mr-1.5 h-4 w-4"/>{count > 1 ? `Close ${count} requests` : 'Close request'}
      </Button>
    );
  }
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(reason.trim()); }} className="w-full space-y-2 rounded-xl border border-red-200 bg-red-50/50 p-3">
      <Label className="text-xs font-semibold text-red-800">Reason (optional)</Label>
      <Input autoFocus value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="e.g. very old request, not moving" className="h-10 border-red-200 bg-white"/>
      <p className="text-xs text-red-800">Marked Closed: it leaves this desk and the university's list. History and payments stay; reopen it any time from Closed.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy} className="bg-red-600 hover:bg-red-700">{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/>}{count > 1 ? `Close ${count} requests` : 'Close request'}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

function ScanForm({ busy, onSubmit }) {
  const [file, setFile] = useState(null);
  return (
    <form onSubmit={e => { e.preventDefault(); if (!file) return toast.error('Choose the scan file'); onSubmit(file); }} className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Upload className="h-4 w-4 text-violet-600"/>Upload the scan</div>
      <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setFile(e.target.files?.[0] || null)} aria-label="Scan file"
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-violet-700"/>
      <p className="text-xs text-slate-500">It goes straight to the counselor and is kept with the document in the student's New Inventory.</p>
      <Button type="submit" disabled={busy} className="h-11 bg-violet-600 text-base hover:bg-violet-700">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Upload className="mr-2 h-4 w-4"/>}Upload scan → Counselor
      </Button>
    </form>
  );
}

function DispatchForm({ docs, busy, onSubmit }) {
  const [f, setF] = useState({ company: '', trackingNo: '', dispatchDate: todayInput(), documentsDesc: docs.map(d => d.name).join(', ') });
  const set = patch => setF(p => ({ ...p, ...patch }));
  function submit(e) {
    e.preventDefault();
    if (!f.company.trim()) return toast.error('Courier company required');
    if (!f.trackingNo.trim()) return toast.error('Tracking number required');
    onSubmit(f);
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Truck className="h-4 w-4 text-green-600"/>Courier to the centre</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label className="text-xs font-semibold text-slate-600">Courier company *</Label><Input value={f.company} onChange={e => set({ company: e.target.value })} placeholder="BlueDart, DTDC…" className={fieldCls}/></div>
        <div><Label className="text-xs font-semibold text-slate-600">Tracking no. *</Label><Input value={f.trackingNo} onChange={e => set({ trackingNo: e.target.value })} placeholder="e.g. BD123456789" className={fieldCls}/></div>
        <div><Label className="text-xs font-semibold text-slate-600">Dispatch date</Label><Input type="date" value={f.dispatchDate} onChange={e => set({ dispatchDate: e.target.value })} className={fieldCls}/></div>
        <div><Label className="text-xs font-semibold text-slate-600">Documents description</Label><Input value={f.documentsDesc} onChange={e => set({ documentsDesc: e.target.value })} className={fieldCls}/></div>
      </div>
      <p className="text-xs text-slate-500">The counselor and the centre get the courier details.</p>
      <Button type="submit" disabled={busy} className="h-11 bg-green-600 text-base hover:bg-green-700">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Truck className="mr-2 h-4 w-4"/>}{docs.length > 1 ? `Dispatch ${docs.length} documents` : 'Dispatch to centre'}
      </Button>
    </form>
  );
}

// ── One row of the list ──
function ListRow({ entry, active, selectable, selected, onToggle, onOpen, now }) {
  const isInv = entry.kind === 'inv';
  const d = entry.item;
  const tags = isInv ? [{ k: 'sec', tone: TAG.marksheet, label: 'Marksheet' }, { k: 'inv', tone: TAG.inv, label: 'Added to inventory' }] : docTags(d);
  const sub = isInv ? `${d.student?.name || '—'}${d.center?.name ? ` · ${d.center.name}` : ''}` : `${d.student?.name || '—'}${d.center?.name ? ` · ${d.center.name}` : ''}`;
  return (
    <li className={`flex gap-2.5 rounded-xl border p-2.5 transition-colors ${active ? 'border-indigo-300 bg-indigo-50/70' : 'border-transparent hover:bg-slate-50'}`}>
      {selectable && (
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${d.name}`} className="mt-1 h-4 w-4 shrink-0 accent-indigo-600"/>
      )}
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 gap-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">{d.name}</span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">{sub}</span>
          <span className="mt-1.5 flex flex-wrap gap-1">{tags.map(t => <Tag key={t.k + t.label} tone={t.tone}>{t.label}</Tag>)}</span>
        </span>
        <WaitBadge since={isInv ? d.createdAt : stageSince(d)} now={now}/>
      </button>
    </li>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function DispatchPage({ mode = 'dispatch' }) {
  const desk = DESKS[mode] || DESKS.dispatch;
  const isInventoryDesk = desk === DESKS.inventory;
  const { user } = useAuth();
  const { dismiss, isDismissed } = usePanelDismissals(user, desk.dismissKey);
  const [now] = useState(() => Date.now());
  const [all,     setAll]     = useState([]);
  const [invToCheck, setInvToCheck] = useState([]);   // marksheets added straight to the New Inventory, to check
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [detailDoc, setDetailDoc] = useState(null);
  const [search,  setSearch]  = useState('');
  const [stage,   setStage]   = useState(desk.stages[0]);
  const [reqFilter, setReqFilter] = useState('all');        // Requests: all | Marksheet | Other | urgent
  const [dispFilter, setDispFilter] = useState('awaiting');  // Dispatched: awaiting the centre's receipt | all
  const [focusId, setFocusId] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [docs, pendingInv] = await Promise.all([
        docsApi.list({ all: '1' }),
        isInventoryDesk ? newInventoryApi.checkPending().catch(() => ({ items: [] })) : { items: [] },
      ]);
      setAll(docs);
      setInvToCheck(pendingInv?.items || []);
    } catch (e) {
      console.error('DispatchPage load failed', e);
      toast.error(e?.message || 'Failed to load the documents');
    } finally { setLoading(false); }
  }, [isInventoryDesk]);
  useEffect(() => { load(); }, [load]);

  // ── the lists ──
  const q = search.trim().toLowerCase();
  const matches = d => !q || [d.name, d.student?.name, d.student?.enrollmentNumber, d.center?.name, d.courierInfo?.trackingNo, d.centerCourierInfo?.trackingNo]
    .some(v => String(v || '').toLowerCase().includes(q));
  const visible = all.filter(d => !isDismissed(`doc:${d._id}`)).filter(matches);
  const oldestFirst = (a, b) => new Date(stageSince(a) || 0) - new Date(stageSince(b) || 0);
  const urgentThenOldest = (a, b) => (Number(isUrgentDoc(b)) - Number(isUrgentDoc(a))) || oldestFirst(a, b);
  const asDocs = list => list.map(item => ({ kind: 'doc', id: String(item._id), item }));

  const requests   = visible.filter(d => ['Sent_To_University', 'University_Dispatched'].includes(d.status)).sort(urgentThenOldest);
  const checkDocs  = visible.filter(needsCheck).sort(urgentThenOldest);
  const invCheck   = invToCheck.filter(i => !q || [i.name, i.student?.name, i.student?.enrollmentNumber, i.center?.name].some(v => String(v || '').toLowerCase().includes(q)));
  const scanDocs   = visible.filter(d => d.status === 'Dispatch_Received' && !needsCheck(d)).sort(urgentThenOldest);
  const progress   = visible.filter(d => ['Scanned', 'Accountant_Received', 'Counselor_Received', 'Center_Notified', 'Payment_Submitted'].includes(d.status)).sort(oldestFirst);
  const ready      = visible.filter(d => d.status === 'Payment_Verified').sort(urgentThenOldest);
  const dispatched = visible.filter(d => ['Dispatched', 'Delivered'].includes(d.status))
    .sort((a, b) => (Number(b.status === 'Dispatched') - Number(a.status === 'Dispatched')) || new Date(stageSince(b) || 0) - new Date(stageSince(a) || 0));
  const closed     = visible.filter(d => d.status === 'Closed').sort((a, b) => new Date(b.closedAt || 0) - new Date(a.closedAt || 0));

  const counts = {
    requests: requests.length, check: checkDocs.length + invCheck.length, scan: scanDocs.length, progress: progress.length,
    ready: ready.length, dispatched: dispatched.filter(d => d.status === 'Dispatched').length, closed: 0,
  };
  const urgentRequests = requests.filter(isUrgentDoc).length;

  const listFor = key => {
    switch (key) {
      case 'requests': return asDocs(requests.filter(d => reqFilter === 'all' || (reqFilter === 'urgent' ? isUrgentDoc(d) : requestSection(d) === reqFilter)));
      case 'check':    return [...asDocs(checkDocs), ...invCheck.map(item => ({ kind: 'inv', id: String(item._id), item }))];
      case 'scan':     return asDocs(scanDocs);
      case 'progress': return asDocs(progress);
      case 'ready':    return asDocs(ready);
      case 'dispatched': return asDocs(dispFilter === 'all' ? dispatched : dispatched.filter(d => d.status === 'Dispatched'));
      case 'closed':   return asDocs(closed);
      default:         return [];
    }
  };
  const list = listFor(stage);
  // which rows can be ticked for a bulk action
  const canSelect = e => stage !== 'progress' && !(stage === 'dispatched' && e.item.status !== 'Dispatched');
  const selectable = list.filter(canSelect);
  const selected = selectable.filter(e => selectedIds.includes(e.id));
  const focused = list.find(e => e.id === focusId) || list[0] || null;

  function goStage(key) { setStage(key); setSelectedIds([]); setFocusId(''); }
  function toggle(id) { setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])); }
  function toggleAll(on) {
    const ids = selectable.map(e => e.id);
    setSelectedIds(prev => (on ? [...new Set([...prev, ...ids])] : prev.filter(x => !ids.includes(x))));
  }

  // ── actions (each: one or many; on success the list reloads and the done ones leave the selection) ──
  async function run(fn) {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  const nameOf = (docs, id) => docs.find(d => String(d._id) === String(id))?.name;
  function report(docs, done, failed, one, many) {
    if (done.length === 1) toast.success(`${nameOf(docs, done[0]) || 'Document'} ${one}`);
    else if (done.length > 1) toast.success(`${done.length} documents ${many}`);
    (failed || []).forEach(f => toast.error(`${f.name || nameOf(docs, f.id) || 'A document'}: ${f.error}`));
    setSelectedIds(prev => prev.filter(id => !done.includes(id)));
    load();
  }

  const receive = (docs, f) => run(async () => {
    const res = await docsApi.dispatchReceiveMany({
      ids: docs.map(d => d._id),
      ...(f.receivedAt !== todayInput() ? { receivedAt: f.receivedAt } : {}),   // today: the time now
      company: f.company.trim(), trackingNo: f.trackingNo.trim(), note: f.note.trim(),
    });
    report(docs, res.received || [], res.failed, 'received — in the New Inventory, now in Correction check', 'received — in the New Inventory, now in Correction check');
  });
  const closeDocs = (docs, reason) => run(async () => {
    const res = await docsApi.closeRequests({ ids: docs.map(d => d._id), reason });
    report(docs, res.closed || [], res.failed, 'closed — it is under Closed', 'closed — they are under Closed');
  });
  const reopen = docs => run(async () => {
    const res = await docsApi.reopenRequests({ ids: docs.map(d => d._id) });
    report(docs, res.reopened || [], res.failed, 'reopened — back where it was', 'reopened — back where they were');
  });
  const checkDocsDone = docs => run(async () => {
    const res = await docsApi.correctionChecked({ ids: docs.map(d => d._id) });
    const where = Object.values(res.next || {});
    const n = k => where.filter(x => x === k).length;
    const parts = [n('scan') && `${n('scan')} to Upload scan`, n('dispatch') && `${n('dispatch')} to Dispatch (ready to dispatch)`, n('payment') && `${n('payment')} waiting for the centre's payment`].filter(Boolean).join(', ');
    report(docs, res.checked || [], res.failed, `checked — ${parts}`, `checked — ${parts}`);
  });
  const checkInventory = items => run(async () => {
    const res = await newInventoryApi.correctionChecked({ ids: items.map(i => i._id) });
    report(items, res.checked || [], res.failed, 'checked — kept in the New Inventory', 'checked — kept in the New Inventory');
  });
  const sendBack = (docs, note) => run(async () => {
    const res = await docsApi.sendForCorrection({ ids: docs.map(d => d._id), note });
    report(docs, res.sent || [], res.failed, 'sent back to the university for correction', 'sent back to the university for correction');
  });
  const uploadScan = (doc, file) => run(async () => {
    const fd = new FormData();
    fd.append('file', file);
    await docsApi.uploadScan(doc._id, fd);
    toast.success(`${doc.name}: scan uploaded — sent to the counselor`);
    load();
  });
  const dispatchDocs = (docs, f) => run(async () => {
    for (const doc of docs) {
      await docsApi.dispatchToCenter(doc._id, {
        ...f,
        documentsDesc: f.documentsDesc || docs.map(x => x.name).join(', '),
        dispatchDate: f.dispatchDate ? new Date(f.dispatchDate) : new Date(),
      });
    }
    toast.success(docs.length > 1 ? `${docs.length} documents dispatched. Counselor & centre notified.` : 'Dispatched! Counselor & centre notified.');
    setSelectedIds([]);
    load();
  });
  const centreReceived = docs => run(async () => {
    const res = await docsApi.centreReceivedMany({ ids: docs.map(d => d._id) });
    report(docs, res.received || [], res.failed, 'marked received by the centre', 'marked received by the centre');
  });

  // ── right panel: what to do with the selected ones / the open one ──
  function renderBulk() {
    const docs = selected.filter(e => e.kind === 'doc').map(e => e.item);
    const items = selected.filter(e => e.kind === 'inv').map(e => e.item);
    const n = selected.length;
    const key = selected.map(e => e.id).join(',');
    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">{n} selected</h2>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}><X className="mr-1 h-4 w-4"/>Clear</Button>
        </div>
        <ul className="max-h-48 divide-y overflow-y-auto rounded-xl border border-slate-200 text-sm">
          {selected.map(e => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="truncate font-medium">{e.item.name}</span>
              <span className="shrink-0 text-xs text-slate-500">{e.item.student?.name}</span>
            </li>
          ))}
        </ul>
        {stage === 'requests' && (
          <>
            <ReceiveForm key={`r-${key}`} count={n} busy={busy} onSubmit={f => receive(docs, f)}/>
            <div className="border-t pt-3"><CloseForm key={`c-${key}`} count={n} busy={busy} onSubmit={reason => closeDocs(docs, reason)}/></div>
          </>
        )}
        {stage === 'check' && (
          <div className="flex flex-wrap items-start gap-2">
            <Button className="h-10 bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => { if (docs.length) checkDocsDone(docs); if (items.length) checkInventory(items); }}>
              <ClipboardCheck className="mr-1.5 h-4 w-4"/>Correction checked ({n})
            </Button>
            {docs.length > 0 && <SendBackForm key={`s-${key}`} count={docs.length} busy={busy} onSubmit={note => sendBack(docs, note)}/>}
            {docs.length > 0 && <CloseForm key={`c-${key}`} count={docs.length} busy={busy} onSubmit={reason => closeDocs(docs, reason)}/>}
            {items.length > 0 && docs.length > 0 && <p className="w-full text-xs text-slate-500">Sending back and closing are for requests only — the {items.length} marksheet{items.length === 1 ? '' : 's'} added to the inventory can only be checked.</p>}
          </div>
        )}
        {stage === 'scan' && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Scans are uploaded one at a time — open a document to upload its scan.</p>
            <CloseForm key={`c-${key}`} count={n} busy={busy} onSubmit={reason => closeDocs(docs, reason)}/>
          </div>
        )}
        {stage === 'ready' && <DispatchForm key={`d-${key}`} docs={docs} busy={busy} onSubmit={f => dispatchDocs(docs, f)}/>}
        {stage === 'dispatched' && (
          <Button className="h-11 bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => centreReceived(docs)}>
            <CheckCircle2 className="mr-2 h-4 w-4"/>Received by centre ({n})
          </Button>
        )}
        {stage === 'closed' && (
          <Button className="h-11" disabled={busy} onClick={() => reopen(docs)}><RotateCcw className="mr-2 h-4 w-4"/>Reopen ({n})</Button>
        )}
      </div>
    );
  }

  function renderInventoryItem(i) {
    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900">{i.name}</h2>
          <div className="flex flex-wrap gap-1.5"><Tag tone="bg-orange-50 text-orange-700">Check it for corrections</Tag><Tag tone={TAG.marksheet}>Marksheet</Tag><Tag tone={TAG.inv}>Added to the New Inventory</Tag></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 rounded-xl bg-slate-50 p-3.5">
            <div className="text-xs font-semibold text-slate-500">Student</div>
            <div className="font-semibold">{i.student?.name || '—'}</div>
            <div className="text-sm text-slate-600">{[i.student?.enrollmentNumber, i.student?.courseName, i.center?.name].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="space-y-1 rounded-xl bg-slate-50 p-3.5">
            <div className="text-xs font-semibold text-slate-500">Added</div>
            <div className="font-semibold">{fmtDt(i.createdAt)}</div>
            <div className="text-sm text-slate-600">{i.addedBy?.name ? `by ${i.addedBy.name}` : ''}{i.note ? ` · “${i.note}”` : ''}</div>
          </div>
        </div>
        <p className="text-sm text-slate-600">Marked received from the university when it was added. Checked, it stays in the New Inventory until a centre requests it.</p>
        <div className="flex flex-wrap gap-2">
          <Button className="h-11 bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => checkInventory([i])}><ClipboardCheck className="mr-2 h-4 w-4"/>Correction checked</Button>
          {i.student?._id && <Button asChild variant="outline" className="h-11"><Link to={`/new-inventory/${i.student._id}`}><Archive className="mr-2 h-4 w-4"/>Open in New Inventory</Link></Button>}
        </div>
      </div>
    );
  }

  function renderDoc(d) {
    const charge = Number(d.chargeFee || 0);
    const paid = Number(d.totalPaid || (d.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0));
    const due = Math.max(0, charge - paid);
    const cf = d.courseFeeSummary;
    const hideable = ['progress', 'ready', 'dispatched'].includes(stage);
    return (
      <div className="space-y-4">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <h2 className="text-xl font-bold text-slate-900">{d.name}</h2>
              <div className="flex flex-wrap gap-1.5">
                <Tag tone="bg-indigo-50 text-indigo-700">{whereText(d)}</Tag>
                {docTags(d).map(t => <Tag key={t.k + t.label} tone={t.tone}>{t.label}</Tag>)}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {hideable && (
                <Button variant="ghost" size="sm" className="text-slate-500" title="Hide it from your list (on this browser)" onClick={() => { dismiss(`doc:${d._id}`); setFocusId(''); }}>
                  <EyeOff className="mr-1 h-4 w-4"/>Hide
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setDetailDoc(d)}><Eye className="mr-1 h-4 w-4"/>Full details</Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 rounded-xl bg-slate-50 p-3.5">
              <div className="text-xs font-semibold text-slate-500">Student</div>
              <div className="font-semibold">{d.student?.name || '—'}</div>
              <div className="text-sm text-slate-600">{[d.student?.enrollmentNumber, d.student?.courseName, d.center?.name].filter(Boolean).join(' · ')}</div>
              {cf && <div className="text-xs text-slate-500">Course fee: paid {fmtMoney(cf.paidAmount)} of {fmtMoney(cf.netFee)} · balance <b className={Number(cf.dueAmount) > 0 ? 'text-amber-700' : 'text-emerald-700'}>{fmtMoney(cf.dueAmount)}</b></div>}
            </div>
            <div className="space-y-1 rounded-xl bg-slate-50 p-3.5">
              <div className="text-xs font-semibold text-slate-500">Document fee</div>
              {charge > 0 || paid > 0 ? (
                <>
                  <div className="font-semibold">{fmtMoney(paid)} paid of {fmtMoney(charge)}</div>
                  <div className={`text-sm font-semibold ${due > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{due > 0 ? `${fmtMoney(due)} due` : 'Fully paid'}</div>
                </>
              ) : <div className="text-sm text-slate-500">No charge</div>}
            </div>
          </div>

          {d.correctionOpen && d.correctionNote && (
            <div className="rounded-xl border border-orange-200 bg-orange-50/70 px-3.5 py-2.5 text-sm text-orange-900">
              <b>Correction:</b> {d.correctionNote} <span className="text-orange-700">· sent back {fmtDt(d.correctionSentAt)}{d.correctionCount > 1 ? ` · ${d.correctionCount} times` : ''}</span>
            </div>
          )}
          {d.status === 'Closed' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
              Closed {fmtDt(d.closedAt)}{d.closedBy?.name ? ` by ${d.closedBy.name}` : ''}{d.closedFromStatus ? ` · was ${whereText({ ...d, status: d.closedFromStatus }).toLowerCase()}` : ''}{d.closedReason ? ` · “${d.closedReason}”` : ''}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Where it is</h3>
            <Progress doc={d}/>
          </div>

          {(d.scannedUrl || d.courierInfo?.trackingNo || d.centerCourierInfo?.trackingNo) && (
            <div className="flex flex-wrap gap-2 text-xs">
              {d.scannedUrl && <a href={`${MEDIA}${d.scannedUrl}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-indigo-700 hover:bg-indigo-50"><Download className="h-3.5 w-3.5"/>{d.scannedName || 'Scanned copy'}</a>}
              {d.courierInfo?.trackingNo && <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-slate-600"><Truck className="h-3.5 w-3.5"/>From university: {d.courierInfo.company} · <span className="font-mono">{d.courierInfo.trackingNo}</span></span>}
              {d.centerCourierInfo?.trackingNo && <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-slate-600"><Truck className="h-3.5 w-3.5"/>To centre: {d.centerCourierInfo.company} · <span className="font-mono">{d.centerCourierInfo.trackingNo}</span> · {fmtDt(d.centerCourierInfo.dispatchDate)}</span>}
            </div>
          )}
        </div>

        {/* what to do next */}
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {stage === 'requests' && (
            <>
              <ReceiveForm key={`r-${d._id}`} count={1} busy={busy} onSubmit={f => receive([d], f)}/>
              <div className="border-t pt-3"><CloseForm key={`c-${d._id}`} count={1} busy={busy} onSubmit={reason => closeDocs([d], reason)}/></div>
            </>
          )}
          {stage === 'check' && (
            <>
              <p className="text-sm text-slate-600">{isHard(d) ? 'Correct: this hard copy goes to Dispatch to courier (or the centre pays first).' : 'Correct: this soft copy goes to Upload scan.'}</p>
              <div className="flex flex-wrap items-start gap-2">
                <Button className="h-10 bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => checkDocsDone([d])}><ClipboardCheck className="mr-1.5 h-4 w-4"/>Correction checked</Button>
                <SendBackForm key={`s-${d._id}`} count={1} busy={busy} onSubmit={note => sendBack([d], note)}/>
              </div>
              <div className="border-t pt-3"><CloseForm key={`c-${d._id}`} count={1} busy={busy} onSubmit={reason => closeDocs([d], reason)}/></div>
            </>
          )}
          {stage === 'scan' && (
            <>
              <ScanForm key={`u-${d._id}`} busy={busy} onSubmit={file => uploadScan(d, file)}/>
              <div className="border-t pt-3"><CloseForm key={`c-${d._id}`} count={1} busy={busy} onSubmit={reason => closeDocs([d], reason)}/></div>
            </>
          )}
          {stage === 'progress' && <p className="text-sm text-slate-600">{whereText(d)} — nothing to do here. It goes to Dispatch when the centre requests the courier.</p>}
          {stage === 'ready' && <DispatchForm key={`d-${d._id}`} docs={[d]} busy={busy} onSubmit={f => dispatchDocs([d], f)}/>}
          {stage === 'dispatched' && (d.status === 'Dispatched'
            ? <Button className="h-11 bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => centreReceived([d])}><CheckCircle2 className="mr-2 h-4 w-4"/>Received by centre</Button>
            : <p className="text-sm font-medium text-emerald-700">Received by the centre {fmtDt(lastAt(d, 'Delivered'))}.</p>)}
          {stage === 'closed' && <Button className="h-11" disabled={busy} onClick={() => reopen([d])}><RotateCcw className="mr-2 h-4 w-4"/>Reopen — back to {whereText({ ...d, status: d.closedFromStatus || 'Sent_To_University' }).toLowerCase()}</Button>}
        </div>

        {d.statusHistory?.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><History className="h-3.5 w-3.5"/>History</h3>
            <ol className="space-y-2.5 border-l-2 border-slate-200 pl-3.5">
              {[...d.statusHistory].reverse().slice(0, 6).map((h, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium text-slate-800">{STATUS_INFO[h.status]?.label || String(h.status || '').replace(/_/g, ' ')}</span>
                  <span className="text-xs text-slate-500"> · {fmtFull(h.at)}{h.changedBy?.name ? ` · ${h.changedBy.name}` : ''}</span>
                  {h.note && <div className="text-xs text-slate-500">{h.note}</div>}
                </li>
              ))}
            </ol>
            {d.statusHistory.length > 6 && <button type="button" className="mt-2 text-xs font-semibold text-indigo-600 hover:underline" onClick={() => setDetailDoc(d)}>All {d.statusHistory.length} steps</button>}
          </div>
        )}
      </div>
    );
  }

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/>
    </div>
  );

  const stages = STAGES.filter(s => desk.stages.includes(s.key));
  const stageInfo = STAGES.find(s => s.key === stage);
  const allSelected = selectable.length > 0 && selected.length === selectable.length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{desk.title}</h1>
          <p className="text-sm text-slate-500">{desk.sub}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 min-w-[260px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-slate-400">
            <Search className="h-4 w-4"/>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search document, student, centre, tracking no."
              aria-label="Search" className="flex-1 bg-transparent text-sm text-slate-900 outline-none"/>
          </label>
          <Button asChild variant="outline" className="h-10"><Link to="/new-inventory"><Archive className="mr-2 h-4 w-4"/>New Inventory</Link></Button>
        </div>
      </header>

      <nav aria-label="Stages" className="flex flex-wrap gap-1.5">
        {stages.map(s => {
          const on = stage === s.key;
          return (
            <button key={s.key} type="button" onClick={() => goStage(s.key)} aria-pressed={on}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors ${on ? 'bg-indigo-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
              {!on && <span className={`h-2 w-2 rounded-full ${s.dot}`}/>}
              {s.label}
              {counts[s.key] > 0 && <span className={`rounded-full px-2 text-xs leading-5 tabular-nums ${on ? 'bg-white/25 text-white' : s.count}`}>{counts[s.key]}</span>}
              {s.key === 'requests' && urgentRequests > 0 && <span className={`rounded-full px-2 text-xs font-bold leading-5 ${on ? 'bg-red-500 text-white' : 'bg-red-50 text-red-700'}`}>{urgentRequests} urgent</span>}
            </button>
          );
        })}
      </nav>
      <p className="text-xs text-slate-500">{STAGE_NOTE[stage]}</p>

      <div className="flex flex-wrap items-start gap-4">
        {/* the list */}
        <section aria-label={stageInfo?.label} className="min-w-0 max-w-full flex-[1_1_340px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:max-w-[440px]">
          {(stage === 'requests' || stage === 'dispatched') && (
            <div className="flex flex-wrap gap-1.5 border-b border-slate-100 p-3">
              {(stage === 'requests'
                ? [['all', `All ${requests.length}`], ['Marksheet', `Marksheet ${requests.filter(d => requestSection(d) === 'Marksheet').length}`], ['Other', `Other ${requests.filter(d => requestSection(d) === 'Other').length}`], ['urgent', `Urgent ${urgentRequests}`]]
                : [['awaiting', `Not confirmed ${counts.dispatched}`], ['all', `All ${dispatched.length}`]]
              ).map(([val, label]) => {
                const on = (stage === 'requests' ? reqFilter : dispFilter) === val;
                const urgentChip = val === 'urgent';
                return (
                  <button key={val} type="button" aria-pressed={on}
                    onClick={() => { (stage === 'requests' ? setReqFilter : setDispFilter)(val); setSelectedIds([]); setFocusId(''); }}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${on ? (urgentChip ? 'bg-red-600 text-white' : 'bg-slate-900 text-white') : urgentChip ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          {selectable.length > 0 && (
            <label className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2 text-sm text-slate-600">
              <input type="checkbox" checked={allSelected} onChange={e => toggleAll(e.target.checked)} className="h-4 w-4 accent-indigo-600"/>
              Select all{selected.length > 0 && <span className="font-semibold text-indigo-700"> · {selected.length} selected</span>}
            </label>
          )}
          {list.length === 0 ? (
            <div className="px-4 py-14 text-center text-sm text-slate-500">
              <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-slate-300"/>
              {q ? `Nothing matches "${search}"` : `Nothing in ${stageInfo?.label.toLowerCase()}`}
            </div>
          ) : (
            <ul className="max-h-[68vh] space-y-1 overflow-y-auto p-2">
              {list.map(e => (
                <ListRow key={e.id} entry={e} now={now} active={focused?.id === e.id && selected.length === 0}
                  selectable={canSelect(e)} selected={selectedIds.includes(e.id)} onToggle={() => toggle(e.id)}
                  onOpen={() => { setFocusId(e.id); setSelectedIds([]); }}/>
              ))}
            </ul>
          )}
        </section>

        {/* the chosen document, or what to do with the selected ones */}
        <section aria-label="Details" className="min-w-0 flex-[999_1_520px] lg:sticky lg:top-4">
          {selected.length > 0 ? renderBulk()
            : !focused ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
                <Package className="mx-auto mb-2 h-8 w-8 text-slate-300"/>Nothing to show here
              </div>
            )
            : focused.kind === 'inv' ? renderInventoryItem(focused.item)
            : renderDoc(focused.item)}
        </section>
      </div>

      {detailDoc && <DocDetailModal doc={detailDoc} onClose={() => setDetailDoc(null)}/>}
    </div>
  );
}

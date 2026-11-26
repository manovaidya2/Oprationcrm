import { MEDIA } from '../lib/api';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2, Package, Scan, Truck, CheckCircle2, Download,
  History, Eye, Search, X, Clock, Building2, User, Hash,
  GraduationCap, FileText, Trash2, PackageCheck, AlertTriangle, RotateCcw, XCircle, ClipboardCheck, Undo2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { docsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { usePanelDismissals } from '@/lib/usePanelDismissals';
import { requestSection } from '@/lib/documentOptions';

function ScannedFilesList({ doc, className = '' }) {
  const MBASE = MEDIA;
  const files = doc?.scannedFiles?.length > 0
    ? doc.scannedFiles
    : doc?.scannedUrl
      ? [{ url: doc.scannedUrl, name: doc.scannedName || 'Scanned document', sizeKb: 0 }]
      : [];
  if (files.length === 0) return null;
  return (
    <div className={className}>
      <p className="text-xs font-semibold text-muted-foreground mb-1">
        {files.length > 1 ? `Scanned Files (${files.length})` : 'Scanned Copy'}
      </p>
      <div className="space-y-1">
        {files.map((f, i) => (
          <a key={i} href={`${MBASE}${f.url}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-blue-600 underline hover:text-blue-800 w-fit"
            onClick={e => e.stopPropagation()}>
            📎 {f.name || `Scan ${i + 1}`}
            {f.sizeKb > 0 && <span className="text-muted-foreground no-underline ml-1">({f.sizeKb} KB)</span>}
          </a>
        ))}
      </div>
    </div>
  );
}

const fmtDt  = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const fmtFull= d => d ? new Date(d).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}) : '—';

const fmtMoney = value => `₹${Number(value || 0).toLocaleString('en-IN')}`;

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

// All statuses after scan has been uploaded
const POST_SCAN_STATUSES = ['Scanned','Accountant_Received','Counselor_Received','Center_Notified','Payment_Submitted','Payment_Verified','Dispatched','Delivered'];

// Incoming (waiting for the university's courier) is split by the centre tab the request came from
const INCOMING_TABS = [
  { val: 'msreq',    key: 'Marksheet', label: 'Marksheet Requests', icon: GraduationCap, noun: 'marksheet' },
  { val: 'otherreq', key: 'Other',     label: 'Other Doc Requests', icon: FileText,      noun: 'other document' },
];
// urgent: the counselor's mark, or the older inventory "urgent request"
const isUrgentDoc = d => !!d.urgent || (d.statusHistory || []).some(h => h.status === 'Urgent_Requested');
const urgentFirst = list => [...list].sort((a, b) => Number(isUrgentDoc(b)) - Number(isUrgentDoc(a)));
const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const EMPTY_RECEIVE = { receivedAt: '', company: '', trackingNo: '', note: '' };

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
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">📄 Scanned Copy</p>
              <a href={`${MEDIA}${doc.scannedUrl}`} target="_blank" rel="noreferrer" className="text-blue-600 underline text-sm flex items-center gap-1">
                <Download className="h-3.5 w-3.5"/>{doc.scannedName || 'View scanned document'}
              </a>
            </div>
          )}
          {doc.courierInfo?.trackingNo && (
            <div className="border border-purple-200 bg-purple-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">🚚 University Courier Details</p>
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
              <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-2">🚚 Dispatched to Center</p>
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
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">💳 Payment</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-muted/30 rounded px-2 py-1.5"><div className="text-xs text-muted-foreground">Charge</div><div className="font-bold">₹{doc.chargeFee?.toLocaleString('en-IN')}</div></div>
                <div className="bg-emerald-50 rounded px-2 py-1.5"><div className="text-xs text-muted-foreground">Paid</div><div className="font-bold text-emerald-700">₹{doc.totalPaid?.toLocaleString('en-IN')}</div></div>
                <div className={`rounded px-2 py-1.5 ${doc.chargeFee > doc.totalPaid ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                  <div className="text-xs text-muted-foreground">Due</div>
                  <div className={`font-bold ${doc.chargeFee > doc.totalPaid ? 'text-amber-700' : 'text-emerald-700'}`}>₹{(doc.chargeFee - doc.totalPaid)?.toLocaleString('en-IN')}</div>
                </div>
              </div>
              {doc.payments?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {doc.payments.map(p => (
                    <div key={p._id} className="text-xs flex gap-2 bg-muted/20 rounded px-2 py-1">
                      <span className="font-medium text-emerald-700">₹{p.amount?.toLocaleString('en-IN')}</span>
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
                  const info = STATUS_INFO[h.status] || { label: h.status, color: 'bg-gray-100 text-gray-700' };
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

// ── Doc Card ─────────────────────────────────────────────────
function DocCard({ doc, action, onViewDetail, onDelete, selectable = false, selected = false, onToggle }) {
  // received (or answered from the New Inventory) and waiting for its scan: it is held in the inventory
  const inNewInventory = !!(doc.receivedIntoInventory || doc.inventoryItem);
  const st = doc.status === 'Dispatch_Received' && inNewInventory
    ? { label: 'In Inventory', color: 'bg-emerald-100 text-emerald-700' }
    : STATUS_INFO[doc.status] || { label: doc.status, color: 'bg-gray-100 text-gray-700' };
  const courseFee = doc.courseFeeSummary;
  const chargeFee = Number(doc.chargeFee || 0);
  const totalPaid = Number(doc.totalPaid || 0);
  const dueAmount = Math.max(0, chargeFee - totalPaid);
  const hasFeeInfo = chargeFee > 0 || totalPaid > 0;
  const urgent = isUrgentDoc(doc);
  return (
    <Card className={`hover:border-primary/40 transition-colors ${urgent ? 'border-red-200' : ''} ${selected ? 'ring-2 ring-indigo-200' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          {selectable && (
            <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${doc.name}`}
              className="mt-1 h-4 w-4 shrink-0 accent-indigo-600"/>
          )}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onViewDetail(doc)}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{doc.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${doc.requestType === 'Hard Copy' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-sky-50 text-sky-700 border-sky-200'}`}>{doc.requestType || 'Soft Copy'}</span>
              {urgent && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-red-50 text-red-700 border border-red-200">
                  <AlertTriangle className="h-3 w-3"/>Urgent
                </span>
              )}
              {doc.correctionOpen && ['Sent_To_University', 'University_Dispatched'].includes(doc.status) && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                  <Undo2 className="h-3 w-3"/>Sent for correction{doc.correctionCount > 1 ? ` (${doc.correctionCount}×)` : ''}
                </span>
              )}
              {doc.correctionOpen && doc.status === 'Dispatch_Received' && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                  <ClipboardCheck className="h-3 w-3"/>Corrected copy — check again
                </span>
              )}
              {doc.correctionCheckedAt && !['Sent_To_University', 'University_Dispatched'].includes(doc.status) && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
                  title={`Correction checked ${fmtDt(doc.correctionCheckedAt)}`}>
                  <ClipboardCheck className="h-3 w-3"/>Correction checked
                </span>
              )}
              {doc.inventoryItem && doc.status !== 'Dispatch_Received' && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200"
                  title="Held in the office (New Inventory) — not requested from the university">
                  In New Inventory
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">
              Student: <b>{doc.student?.name}</b>
              {doc.student?.enrollmentNumber && <span className="text-xs font-mono text-emerald-700 ml-2">{doc.student.enrollmentNumber}</span>}
            </div>
            {doc.center?.name && <div className="text-xs text-muted-foreground">Center: {doc.center.name}</div>}
            {doc.correctionOpen && doc.correctionNote && (
              <div className="mt-1 rounded-md border border-amber-200 bg-amber-50/70 px-2 py-1 text-xs text-amber-900">
                <b>Correction:</b> {doc.correctionNote} <span className="text-amber-700">· sent back {fmtDt(doc.correctionSentAt)}</span>
              </div>
            )}
            {doc.status === 'Closed' && (
              <div className="mt-1 text-xs text-slate-500">
                Closed {fmtDt(doc.closedAt)}{doc.closedBy?.name ? ` by ${doc.closedBy.name}` : ''}
                {doc.closedFromStatus && ` · was ${STATUS_INFO[doc.closedFromStatus]?.label || doc.closedFromStatus.replace(/_/g, ' ')}`}
                {doc.closedReason && <span className="italic"> · “{doc.closedReason}”</span>}
              </div>
            )}
            {courseFee && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="text-xs rounded-md border border-slate-200 bg-white px-2 py-1">
                  Course Fee: <b className="text-slate-800">{fmtMoney(courseFee.totalFee ?? courseFee.netFee)}</b>
                </span>
                <span className="text-xs rounded-md border border-blue-200 bg-blue-50 px-2 py-1">
                  Net: <b className="text-blue-700">{fmtMoney(courseFee.netFee)}</b>
                </span>
                <span className="text-xs rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1">
                  Paid: <b className="text-emerald-700">{fmtMoney(courseFee.paidAmount)}</b>
                </span>
                <span className={`text-xs rounded-md border px-2 py-1 ${Number(courseFee.dueAmount || 0) > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                  Balance: <b className={Number(courseFee.dueAmount || 0) > 0 ? 'text-amber-700' : 'text-emerald-700'}>{fmtMoney(courseFee.dueAmount)}</b>
                </span>
              </div>
            )}
            {hasFeeInfo && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="text-xs rounded-md border border-slate-200 bg-white px-2 py-1">
                  Charge: <b className="text-slate-800">{fmtMoney(chargeFee)}</b>
                </span>
                <span className="text-xs rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1">
                  Paid: <b className="text-emerald-700">{fmtMoney(totalPaid)}</b>
                </span>
                <span className={`text-xs rounded-md border px-2 py-1 ${dueAmount > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                  Due: <b className={dueAmount > 0 ? 'text-amber-700' : 'text-emerald-700'}>{fmtMoney(dueAmount)}</b>
                </span>
              </div>
            )}
            {(doc.centerCourierInfo?.trackingNo || doc.courierInfo?.trackingNo) && (
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Truck className="h-3 w-3"/>
                {(() => {
                  const ci = doc.centerCourierInfo?.trackingNo ? doc.centerCourierInfo : doc.courierInfo;
                  return <>{ci.company} · <span className="font-mono">{ci.trackingNo}</span> · {fmtDt(ci.dispatchDate)}</>;
                })()}
              </div>
            )}
            {doc.scannedUrl && (
              <a href={`${MEDIA}${doc.scannedUrl}`} target="_blank" rel="noreferrer"
                className="text-xs text-blue-600 underline mt-1 flex items-center gap-1 w-fit"
                onClick={e => e.stopPropagation()}>
                <Download className="h-3 w-3"/>View scan
              </a>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="ghost" onClick={() => onViewDetail(doc)}><Eye className="h-3.5 w-3.5"/></Button>
            {onDelete && (
              <Button size="sm" variant="outline" onClick={onDelete} className="text-red-600 hover:text-red-700">
                <Trash2 className="h-3.5 w-3.5 mr-1"/>Delete
              </Button>
            )}
            {action}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function DispatchPage() {
  const { user } = useAuth();
  const { dismiss, isDismissed } = usePanelDismissals(user, 'dispatch');
  const [all,     setAll]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog,  setDialog]  = useState(null);
  const [detailDoc, setDetailDoc] = useState(null);
  const [form,    setForm]    = useState({ company:'', trackingNo:'', dispatchDate:'', documentsDesc:'' });
  const [saving,  setSaving]  = useState(false);
  const [search,  setSearch]  = useState('');
  const [selectedReadyIds, setSelectedReadyIds] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);   // Requests, Upload Scan and Closed tabs
  const [receiveForm, setReceiveForm] = useState(EMPTY_RECEIVE);
  const [closeReason, setCloseReason] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');
  const fileRef = useRef();
  const [scanFile, setScanFile] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setAll(await docsApi.list({ all: '1' }));
    } catch (e) {
      console.error('DispatchPage load failed', e);
      toast.error(e?.message || 'Failed to load dispatch queue');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const q = search.toLowerCase();
  const filter = d =>
    !q ||
    d.name?.toLowerCase().includes(q) ||
    d.student?.name?.toLowerCase().includes(q) ||
    d.center?.name?.toLowerCase().includes(q) ||
    d.student?.enrollmentNumber?.toLowerCase().includes(q) ||
    d.courierInfo?.trackingNo?.toLowerCase().includes(q);

  const visibleAll = all.filter(d => !isDismissed(`doc:${d._id}`));
  const incoming    = visibleAll.filter(d => ['University_Dispatched', 'Sent_To_University'].includes(d.status)).filter(filter);
  // a copy received from the university is checked for corrections first; one answered from the New Inventory was not sent for
  const checkPending = urgentFirst(visibleAll.filter(d => d.status === 'Dispatch_Received' && !d.correctionCheckedAt && !d.inventoryItem).filter(filter));
  const scanPending = visibleAll.filter(d => d.status === 'Dispatch_Received' && (d.correctionCheckedAt || d.inventoryItem)).filter(filter);
  const closedDocs  = visibleAll.filter(d => d.status === 'Closed').filter(filter)
    .sort((a, b) => new Date(b.closedAt || 0) - new Date(a.closedAt || 0));

  // University Records = ALL docs that have courierInfo (came from university)
  // This NEVER removes a doc — stays visible at every stage permanently
  const uniRecords  = visibleAll.filter(d => d.courierInfo?.trackingNo || ['Sent_To_University','University_Dispatched'].includes(d.status)).filter(filter);

  const ready       = visibleAll.filter(d => d.status === 'Payment_Verified').filter(filter);
  // after the scan: with the counselor, the centre (payment) or the accountant (older scans, or a payment to verify)
  const inProgress  = visibleAll.filter(d => ['Scanned','Accountant_Received','Counselor_Received','Center_Notified','Payment_Submitted'].includes(d.status)).filter(filter);
  const dispatched  = visibleAll.filter(d => ['Dispatched','Delivered'].includes(d.status)).filter(filter);

  const incomingBySection = {
    Marksheet: urgentFirst(incoming.filter(d => requestSection(d) === 'Marksheet')),
    Other:     urgentFirst(incoming.filter(d => requestSection(d) === 'Other')),
  };
  function toggleSelected(id) {
    const key = String(id);
    setSelectedIds(prev => (prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]));
  }
  function toggleAllSelected(list, on) {
    const ids = list.map(d => String(d._id));
    setSelectedIds(prev => (on ? [...new Set([...prev, ...ids])] : prev.filter(x => !ids.includes(x))));
  }

  // "Select all" bar of a tab, with that tab's buttons for the selected ones
  function renderSelectBar(list, noun, buttons) {
    if (!list.length) return null;
    const selected = list.filter(d => selectedIds.includes(String(d._id)));
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={selected.length === list.length} onChange={e => toggleAllSelected(list, e.target.checked)} className="h-4 w-4 accent-indigo-600"/>
          Select all {noun}
          {selected.length > 0 && <span className="text-xs text-muted-foreground">· {selected.length} selected</span>}
        </label>
        <div className="flex flex-wrap gap-2">{buttons(selected)}</div>
      </div>
    );
  }

  const deleteSelectedButton = selected => (
    <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => openClose(selected)} disabled={selected.length === 0 || saving}>
      <Trash2 className="h-3.5 w-3.5 mr-1"/>Delete ({selected.length})
    </Button>
  );

  // Marksheet Requests / Other Doc Requests tab: waiting for the university's courier
  function renderIncoming(tab) {
    const list = incomingBySection[tab.key];
    return (
      <>
        <p className="text-xs text-muted-foreground">
          When the university's courier arrives, mark the documents received: each goes into the student's New Inventory, shows as Sent on the university portal and moves to Upload Scan.
        </p>
        {renderSelectBar(list, `${tab.noun} requests`, selected => (
          <>
            {deleteSelectedButton(selected)}
            <Button size="sm" onClick={() => openReceive(selected)} disabled={selected.length === 0 || saving}>
              <PackageCheck className="h-3.5 w-3.5 mr-1"/>Mark Received ({selected.length})
            </Button>
          </>
        ))}
        {list.length === 0
          ? <div className="text-center py-10 text-muted-foreground">No {tab.noun} requests waiting</div>
          : list.map(d => (
            <DocCard key={d._id} doc={d} onViewDetail={setDetailDoc}
              selectable selected={selectedIds.includes(String(d._id))} onToggle={() => toggleSelected(d._id)}
              onDelete={() => openClose([d])}
              action={<Button size="sm" onClick={() => openReceive([d])}><PackageCheck className="h-3.5 w-3.5 mr-1"/>Mark Received</Button>}
            />
          ))
        }
      </>
    );
  }

  // Delete = close: an old request that is not moving leaves the Dispatch and university lists, nothing is
  // deleted (history and payments stay) and it can be reopened from the Closed tab
  function openClose(docs) {
    if (!docs.length) return toast.error('Select the requests to delete');
    setDialog({ type: 'close', items: docs });
    setCloseReason('');
  }

  async function closeSelected() {
    const docs = dialog?.items || [];
    if (!docs.length) return;
    setSaving(true);
    try {
      const res = await docsApi.closeRequests({ ids: docs.map(d => d._id), reason: closeReason.trim() });
      const done = res.closed || [];
      if (done.length) toast.success(done.length === 1 ? `${docs.find(d => String(d._id) === done[0])?.name || 'Request'} closed — it is in the Closed tab` : `${done.length} requests closed — they are in the Closed tab`);
      (res.failed || []).forEach(f => toast.error(`${f.name || docs.find(d => String(d._id) === f.id)?.name || 'A request'}: ${f.error}`));
      setDialog(null);
      setSelectedIds(prev => prev.filter(id => !done.includes(id)));
      load();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function reopenRequests(docs) {
    if (!docs.length) return toast.error('Select the requests to reopen');
    setSaving(true);
    try {
      const res = await docsApi.reopenRequests({ ids: docs.map(d => d._id) });
      const done = res.reopened || [];
      if (done.length) toast.success(done.length === 1 ? `${docs.find(d => String(d._id) === done[0])?.name || 'Request'} reopened — back where it was` : `${done.length} requests reopened — back where they were`);
      (res.failed || []).forEach(f => toast.error(`${f.name || docs.find(d => String(d._id) === f.id)?.name || 'A request'}: ${f.error}`));
      setSelectedIds(prev => prev.filter(id => !done.includes(id)));
      load();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  // Received from the university: one request (card button) or the selected ones, with one optional courier
  function openReceive(docs) {
    if (!docs.length) return toast.error('Select the documents received');
    setDialog({ type: 'receive', items: docs });
    setReceiveForm({ ...EMPTY_RECEIVE, receivedAt: todayInput() });
  }

  async function markReceived() {
    const docs = dialog?.items || [];
    if (!docs.length) return;
    if (!receiveForm.receivedAt) return toast.error('Choose the date it was received');
    if (receiveForm.receivedAt > todayInput()) return toast.error('The received date cannot be in the future');
    setSaving(true);
    try {
      const res = await docsApi.dispatchReceiveMany({
        ids: docs.map(d => d._id),
        ...(receiveForm.receivedAt !== todayInput() ? { receivedAt: receiveForm.receivedAt } : {}),   // today: the time now
        company: receiveForm.company.trim(),
        trackingNo: receiveForm.trackingNo.trim(),
        note: receiveForm.note.trim(),
      });
      const done = res.received || [];
      if (done.length === 1) toast.success(`${docs.find(d => String(d._id) === done[0])?.name || 'Document'} received — added to the New Inventory, now in Correction Check`);
      else if (done.length > 1) toast.success(`${done.length} documents received — added to the New Inventory, now in Correction Check`);
      (res.failed || []).forEach(f => toast.error(`${f.name || docs.find(d => String(d._id) === f.id)?.name || 'A document'}: ${f.error}`));
      setDialog(null);
      setSelectedIds(prev => prev.filter(id => !done.includes(id)));
      load();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  // Correction check: fine -> soft copy to Upload Scan, hard copy to Ready to Dispatch (or the centre's payment)
  async function markCorrectionChecked(docs) {
    if (!docs.length) return toast.error('Select the documents checked');
    setSaving(true);
    try {
      const res = await docsApi.correctionChecked({ ids: docs.map(d => d._id) });
      const done = res.checked || [];
      const where = Object.values(res.next || {});
      const parts = [
        where.filter(x => x === 'scan').length && `${where.filter(x => x === 'scan').length} to Upload Scan`,
        where.filter(x => x === 'dispatch').length && `${where.filter(x => x === 'dispatch').length} to Ready to Dispatch`,
        where.filter(x => x === 'payment').length && `${where.filter(x => x === 'payment').length} waiting for the centre's payment (hard copy)`,
      ].filter(Boolean);
      if (done.length) toast.success(`${done.length === 1 ? docs.find(d => String(d._id) === done[0])?.name || 'Document' : `${done.length} documents`} checked — ${parts.join(', ')}`);
      (res.failed || []).forEach(f => toast.error(`${f.name || docs.find(d => String(d._id) === f.id)?.name || 'A document'}: ${f.error}`));
      setSelectedIds(prev => prev.filter(id => !done.includes(id)));
      load();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  function openCorrection(docs) {
    if (!docs.length) return toast.error('Select the documents to send back');
    setDialog({ type: 'correction', items: docs });
    setCorrectionNote('');
  }

  async function sendForCorrection() {
    const docs = dialog?.items || [];
    if (!docs.length) return;
    if (!correctionNote.trim()) return toast.error('Write what needs to be corrected');
    setSaving(true);
    try {
      const res = await docsApi.sendForCorrection({ ids: docs.map(d => d._id), note: correctionNote.trim() });
      const done = res.sent || [];
      if (done.length) toast.success(`${done.length === 1 ? docs.find(d => String(d._id) === done[0])?.name || 'Document' : `${done.length} documents`} sent back to the university for correction — back in the request tabs`);
      (res.failed || []).forEach(f => toast.error(`${f.name || docs.find(d => String(d._id) === f.id)?.name || 'A document'}: ${f.error}`));
      setDialog(null);
      setSelectedIds(prev => prev.filter(id => !done.includes(id)));
      load();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  // the centre has the couriered document (it did not confirm itself): Delivered, and so in the New Inventory
  async function markCentreReceived(docs) {
    if (!docs.length) return toast.error('Select the documents the centre received');
    setSaving(true);
    try {
      const res = await docsApi.centreReceivedMany({ ids: docs.map(d => d._id) });
      const done = res.received || [];
      if (done.length) toast.success(done.length === 1 ? `${docs.find(d => String(d._id) === done[0])?.name || 'Document'} marked received by the centre` : `${done.length} documents marked received by the centre`);
      (res.failed || []).forEach(f => toast.error(`${f.name || docs.find(d => String(d._id) === f.id)?.name || 'A document'}: ${f.error}`));
      setSelectedIds(prev => prev.filter(id => !done.includes(id)));
      load();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function uploadScan() {
    if (!scanFile) return toast.error('Please select a scan file');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', scanFile);
      await docsApi.uploadScan(dialog.item._id, fd);
      toast.success('Scan uploaded — sent to Counselor for review');
      setDialog(null); setScanFile(null);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function dispatchToCenter() {
    if (!form.trackingNo.trim()) return toast.error('Tracking number required');
    if (!form.company.trim())    return toast.error('Courier company required');
    setSaving(true);
    try {
      const docs = dialog.items?.length ? dialog.items : [dialog.item];
      for (const doc of docs) {
        await docsApi.dispatchToCenter(doc._id, {
          ...form,
          documentsDesc: form.documentsDesc || docs.map(x => x.name).join(', '),
          dispatchDate: form.dispatchDate ? new Date(form.dispatchDate) : new Date(),
        });
      }
      toast.success(docs.length > 1 ? `${docs.length} documents dispatched. Counselor & Center notified.` : 'Dispatched! Counselor & Center notified.');
      setDialog(null); setSelectedReadyIds([]); load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  function toggleReadySelection(id) {
    setSelectedReadyIds(prev => prev.includes(String(id)) ? prev.filter(x => x !== String(id)) : [...prev, String(id)]);
  }

  function openBatchDispatch() {
    const docs = ready.filter(d => selectedReadyIds.includes(String(d._id)));
    if (!docs.length) return toast.error('Select documents to dispatch');
    setDialog({ type:'dispatch', items: docs });
    setForm({ company:'', trackingNo:'', dispatchDate: new Date().toISOString().split('T')[0], documentsDesc: docs.map(d => d.name).join(', ') });
  }

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Package className="h-5 w-5"/>Dispatch Department
        </h1>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-xs text-blue-700">
        <span className="font-medium">Flow: </span>
        Document Request → Mark Received (goes into the New Inventory) → Correction Check (or back to the university for correction) →
        Upload Scan (soft copy) → Counselor Reviews → Center Pays → Accountant Verifies → Dispatch to Center · a hard copy goes from the check to Ready to Dispatch
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
        <Input className="pl-9 pr-9" placeholder="Search by document name, student, center, tracking no…"
          value={search} onChange={e => setSearch(e.target.value)}/>
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4"/>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          ['Incoming',   incoming.length,   'text-purple-600'],
          ['Scan',       scanPending.length,'text-blue-600'],
          ['In Progress',inProgress.length, 'text-amber-600'],
          ['Ready',      ready.length,      'text-green-600'],
          ['Dispatched', dispatched.length, 'text-teal-600'],
        ].map(([l,v,c]) => (
          <Card key={l}><CardContent className="pt-3 pb-2 text-center">
            <div className={`text-xl font-bold ${c}`}>{v}</div>
            <div className="text-xs text-muted-foreground">{l}</div>
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue={INCOMING_TABS[0].val}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-slate-100 p-1 rounded-xl">
          {[
            ...INCOMING_TABS.map(t => {
              const { icon: Icon } = t;
              const list = incomingBySection[t.key];
              return { val: t.val, label: t.label, count: list.length, urgent: list.filter(isUrgentDoc).length, dot: 'bg-blue-500', icon: <Icon className="h-3.5 w-3.5"/> };
            }),
            { val:'check',    label:'Correction Check',   count: checkPending.length, dot:'bg-orange-500', icon: <ClipboardCheck className="h-3.5 w-3.5"/> },
            { val:'scan',     label:'Upload Scan',        count: scanPending.length, dot:'bg-amber-500',  icon: null },
            { val:'ready',    label:'Ready to Dispatch',  count: ready.length,       dot:'bg-emerald-500',icon: null },
            { val:'progress', label:'In Progress',        count: inProgress.length,  dot:'bg-indigo-500', icon: null },
            { val:'done',     label:'All Dispatched',     count: dispatched.length,  dot:'',              icon: <History className="h-3.5 w-3.5"/> },
            { val:'closed',   label:'Closed',             count: 0,                  dot:'',              icon: <XCircle className="h-3.5 w-3.5"/> },
          ].map(({ val, label, count, urgent, dot, icon }) => (
            <TabsTrigger key={val} value={val}
              className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm py-1.5 px-3 flex items-center gap-1.5">
              {icon}{label}
              {count > 0 && (
                <span className={`text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 ${dot ? `${dot} text-white` : 'bg-slate-200 text-slate-600'}`}>
                  {count}
                </span>
              )}
              {urgent > 0 && <span className="rounded-full bg-red-100 px-1.5 text-[10px] font-bold leading-[18px] text-red-700">{urgent} urgent</span>}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── University Records — permanent, never removed ── */}
        <TabsContent value="uni" className="space-y-3 mt-3">
          <div className="flex items-start gap-2.5 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
            <div className="h-5 w-5 rounded-full bg-purple-200 flex items-center justify-center flex-shrink-0 mt-0.5">
              <GraduationCap className="h-3 w-3 text-purple-700"/>
            </div>
            <p className="text-xs text-purple-700">
              Permanent record of requested and received documents — stays visible at every stage.
            </p>
          </div>

          {uniRecords.length === 0 ? (
            <div className="text-center py-14 border-2 border-dashed border-slate-200 rounded-2xl">
              <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <GraduationCap className="h-6 w-6 text-slate-400"/>
              </div>
              <p className="text-sm font-medium text-slate-500">No inventory records yet</p>
              <p className="text-xs text-slate-400 mt-1">Requested documents will appear here</p>
            </div>
          ) : uniRecords.map(d => {
            const ci         = d.courierInfo;
            const isAwaiting = ['University_Dispatched', 'Sent_To_University'].includes(d.status);
            const isReceived = d.status === 'Dispatch_Received';
            const isScanDone = POST_SCAN_STATUSES.includes(d.status);
            const st         = STATUS_INFO[d.status] || { label: d.status.replace(/_/g,' '), color: 'bg-slate-100 text-slate-600' };

            const cardBorder   = isAwaiting ? 'border-purple-200' : isReceived ? 'border-teal-200' : 'border-indigo-200';
            const headerBg     = isAwaiting ? 'bg-purple-50 border-purple-100' : isReceived ? 'bg-teal-50 border-teal-100' : 'bg-indigo-50 border-indigo-100';
            const iconBg       = isAwaiting ? 'bg-purple-100' : isReceived ? 'bg-teal-100' : 'bg-indigo-100';
            const iconColor    = isAwaiting ? 'text-purple-600' : isReceived ? 'text-teal-600' : 'text-indigo-600';
            const stageText    = isAwaiting ? '📬 Awaiting Receipt' : isReceived ? '✓ Receipt Confirmed' : '✓ Scan Uploaded';
            const stageTxtColor= isAwaiting ? 'text-purple-700' : isReceived ? 'text-teal-700' : 'text-indigo-700';

            return (
              <div key={d._id} className={`bg-white rounded-xl border shadow-sm ${cardBorder}`}>
                {/* Header strip */}
                <div className={`px-4 py-2.5 flex items-center justify-between rounded-t-xl border-b ${headerBg}`}>
                  <div className="flex items-center gap-2">
                    <div className={`h-6 w-6 rounded-lg flex items-center justify-center ${iconBg}`}>
                      <GraduationCap className={`h-3.5 w-3.5 ${iconColor}`}/>
                    </div>
                    <span className={`text-xs font-bold uppercase tracking-wider ${stageTxtColor}`}>{stageText}</span>
                  </div>
                  {/* Live status badge — always current */}
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${st.color}`}>{st.label}</span>
                </div>

                <div className="p-4 space-y-3">
                  {/* Doc + Student */}
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-slate-500"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800">{d.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Student: <span className="font-medium text-slate-600">{d.student?.name}</span>
                        {d.center?.name && <> · <span className="text-slate-500">{d.center.name}</span></>}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {d.student?.enrollmentNumber && (
                          <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            {d.student.enrollmentNumber}
                          </span>
                        )}
                        {d.university?.name && (
                          <span className="text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            🎓 {d.university.shortName || d.university.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Courier Details */}
                  {ci?.trackingNo ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <Truck className="h-3.5 w-3.5"/>University Courier Details
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {d.university?.name && (
                          <div className="bg-purple-50 rounded-lg border border-purple-200 px-3 py-2 col-span-2">
                            <div className="text-xs text-purple-500 font-medium">From University</div>
                            <div className="font-bold text-purple-800 mt-0.5">
                              {d.university.name}{d.university.shortName ? ` (${d.university.shortName})` : ''}
                            </div>
                          </div>
                        )}
                        {ci.company && (
                          <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                            <div className="text-xs text-slate-400 font-medium">Courier Company</div>
                            <div className="font-semibold text-slate-800 mt-0.5">{ci.company}</div>
                          </div>
                        )}
                        <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                          <div className="text-xs text-slate-400 font-medium">Tracking Number</div>
                          <div className="font-mono font-bold text-indigo-700 mt-0.5">{ci.trackingNo}</div>
                        </div>
                        {ci.dispatchDate && (
                          <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                            <div className="text-xs text-slate-400 font-medium">Dispatch Date</div>
                            <div className="font-semibold text-slate-800 mt-0.5">
                              {new Date(ci.dispatchDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
                            </div>
                          </div>
                        )}
                        {ci.documentsDesc && (
                          <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 col-span-2">
                            <div className="text-xs text-slate-400 font-medium">Documents Description</div>
                            <div className="font-semibold text-slate-800 mt-0.5">{ci.documentsDesc}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl px-4 py-3 text-xs text-slate-400 text-center">
                      No courier details available
                    </div>
                  )}

                  {/* Scanned files — shows after scan uploaded */}
                  <ScannedFilesList doc={d} className="mt-1"/>

                  {/* Actions — only shown for actionable statuses */}
                  <div className="flex items-center justify-between pt-1">
                    <button className="text-xs text-slate-400 underline hover:text-slate-600" onClick={() => setDetailDoc(d)}>
                      View Details
                    </button>
                    <div className="flex gap-2 items-center">
                      <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 text-xs h-8"
                        onClick={() => dismiss(`doc:${d._id}`)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1"/>Delete
                      </Button>
                      {isAwaiting && (
                        <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-xs h-8"
                          onClick={() => openReceive([d])}>
                          <PackageCheck className="h-3.5 w-3.5 mr-1.5"/>Mark Received
                        </Button>
                      )}
                      {isReceived && (
                        <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-xs h-8"
                          onClick={() => {
                            setDialog({type:'scan', item:d});
                            setScanFile(null);
                            if (fileRef.current) fileRef.current.value = '';
                          }}>
                          <Scan className="h-3.5 w-3.5 mr-1.5"/>Upload Scan
                        </Button>
                      )}
                      {isScanDone && (
                        <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3"/>Scan Done · {st.label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </TabsContent>

        {/* Marksheet Requests / Other Doc Requests (waiting for the university's courier) */}
        {INCOMING_TABS.map(t => (
          <TabsContent key={t.val} value={t.val} className="space-y-2 mt-3">{renderIncoming(t)}</TabsContent>
        ))}

        {/* Correction Check — every copy received from the university */}
        <TabsContent value="check" className="space-y-2 mt-3">
          <p className="text-xs text-muted-foreground">
            Check each document received from the university. Correct: a soft copy goes to Upload Scan, a hard copy to Ready to Dispatch. Wrong: send it back to the university for correction — it waits in the request tabs for the corrected copy.
          </p>
          {renderSelectBar(checkPending, 'documents to check', selected => (
            <>
              {deleteSelectedButton(selected)}
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50" onClick={() => openCorrection(selected)} disabled={selected.length === 0 || saving}>
                <Undo2 className="h-3.5 w-3.5 mr-1"/>Send back to University ({selected.length})
              </Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => markCorrectionChecked(selected)} disabled={selected.length === 0 || saving}>
                <ClipboardCheck className="h-3.5 w-3.5 mr-1"/>Correction Checked ({selected.length})
              </Button>
            </>
          ))}
          {checkPending.length === 0
            ? <div className="text-center py-10 text-muted-foreground">No documents to check</div>
            : checkPending.map(d => (
              <DocCard key={d._id} doc={d} onViewDetail={setDetailDoc}
                selectable selected={selectedIds.includes(String(d._id))} onToggle={() => toggleSelected(d._id)}
                onDelete={() => openClose([d])}
                action={
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50" onClick={() => openCorrection([d])} disabled={saving}>
                      <Undo2 className="h-3.5 w-3.5 mr-1"/>Send back to University
                    </Button>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => markCorrectionChecked([d])} disabled={saving}>
                      <ClipboardCheck className="h-3.5 w-3.5 mr-1"/>Correction Checked
                    </Button>
                  </div>
                }
              />
            ))
          }
        </TabsContent>

        {/* Upload Scan */}
        <TabsContent value="scan" className="space-y-2 mt-3">
          <p className="text-xs text-muted-foreground">Scan and upload the document. Goes to Counselor for review.</p>
          {renderSelectBar(scanPending, 'documents to scan', deleteSelectedButton)}
          {scanPending.length === 0
            ? <div className="text-center py-10 text-muted-foreground">No documents to scan</div>
            : scanPending.map(d => (
              <DocCard key={d._id} doc={d} onViewDetail={setDetailDoc}
                selectable selected={selectedIds.includes(String(d._id))} onToggle={() => toggleSelected(d._id)}
                onDelete={() => openClose([d])}
                action={
                  <Button size="sm" onClick={() => { setDialog({type:'scan', item:d}); setScanFile(null); if (fileRef.current) fileRef.current.value = ''; }}>
                    <Scan className="h-3.5 w-3.5 mr-1"/>Upload Scan
                  </Button>
                }
              />
            ))
          }
        </TabsContent>

        {/* Ready to Dispatch */}
        <TabsContent value="ready" className="space-y-2 mt-3">
          <p className="text-xs text-muted-foreground">Payment verified — send courier to center.</p>
          {ready.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ready.length > 0 && ready.every(d => selectedReadyIds.includes(String(d._id)))}
                  onChange={e => setSelectedReadyIds(e.target.checked ? ready.map(d => String(d._id)) : [])}
                  className="h-4 w-4 accent-indigo-600"
                />
                Select all ready documents
              </label>
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={openBatchDispatch} disabled={selectedReadyIds.length === 0 || saving}>
                <Truck className="h-3.5 w-3.5 mr-1"/>Dispatch Selected ({selectedReadyIds.length})
              </Button>
            </div>
          )}
          {ready.length === 0
            ? <div className="text-center py-10 text-muted-foreground">No documents ready for dispatch</div>
            : ready.map(d => (
              <DocCard key={d._id} doc={d} onViewDetail={setDetailDoc}
                onDelete={() => dismiss(`doc:${d._id}`)}
                action={
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedReadyIds.includes(String(d._id))}
                      onChange={() => toggleReadySelection(d._id)}
                      className="h-4 w-4 accent-indigo-600"
                      aria-label={`Select ${d.name} for dispatch`}
                    />
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => {
                      setDialog({type:'dispatch', item:d});
                      setForm({ company:'', trackingNo:'', dispatchDate: new Date().toISOString().split('T')[0], documentsDesc: d.name });
                    }}>
                      <Truck className="h-3.5 w-3.5 mr-1"/>Dispatch
                    </Button>
                  </div>
                }
              />
            ))
          }
        </TabsContent>

        {/* In Progress */}
        <TabsContent value="progress" className="space-y-2 mt-3">
          <p className="text-xs text-muted-foreground">Scanned and with the counselor, waiting for the centre's payment, or the accountant's payment verification.</p>
          {inProgress.length === 0
            ? <div className="text-center py-10 text-muted-foreground">Nothing in progress</div>
            : inProgress.map(d => <DocCard key={d._id} doc={d} onViewDetail={setDetailDoc} onDelete={() => dismiss(`doc:${d._id}`)} action={null}/>)
          }
        </TabsContent>

        {/* Closed — old requests Dispatch closed; reopen puts them back where they were */}
        <TabsContent value="closed" className="space-y-2 mt-3">
          <p className="text-xs text-muted-foreground">Requests closed (deleted) from Dispatch. Nothing was removed — reopen one to put it back at the stage it was closed at.</p>
          {renderSelectBar(closedDocs, 'closed requests', selected => (
            <Button size="sm" onClick={() => reopenRequests(selected)} disabled={selected.length === 0 || saving}>
              <RotateCcw className="h-3.5 w-3.5 mr-1"/>Reopen ({selected.length})
            </Button>
          ))}
          {closedDocs.length === 0
            ? <div className="text-center py-10 text-muted-foreground"><XCircle className="h-10 w-10 mx-auto mb-3 opacity-40"/>No closed requests</div>
            : closedDocs.map(d => (
              <DocCard key={d._id} doc={d} onViewDetail={setDetailDoc}
                selectable selected={selectedIds.includes(String(d._id))} onToggle={() => toggleSelected(d._id)}
                action={<Button size="sm" variant="outline" onClick={() => reopenRequests([d])} disabled={saving}><RotateCcw className="h-3.5 w-3.5 mr-1"/>Reopen</Button>}
              />
            ))
          }
        </TabsContent>

        {/* All Dispatched */}
        <TabsContent value="done" className="space-y-2 mt-3">
          <p className="text-xs text-muted-foreground">Complete record of all dispatched documents. Click any record to view full details. When a centre has its courier but has not confirmed it, mark it received here.</p>
          {renderSelectBar(dispatched.filter(d => d.status === 'Dispatched'), 'sent, not yet confirmed by the centre', selected => (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => markCentreReceived(selected)} disabled={selected.length === 0 || saving}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1"/>Received by Centre ({selected.length})
            </Button>
          ))}
          {dispatched.length === 0
            ? <div className="text-center py-10 text-muted-foreground"><History className="h-10 w-10 mx-auto mb-3 text-muted-foreground"/>No dispatched documents yet</div>
            : dispatched.map(d => (
              <Card key={d._id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setDetailDoc(d)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    {d.status === 'Dispatched' && (
                      <input type="checkbox" checked={selectedIds.includes(String(d._id))} onChange={() => toggleSelected(d._id)}
                        onClick={e => e.stopPropagation()} aria-label={`Select ${d.name}`} className="mt-1 h-4 w-4 shrink-0 accent-indigo-600"/>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{d.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_INFO[d.status]?.color || 'bg-gray-100 text-gray-700'}`}>{d.status === 'Delivered' ? 'Received by Centre' : STATUS_INFO[d.status]?.label || d.status}</span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        Student: <b>{d.student?.name}</b>
                        {d.student?.enrollmentNumber && <span className="text-xs font-mono text-emerald-700 ml-2">{d.student.enrollmentNumber}</span>}
                      </div>
                      {d.center?.name && <div className="text-xs text-muted-foreground">Center: {d.center.name}</div>}
                      {d.university?.name && <div className="text-xs font-medium text-purple-700 mt-0.5">🎓 From: {d.university.name}{d.university.shortName ? ` (${d.university.shortName})` : ''}</div>}
                      {(d.centerCourierInfo?.trackingNo || d.courierInfo?.trackingNo) && (
                        <div className="mt-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-xs space-y-0.5">
                          <div className="font-medium text-teal-800 flex items-center gap-1"><Truck className="h-3 w-3"/>Dispatched to Center</div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
                            {(() => {
                              const ci = d.centerCourierInfo?.trackingNo ? d.centerCourierInfo : d.courierInfo;
                              return <>
                                <div><span className="text-muted-foreground">Company:</span> <b>{ci.company}</b></div>
                                <div><span className="text-muted-foreground">Tracking:</span> <b className="font-mono">{ci.trackingNo}</b></div>
                                <div><span className="text-muted-foreground">Date:</span> {fmtDt(ci.dispatchDate)}</div>
                                {ci.documentsDesc && <div><span className="text-muted-foreground">Docs:</span> {ci.documentsDesc}</div>}
                              </>;
                            })()}
                          </div>
                        </div>
                      )}
                      <ScannedFilesList doc={d} className="mt-1.5"/>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2" onClick={e => e.stopPropagation()}>
                      <Button size="sm" variant="outline" onClick={() => dismiss(`doc:${d._id}`)} className="text-red-600 hover:text-red-700">
                        <Trash2 className="h-3.5 w-3.5 mr-1"/>Delete
                      </Button>
                      {d.status === 'Dispatched' && (
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => markCentreReceived([d])} disabled={saving}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1"/>Received by Centre
                        </Button>
                      )}
                      <Eye className="h-4 w-4 text-muted-foreground"/>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          }
        </TabsContent>
      </Tabs>

      {/* Upload Scan Dialog */}
      <Dialog open={dialog?.type === 'scan'} onOpenChange={() => setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload Scan: {dialog?.item?.name}</DialogTitle></DialogHeader>
          <div className="text-sm text-muted-foreground space-y-1">
            <div>Student: <b>{dialog?.item?.student?.name}</b></div>
            {dialog?.item?.courierInfo?.trackingNo && <div>Tracking: <b className="font-mono">{dialog.item.courierInfo.trackingNo}</b></div>}
          </div>
          <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-3 py-2">
            After uploading, the scanned copy will be sent to the Counselor for review. It is also kept with this document in the student's New Inventory, to download later.
          </p>
          <div>
            <Label>Scanned File *</Label>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png"
              onChange={e => setScanFile(e.target.files[0])}
              className="block w-full text-sm mt-1 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-muted"/>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={uploadScan} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}
              <Scan className="h-4 w-4 mr-1"/>Upload & Notify Counselor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispatch to Center Dialog */}
      <Dialog open={dialog?.type === 'dispatch'} onOpenChange={() => setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog?.items?.length ? `Dispatch ${dialog.items.length} Documents` : `Dispatch to Center: ${dialog?.item?.name}`}</DialogTitle></DialogHeader>
          <div className="text-sm text-muted-foreground space-y-0.5">
            {dialog?.items?.length ? (
              <div>Documents: <b>{dialog.items.map(d => `${d.student?.name || 'Student'} - ${d.name}`).join(', ')}</b></div>
            ) : (
              <>
                <div>Student: <b>{dialog?.item?.student?.name}</b></div>
                <div>Center: <b>{dialog?.item?.center?.name}</b></div>
              </>
            )}
          </div>
          <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Courier details will be shared with Counselor and Center both.
          </p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Courier Company *</Label><Input value={form.company} onChange={e => setForm(p => ({...p, company: e.target.value}))} placeholder="BlueDart, DTDC, FedEx…"/></div>
              <div><Label>Tracking No. *</Label><Input value={form.trackingNo} onChange={e => setForm(p => ({...p, trackingNo: e.target.value}))} placeholder="e.g. BD123456789"/></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Dispatch Date</Label><Input type="date" value={form.dispatchDate} onChange={e => setForm(p => ({...p, dispatchDate: e.target.value}))}/></div>
              <div><Label>Documents Description</Label><Input value={form.documentsDesc} onChange={e => setForm(p => ({...p, documentsDesc: e.target.value}))}/></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={dispatchToCenter} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}
              <Truck className="h-4 w-4 mr-1"/>Confirm Dispatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send back to the university for correction Dialog */}
      <Dialog open={dialog?.type === 'correction'} onOpenChange={() => setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog?.items?.length > 1 ? `Send ${dialog.items.length} documents back to the University for correction` : `Send back to the University for correction: ${dialog?.items?.[0]?.name || ''}`}</DialogTitle>
          </DialogHeader>
          <div className="max-h-44 overflow-y-auto rounded-lg border divide-y text-sm">
            {(dialog?.items || []).map(d => (
              <div key={d._id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="truncate font-medium">{d.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {d.student?.name}{d.student?.enrollmentNumber ? <span className="ml-1 font-mono text-emerald-700">{d.student.enrollmentNumber}</span> : null}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            The university gets {dialog?.items?.length > 1 ? 'them' : 'it'} in its <b>Correction Needed</b> tab with your note. Here {dialog?.items?.length > 1 ? 'they go' : 'it goes'} back to the request tabs marked <b>Sent for correction</b> — mark the corrected copy received when it comes, and check it again.
          </p>
          <div>
            <Label>What needs to be corrected? *</Label>
            <Input value={correctionNote} maxLength={500} onChange={e => setCorrectionNote(e.target.value)} placeholder="e.g. Father's name misspelt, wrong date of birth" className="mt-1"/>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={sendForCorrection} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin"/> : <Undo2 className="h-4 w-4 mr-1"/>}
              Send back to University
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete (= close) requests Dialog */}
      <Dialog open={dialog?.type === 'close'} onOpenChange={() => setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog?.items?.length > 1 ? `Delete ${dialog.items.length} requests` : `Delete request: ${dialog?.items?.[0]?.name || ''}`}</DialogTitle>
          </DialogHeader>
          <div className="max-h-44 overflow-y-auto rounded-lg border divide-y text-sm">
            {(dialog?.items || []).map(d => (
              <div key={d._id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="truncate font-medium">{d.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {d.student?.name}{d.student?.enrollmentNumber ? <span className="ml-1 font-mono text-emerald-700">{d.student.enrollmentNumber}</span> : null}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2">
            {dialog?.items?.length > 1 ? 'These requests are' : 'This request is'} marked <b>Closed</b>: removed from Dispatch and from the university's pending list.
            Nothing is erased — the history and payments stay, and Dispatch can reopen {dialog?.items?.length > 1 ? 'them' : 'it'} any time from the <b>Closed</b> tab.
          </p>
          <div>
            <Label>Reason</Label>
            <Input value={closeReason} maxLength={300} onChange={e => setCloseReason(e.target.value)} placeholder="Optional — e.g. very old request, not moving" className="mt-1"/>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={closeSelected} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin"/> : <Trash2 className="h-4 w-4 mr-1"/>}
              {dialog?.items?.length > 1 ? `Delete ${dialog.items.length} requests` : 'Delete request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Received (from the university) Dialog */}
      <Dialog open={dialog?.type === 'receive'} onOpenChange={() => setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog?.items?.length > 1 ? `Mark ${dialog.items.length} documents received` : `Mark received: ${dialog?.items?.[0]?.name || ''}`}</DialogTitle>
          </DialogHeader>
          <div className="max-h-44 overflow-y-auto rounded-lg border divide-y text-sm">
            {(dialog?.items || []).map(d => (
              <div key={d._id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="flex min-w-0 items-center gap-1.5 font-medium">
                  <span className="truncate">{d.name}</span>
                  {isUrgentDoc(d) && <span className="shrink-0 rounded-full bg-red-50 px-1.5 text-[10px] font-bold text-red-700 border border-red-200">Urgent</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {d.student?.name}{d.student?.enrollmentNumber ? <span className="ml-1 font-mono text-emerald-700">{d.student.enrollmentNumber}</span> : null}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
            Each document is added to the student's New Inventory, shows as Sent on the university portal and moves to Upload Scan.
          </p>
          <div className="space-y-3">
            <div>
              <Label>Received on *</Label>
              <Input type="date" max={todayInput()} value={receiveForm.receivedAt} onChange={e => setReceiveForm(p => ({ ...p, receivedAt: e.target.value }))} className="mt-1"/>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Courier details <span className="normal-case font-normal">(optional{dialog?.items?.length > 1 ? ' — same for all selected' : ''})</span></p>
              <div className="mt-1.5 grid grid-cols-2 gap-3">
                <div><Label>Courier Company</Label><Input value={receiveForm.company} maxLength={80} onChange={e => setReceiveForm(p => ({ ...p, company: e.target.value }))} placeholder="BlueDart, DTDC…" className="mt-1"/></div>
                <div><Label>Tracking No.</Label><Input value={receiveForm.trackingNo} maxLength={80} onChange={e => setReceiveForm(p => ({ ...p, trackingNo: e.target.value }))} placeholder="e.g. BD123456" className="mt-1"/></div>
              </div>
            </div>
            <div>
              <Label>Note</Label>
              <Input value={receiveForm.note} maxLength={300} onChange={e => setReceiveForm(p => ({ ...p, note: e.target.value }))} placeholder="Optional" className="mt-1"/>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={markReceived} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin"/> : <PackageCheck className="h-4 w-4 mr-1"/>}
              Mark Received
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detailDoc && <DocDetailModal doc={detailDoc} onClose={() => setDetailDoc(null)}/>}
    </div>
  );
}

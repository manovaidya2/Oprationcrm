import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2, Package, Scan, Truck, CheckCircle2, Download,
  History, Eye, Search, X, Clock, Building2, User, Hash,
  GraduationCap, FileText,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { docsApi } from '@/lib/api';

const MEDIA  = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');

function ScannedFilesList({ doc, className = '' }) {
  const MBASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
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

const STATUS_INFO = {
  University_Dispatched: { label:'Incoming from University',  color:'bg-purple-100 text-purple-700' },
  Dispatch_Received:     { label:'Receipt Confirmed',         color:'bg-blue-100 text-blue-700' },
  Scanned:               { label:'Scanned',                   color:'bg-indigo-100 text-indigo-700' },
  Accountant_Received:   { label:'With Accountant',           color:'bg-orange-100 text-orange-700' },
  Counselor_Received:    { label:'With Counselor',            color:'bg-amber-100 text-amber-700' },
  Center_Notified:       { label:'Center Notified',           color:'bg-orange-100 text-orange-700' },
  Payment_Submitted:     { label:'Payment Submitted',         color:'bg-sky-100 text-sky-700' },
  Payment_Verified:      { label:'Payment Verified - Ready',  color:'bg-green-100 text-green-700' },
  Dispatched:            { label:'Dispatched to Center',      color:'bg-teal-100 text-teal-700' },
  Delivered:             { label:'Delivered',                 color:'bg-emerald-100 text-emerald-700' },
};

// All statuses after scan has been uploaded
const POST_SCAN_STATUSES = ['Scanned','Accountant_Received','Counselor_Received','Center_Notified','Payment_Submitted','Payment_Verified','Dispatched','Delivered'];

// ── Full Document Detail Modal ───────────────────────────────
function DocDetailModal({ doc, onClose }) {
  if (!doc) return null;
  const st = STATUS_INFO[doc.status] || { label: doc.status, color: 'bg-gray-100 text-gray-700' };
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
function DocCard({ doc, action, onViewDetail }) {
  const st = STATUS_INFO[doc.status] || { label: doc.status, color: 'bg-gray-100 text-gray-700' };
  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onViewDetail(doc)}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{doc.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">
              Student: <b>{doc.student?.name}</b>
              {doc.student?.enrollmentNumber && <span className="text-xs font-mono text-emerald-700 ml-2">{doc.student.enrollmentNumber}</span>}
            </div>
            {doc.center?.name && <div className="text-xs text-muted-foreground">Center: {doc.center.name}</div>}
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
            {action}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function DispatchPage() {
  const [all,     setAll]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog,  setDialog]  = useState(null);
  const [detailDoc, setDetailDoc] = useState(null);
  const [form,    setForm]    = useState({ company:'', trackingNo:'', dispatchDate:'', documentsDesc:'' });
  const [saving,  setSaving]  = useState(false);
  const [search,  setSearch]  = useState('');
  const fileRef = useRef();
  const [scanFile, setScanFile] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const d = await docsApi.list({ all: '1' });
      setAll(d);
    } catch { toast.error('Failed'); } finally { setLoading(false); }
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

  const incoming    = all.filter(d => d.status === 'University_Dispatched').filter(filter);
  const scanPending = all.filter(d => d.status === 'Dispatch_Received').filter(filter);

  // University Records = ALL docs that have courierInfo (came from university)
  // This NEVER removes a doc — stays visible at every stage permanently
  const uniRecords  = all.filter(d => d.courierInfo?.trackingNo).filter(filter);

  const ready       = all.filter(d => d.status === 'Payment_Verified').filter(filter);
  const inProgress  = all.filter(d => ['Counselor_Received','Center_Notified','Payment_Submitted','Scanned'].includes(d.status)).filter(filter);
  const dispatched  = all.filter(d => ['Dispatched','Delivered'].includes(d.status)).filter(filter);

  async function confirmReceipt(id) {
    try { await docsApi.dispatchReceive(id); toast.success('Receipt confirmed'); load(); }
    catch(e) { toast.error(e.message); }
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
      await docsApi.dispatchToCenter(dialog.item._id, {
        ...form,
        dispatchDate: form.dispatchDate ? new Date(form.dispatchDate) : new Date(),
      });
      toast.success('Dispatched! Counselor & Center notified.');
      setDialog(null); load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
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
        University Dispatches → Confirm Receipt → Upload Scan → Counselor Reviews →
        Center Pays → Accountant Verifies → Dispatch to Center
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

      <Tabs defaultValue="uni">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-slate-100 p-1 rounded-xl">
          {[
            { val:'uni',      label:'University Records', count: uniRecords.length,  dot:'bg-purple-500', icon: <GraduationCap className="h-3.5 w-3.5"/> },
            { val:'incoming', label:'Incoming',           count: incoming.length,    dot:'bg-blue-500',   icon: null },
            { val:'scan',     label:'Upload Scan',        count: scanPending.length, dot:'bg-amber-500',  icon: null },
            { val:'ready',    label:'Ready to Dispatch',  count: ready.length,       dot:'bg-emerald-500',icon: null },
            { val:'progress', label:'In Progress',        count: inProgress.length,  dot:'bg-indigo-500', icon: null },
            { val:'done',     label:'All Dispatched',     count: dispatched.length,  dot:'',              icon: <History className="h-3.5 w-3.5"/> },
          ].map(({ val, label, count, dot, icon }) => (
            <TabsTrigger key={val} value={val}
              className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm py-1.5 px-3 flex items-center gap-1.5">
              {icon}{label}
              {count > 0 && (
                <span className={`text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 ${dot ? `${dot} text-white` : 'bg-slate-200 text-slate-600'}`}>
                  {count}
                </span>
              )}
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
              Permanent record of all documents received from university — stays visible at every stage.
            </p>
          </div>

          {uniRecords.length === 0 ? (
            <div className="text-center py-14 border-2 border-dashed border-slate-200 rounded-2xl">
              <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <GraduationCap className="h-6 w-6 text-slate-400"/>
              </div>
              <p className="text-sm font-medium text-slate-500">No university records yet</p>
              <p className="text-xs text-slate-400 mt-1">Documents dispatched by university will appear here</p>
            </div>
          ) : uniRecords.map(d => {
            const ci         = d.courierInfo;
            const isAwaiting = d.status === 'University_Dispatched';
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
                      {isAwaiting && (
                        <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-xs h-8"
                          onClick={() => confirmReceipt(d._id)}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5"/>Confirm Receipt
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

        {/* Incoming */}
        <TabsContent value="incoming" className="space-y-2 mt-3">
          <p className="text-xs text-muted-foreground">Couriers from University — confirm receipt to proceed to scanning.</p>
          {incoming.length === 0
            ? <div className="text-center py-10 text-muted-foreground">No incoming couriers</div>
            : incoming.map(d => (
              <DocCard key={d._id} doc={d} onViewDetail={setDetailDoc}
                action={<Button size="sm" onClick={() => confirmReceipt(d._id)}><CheckCircle2 className="h-3.5 w-3.5 mr-1"/>Confirm Receipt</Button>}
              />
            ))
          }
        </TabsContent>

        {/* Upload Scan */}
        <TabsContent value="scan" className="space-y-2 mt-3">
          <p className="text-xs text-muted-foreground">Scan and upload the document. Goes to Counselor for review.</p>
          {scanPending.length === 0
            ? <div className="text-center py-10 text-muted-foreground">No documents to scan</div>
            : scanPending.map(d => (
              <DocCard key={d._id} doc={d} onViewDetail={setDetailDoc}
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
          {ready.length === 0
            ? <div className="text-center py-10 text-muted-foreground">No documents ready for dispatch</div>
            : ready.map(d => (
              <DocCard key={d._id} doc={d} onViewDetail={setDetailDoc}
                action={
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => {
                    setDialog({type:'dispatch', item:d});
                    setForm({ company:'', trackingNo:'', dispatchDate: new Date().toISOString().split('T')[0], documentsDesc: d.name });
                  }}>
                    <Truck className="h-3.5 w-3.5 mr-1"/>Dispatch
                  </Button>
                }
              />
            ))
          }
        </TabsContent>

        {/* In Progress */}
        <TabsContent value="progress" className="space-y-2 mt-3">
          <p className="text-xs text-muted-foreground">Waiting for center payment or accountant verification.</p>
          {inProgress.length === 0
            ? <div className="text-center py-10 text-muted-foreground">Nothing in progress</div>
            : inProgress.map(d => <DocCard key={d._id} doc={d} onViewDetail={setDetailDoc} action={null}/>)
          }
        </TabsContent>

        {/* All Dispatched */}
        <TabsContent value="done" className="space-y-2 mt-3">
          <p className="text-xs text-muted-foreground">Complete record of all dispatched documents. Click any record to view full details.</p>
          {dispatched.length === 0
            ? <div className="text-center py-10 text-muted-foreground"><History className="h-10 w-10 mx-auto mb-3 text-muted-foreground"/>No dispatched documents yet</div>
            : dispatched.map(d => (
              <Card key={d._id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setDetailDoc(d)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{d.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_INFO[d.status]?.color || 'bg-gray-100 text-gray-700'}`}>{STATUS_INFO[d.status]?.label || d.status}</span>
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
                    <div className="flex-shrink-0"><Eye className="h-4 w-4 text-muted-foreground"/></div>
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
            After uploading, the scanned copy will be sent to the Counselor for review.
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
          <DialogHeader><DialogTitle>Dispatch to Center: {dialog?.item?.name}</DialogTitle></DialogHeader>
          <div className="text-sm text-muted-foreground space-y-0.5">
            <div>Student: <b>{dialog?.item?.student?.name}</b></div>
            <div>Center: <b>{dialog?.item?.center?.name}</b></div>
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

      {detailDoc && <DocDetailModal doc={detailDoc} onClose={() => setDetailDoc(null)}/>}
    </div>
  );
}
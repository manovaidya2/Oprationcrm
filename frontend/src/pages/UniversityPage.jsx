import { MEDIA } from '../lib/api';
import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, BadgeCheck, Truck, Paperclip, Search, X, Eye,
  Loader2, GraduationCap, FileText, Package, TrendingUp,
  Clock, CheckCircle2, Hash, User, Building2, Download,
  ChevronRight, History, Send, XCircle, AlertTriangle, Undo2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { studentsApi, docsApi } from '@/lib/api';
import { requestSection } from '@/lib/documentOptions';

const fmtDt  = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const fmtFull= d => d ? new Date(d).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}) : '—';

const DOC_STATUS = {
  Sent_To_University:   { label:'Pending Action',     color:'bg-amber-100 text-amber-700',    dot:'bg-amber-500' },
  University_Dispatched:{ label:'Sent to Dispatch',   color:'bg-teal-100 text-teal-700',      dot:'bg-teal-500' },
  Dispatch_Received:    { label:'Dispatch Received',  color:'bg-blue-100 text-blue-700',      dot:'bg-blue-500' },
  Scanned:              { label:'Scanned',             color:'bg-indigo-100 text-indigo-700',  dot:'bg-indigo-500' },
  Accountant_Received:  { label:'With Accountant',    color:'bg-indigo-100 text-indigo-700',  dot:'bg-indigo-500' },
  Counselor_Received:   { label:'With Counselor',     color:'bg-purple-100 text-purple-700',  dot:'bg-purple-500' },
  Center_Notified:      { label:'With Centre',        color:'bg-purple-100 text-purple-700',  dot:'bg-purple-500' },
  Payment_Submitted:    { label:'Payment Submitted',  color:'bg-amber-100 text-amber-700',    dot:'bg-amber-500' },
  Payment_Verified:    { label:'Payment Verified',   color:'bg-green-100 text-green-700',    dot:'bg-green-500' },
  Dispatched:           { label:'Dispatched to Center',color:'bg-emerald-100 text-emerald-700',dot:'bg-emerald-500' },
  Delivered:            { label:'Delivered',           color:'bg-emerald-100 text-emerald-700',dot:'bg-emerald-600' },
  Closed:               { label:'Closed',              color:'bg-slate-200 text-slate-600',    dot:'bg-slate-400' },
};

// All statuses AFTER university has dispatched — used to keep records in history
const DISPATCHED_STATUSES = [
  'University_Dispatched',
  'Dispatch_Received',
  'Scanned',
  'Accountant_Received',
  'Counselor_Received',
  'Center_Notified',
  'Payment_Submitted',
  'Payment_Verified',
  'Dispatched',
  'Delivered',
];

// Document requests reach the university in three tabs: Marksheet and Other Documents (the tab the centre
// raised them from) and Urgent — the counselor's urgent mark, or the older inventory "urgent request".
const SECTION_META = {
  Marksheet: { label: 'Marksheet',      icon: GraduationCap, tone: 'bg-violet-50 text-violet-600', badge: 'border-violet-200 bg-violet-50 text-violet-700' },
  Other:     { label: 'Other Document', icon: FileText,      tone: 'bg-sky-50 text-sky-600',       badge: 'border-sky-200 bg-sky-50 text-sky-700' },
};
const isUrgentDoc = d => !!d.urgent || (d.statusHistory || []).some(h => h.status === 'Urgent_Requested');
const urgentSince = d => (d.urgent ? d.urgentMarkedAt : [...(d.statusHistory || [])].reverse().find(h => h.status === 'Urgent_Requested')?.at);
const requestedAt = d => [...(d.statusHistory || [])].reverse().find(h => h.status === 'Sent_To_University')?.at || d.createdAt;
// the date Dispatch received it from the university (older records: the receipt in the history)
const receivedOn = d => d.receivedFromUniversityAt || [...(d.statusHistory || [])].reverse().find(h => h.status === 'Dispatch_Received')?.at || null;
const hasCourier = c => c && (c.dispatchDate || c.documentsDesc || c.trackingNo || c.company);
const docStatusInfo = d => DOC_STATUS[d.status] || { label: String(d.status || '').replace(/_/g, ' '), color: 'bg-gray-100 text-gray-700' };

function SectionBadge({ d }) {
  const meta = SECTION_META[requestSection(d)];
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.badge}`}>{meta.label}</span>;
}

function UrgentBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
      <AlertTriangle className="h-3 w-3"/>Urgent
    </span>
  );
}

function EnrollmentChip({ student }) {
  if (!student?.enrollmentNumber) return null;
  return (
    <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
      {student.enrollmentNumber}
    </span>
  );
}

function StudentLink({ student, onOpen }) {
  if (!student?._id) return <b>{student?.name || '—'}</b>;
  return (
    <button type="button" onClick={() => onOpen(student)} className="font-semibold text-slate-800 hover:text-purple-700 hover:underline">
      {student.name}
    </button>
  );
}

// A request waiting for the university's courier
function PendingRequestCard({ d, selected, onToggle, onOpenStudent, showSection }) {
  const urgent = isUrgentDoc(d);
  const { icon: Icon, tone } = SECTION_META[requestSection(d)];
  const since = urgent ? urgentSince(d) : null;
  return (
    <Card className={`mb-2 ${urgent ? 'border-red-200 bg-red-50/40' : 'border-amber-200'}`}>
      <CardContent className="p-4 flex flex-wrap sm:flex-nowrap items-start gap-3">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${d.name}`}
          className={`mt-2.5 h-4 w-4 shrink-0 ${urgent ? 'accent-red-600' : 'accent-purple-600'}`}/>
        <div className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${tone}`}><Icon className="h-4 w-4"/></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{d.name}</span>
            {showSection && <SectionBadge d={d}/>}
            {urgent && <UrgentBadge/>}
            {d.requestType && <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">{d.requestType}</span>}
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
            Student: <StudentLink student={d.student} onOpen={onOpenStudent}/>
            <EnrollmentChip student={d.student}/>
            {d.student?.courseName && <span className="text-xs">· {d.student.courseName}</span>}
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>Requested: {fmtDt(requestedAt(d))}</span>
            {since && <span className="font-medium text-red-700">Urgent since {fmtDt(since)}</span>}
          </div>
        </div>
        <span className={`ml-auto shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${urgent ? 'text-red-700 bg-red-100 border-red-200' : 'text-amber-600 bg-amber-50 border-amber-200'}`}>
          {urgent ? 'Urgent - Awaiting Physical Courier' : '⏳ Awaiting Physical Courier'}
        </span>
      </CardContent>
    </Card>
  );
}

// A document Dispatch sent back for correction: what to correct, waiting for the corrected copy
function CorrectionCard({ d, onOpenStudent }) {
  const { icon: Icon, tone } = SECTION_META[requestSection(d)];
  return (
    <Card className="mb-2 border-amber-300 bg-amber-50/40">
      <CardContent className="p-4 flex flex-wrap sm:flex-nowrap items-start gap-3">
        <div className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${tone}`}><Icon className="h-4 w-4"/></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{d.name}</span>
            <SectionBadge d={d}/>
            {isUrgentDoc(d) && <UrgentBadge/>}
            {d.requestType && <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">{d.requestType}</span>}
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
            Student: <StudentLink student={d.student} onOpen={onOpenStudent}/>
            <EnrollmentChip student={d.student}/>
            {d.student?.courseName && <span className="text-xs">· {d.student.courseName}</span>}
          </div>
          <div className="mt-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-amber-900">
            <span className="font-semibold">Correction needed:</span> {d.correctionNote || '—'}
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>Sent back: {fmtDt(d.correctionSentAt)}</span>
            {d.correctionCount > 1 && <span className="font-semibold text-amber-800">{d.correctionCount}{d.correctionCount === 2 ? 'nd' : d.correctionCount === 3 ? 'rd' : 'th'} correction</span>}
          </div>
        </div>
        <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border text-amber-800 bg-amber-100 border-amber-300">
          <Undo2 className="h-3.5 w-3.5"/>Send corrected copy
        </span>
      </CardContent>
    </Card>
  );
}

// A request the university has sent: Dispatch marked it received (the date it reached the office).
// Older ones the university marked dispatched itself may still be on the way.
function SentCard({ d, onOpenStudent }) {
  const urgent = isUrgentDoc(d);
  const { icon: Icon, tone } = SECTION_META[requestSection(d)];
  const received = receivedOn(d);
  return (
    <Card className="mb-2 border-l-4 border-l-emerald-400">
      <CardContent className="p-4 flex flex-wrap sm:flex-nowrap items-start gap-3">
        <div className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${tone}`}><Icon className="h-4 w-4"/></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{d.name}</span>
            {urgent && <UrgentBadge/>}
            {d.correctionCount > 0 && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Corrected copy</span>}
            {d.requestType && <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">{d.requestType}</span>}
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
            Student: <StudentLink student={d.student} onOpen={onOpenStudent}/>
            <EnrollmentChip student={d.student}/>
            {d.student?.courseName && <span className="text-xs">· {d.student.courseName}</span>}
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>Requested: {fmtDt(requestedAt(d))}</span>
            {received && <span className="font-semibold text-emerald-700">Received at office: {fmtDt(received)}</span>}
          </div>
          {hasCourier(d.courierInfo) && (
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
              <Truck className="h-3 w-3"/>
              {d.courierInfo.company && <span>{d.courierInfo.company}</span>}
              {d.courierInfo.trackingNo && <span className="font-mono">{d.courierInfo.trackingNo}</span>}
              {d.courierInfo.documentsDesc && <span>· {d.courierInfo.documentsDesc}</span>}
            </div>
          )}
        </div>
        <span className={`ml-auto shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${received ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-teal-700 bg-teal-50 border-teal-200'}`}>
          {received ? <><CheckCircle2 className="h-3.5 w-3.5"/>Sent</> : <><Truck className="h-3.5 w-3.5"/>Sent · on the way</>}
        </span>
      </CardContent>
    </Card>
  );
}

// ── Student Detail Modal ─────────────────────────────────────
function StudentModal({ student, docs, onClose, onAssign, onReject }) {
  const [fullStudent, setFullStudent] = useState(student);
  useEffect(() => {
    if (!student?._id) return;
    studentsApi.getOne(student._id).then(s => { if (s) setFullStudent(s); }).catch(() => {});
  }, [student?._id]);

  const s = fullStudent;
  const studentDocs = docs.filter(d => String(d.student?._id || d.student) === String(student._id));
  const dispatchedDocs = studentDocs.filter(d => DISPATCHED_STATUSES.includes(d.status));
  // opened from a document request the student may carry no status until the full record loads
  const status = s.applicationStatus || student.applicationStatus;
  const awaitingEnrollment = status ? status === 'Sent_To_University' : !student.enrollmentNumber;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <GraduationCap className="h-4 w-4"/>
            {student.name}
            {student.enrollmentNumber
              ? <span className="text-sm font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">{student.enrollmentNumber}</span>
              : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Enrollment Pending</span>
            }
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Personal Info */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              ['Name',         s.name],
              ['Phone',        s.phone],
              ['Email',        s.email],
              ['Father Name',  s.fatherName],
              ['Mother Name',  s.motherName],
              ['DOB',          s.dob ? fmtDt(s.dob) : null],
              ['Gender',       s.gender],
              ['Aadhaar',      s.aadharNumber],
              ['Address',      s.address],
              ['Course',       s.courseName],
              ['Session',   s.courseYear],
              ['University',   s.university?.name || s.universityName || null],
              ['10th %',       s.tenth_percent   ? `${s.tenth_percent}%`   : null],
              ['10th Year',    s.tenth_year      || null],
              ['10th Board',   s.tenth_board     || null],
              ['12th %',       s.twelfth_percent ? `${s.twelfth_percent}%` : null],
              ['12th Year',    s.twelfth_year    || null],
              ['12th Board',   s.twelfth_board   || null],
              ['Enrollment',   s.enrollmentNumber || null],
            ].filter(([,v]) => v).map(([l,v]) => (
              <div key={l} className="bg-muted/30 rounded px-3 py-1.5">
                <div className="text-xs text-muted-foreground">{l}</div>
                <div className="font-medium mt-0.5 break-words">{v}</div>
              </div>
            ))}
          </div>

          {/* Submitted Docs */}
          {s.submissionDocs?.length > 0 && (
            <div className="border rounded-lg p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5"/>Submitted Documents ({s.submissionDocs.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {s.submissionDocs.map((d,i) => (
                  <span key={i} className="text-xs flex items-center gap-1 bg-background border rounded px-2 py-0.5">
                    <Paperclip className="h-3 w-3 text-muted-foreground"/>
                    {d.fileUrl
                      ? <a href={`${MEDIA}${d.fileUrl}`} target="_blank" rel="noreferrer" className="text-blue-600 underline">{d.name}</a>
                      : <span>{d.name}</span>
                    }
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Document Requests for this student */}
          {studentDocs.length > 0 && (
            <div className="border rounded-lg p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <FileText className="h-3.5 w-3.5"/>Document Requests ({studentDocs.length})
              </p>
              <div className="space-y-2">
                {studentDocs.map(d => {
                  const si = docStatusInfo(d);
                  return (
                    <div key={d._id} className="flex items-center justify-between gap-2 bg-muted/20 rounded px-3 py-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{d.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${si.color}`}>{si.label}</span>
                          <SectionBadge d={d}/>
                          {isUrgentDoc(d) && <UrgentBadge/>}
                        </div>
                        {d.courierInfo && (d.courierInfo.dispatchDate || d.courierInfo.documentsDesc || d.courierInfo.trackingNo || d.courierInfo.company) && (
  <div className="text-xs text-muted-foreground mt-0.5">
    🚚 {d.courierInfo.company && <span>{d.courierInfo.company} · </span>}{fmtDt(d.courierInfo.dispatchDate)}
    {d.courierInfo.trackingNo && <span className="font-mono"> · {d.courierInfo.trackingNo}</span>}
    {d.courierInfo.documentsDesc ? ` · ${d.courierInfo.documentsDesc}` : ''}
  </div>
)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dispatch History */}
          {dispatchedDocs.length > 0 && (
            <div className="border border-teal-200 bg-teal-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Truck className="h-3.5 w-3.5"/>Dispatched Documents ({dispatchedDocs.length})
              </p>
              {dispatchedDocs.map(d => (
                <div key={d._id} className="text-xs space-y-0.5 mb-2 last:mb-0">
                  <div className="font-medium">{d.name}</div>
                  {d.courierInfo && (d.courierInfo.dispatchDate || d.courierInfo.documentsDesc || d.courierInfo.trackingNo || d.courierInfo.company) && (
  <div className="text-muted-foreground">
    {d.courierInfo.company && <span>{d.courierInfo.company} · </span>}{fmtDt(d.courierInfo.dispatchDate)}
    {d.courierInfo.trackingNo && <span className="font-mono"> · {d.courierInfo.trackingNo}</span>}
    {d.courierInfo.documentsDesc ? ` · ${d.courierInfo.documentsDesc}` : ''}
  </div>
)}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {awaitingEnrollment && onReject && (
            <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50" onClick={() => { onClose(); onReject(student); }}>
              <XCircle className="h-4 w-4 mr-1"/>Reject Application
            </Button>
          )}
          {awaitingEnrollment && onAssign && (
            <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => { onClose(); onAssign(student); }}>
              <BadgeCheck className="h-4 w-4 mr-1"/>Assign Enrollment
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color, trend }) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${color || 'text-foreground'}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
            {trend && <p className="text-xs text-emerald-600 mt-1 font-medium">{trend}</p>}
          </div>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${color ? color.replace('text-','bg-').replace('-600','-100').replace('-700','-100') : 'bg-muted'}`}>
            <Icon className={`h-5 w-5 ${color || 'text-muted-foreground'}`}/>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function UniversityPage() {
  const [pending,   setPending]   = useState([]);
  const [enrolled,  setEnrolled]  = useState([]);
  const [cancelled, setCancelled] = useState([]);
  const [docs,      setDocs]      = useState([]);
  const [loading,  setLoading]  = useState(true);

  const [enrOpen,    setEnrOpen]    = useState(false);
  const [selStudent, setSelStudent] = useState(null);
  const [enrNum,     setEnrNum]     = useState('');

  // University reject dialog
  const [rejectOpen,    setRejectOpen]    = useState(false);
  const [rejectStudent, setRejectStudent] = useState(null);
  const [rejectReason,  setRejectReason]  = useState('');

  const [docDispOpen, setDocDispOpen] = useState(false);
  const [selDoc,      setSelDoc]      = useState(null);
  const [dispForm,    setDispForm]    = useState({ company:'', trackingNo:'', dispatchDate:'', documentsDesc:'' });

  const [modalStudent, setModalStudent] = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [search,  setSearch]  = useState('');
  const [docSearch, setDocSearch] = useState('');
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [tab, setTab] = useState('pending');
  const [urgentSection, setUrgentSection] = useState('');   // Urgent tab filter: '' (all) | 'Marksheet' | 'Other'

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [s, d] = await Promise.all([studentsApi.getAll(), docsApi.list({ all: '1' })]);
      setPending(s.filter(x => x.applicationStatus === 'Sent_To_University'));
      setEnrolled(s.filter(x => x.applicationStatus === 'Enrolled'));
      // Only show cancelled students who were previously enrolled (had enrollment number)
      setCancelled(s.filter(x => x.applicationStatus === 'Cancelled' && x.enrollmentNumber));
      setDocs(d);
    } catch { toast.error('Failed to load'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function assignEnrollment() {
    if (!enrNum.trim()) return toast.error('Enrollment number required');
    setSaving(true);
    try {
      await studentsApi.assignEnrollment(selStudent._id, enrNum);
      toast.success('Enrollment assigned!'); setEnrOpen(false); setEnrNum(''); load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function rejectApplication() {
    if (!rejectReason.trim()) return toast.error('Rejection reason is required');
    setSaving(true);
    try {
      await studentsApi.universityReject(rejectStudent._id, rejectReason);
      toast.success('Application rejected — accountant notified');
      setRejectOpen(false); setRejectReason(''); setRejectStudent(null); load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function sendDocToDispatch() {
    
    setSaving(true);
    try {
      await docsApi.universityDispatch(selDoc._id, {
        ...dispForm,
        dispatchDate: dispForm.dispatchDate ? new Date(dispForm.dispatchDate) : new Date(),
      });
      toast.success('Sent to Dispatch Department!'); setDocDispOpen(false); load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  // ── Derived stats ───────────────────────────────────────────
  const allStudents   = [...pending, ...enrolled, ...cancelled];
  const awaitingDocs  = docs.filter(d => d.status === 'Sent_To_University' && !d.correctionOpen);
  const correctionDocs = docs.filter(d => d.status === 'Sent_To_University' && d.correctionOpen);
  // each pending request shows in one tab: urgent ones in Urgent, the rest in Marksheet / Other
  const urgentPendingDocs = awaitingDocs.filter(isUrgentDoc);
  const marksheetPending  = awaitingDocs.filter(d => !isUrgentDoc(d) && requestSection(d) === 'Marksheet');
  const otherPending      = awaitingDocs.filter(d => !isUrgentDoc(d) && requestSection(d) === 'Other');
  const dispatchedDocs= docs.filter(d => DISPATCHED_STATUSES.includes(d.status));
  const totalDocs     = docs.length;

  // ── CSV Export ───────────────────────────────────────────────
  function downloadCSV(type) {
    const list = type === 'enrolled' ? enrolled : pending;
    const label = type === 'enrolled' ? 'enrolled' : 'pending';
    const rows = list.map(s => ({
      'Name':            s.name || '',
      'Status':          s.applicationStatus || '',
      'Phone':           s.phone || '',
      'Email':           s.email || '',
      'Father Name':     s.fatherName || '',
      'Mother Name':     s.motherName || '',
      'DOB':             s.dob ? new Date(s.dob).toLocaleDateString('en-IN') : '',
      'Gender':          s.gender || '',
      'Aadhaar':         s.aadharNumber || '',
      'Address':         s.address || '',
      'Course':          s.courseName || '',
      'Sesssion':      s.courseYear || '',
      '10th %':          s.tenth_percent || '',
      '10th Year':       s.tenth_year || '',
      '10th Board':      s.tenth_board || '',
      '12th %':          s.twelfth_percent || '',
      '12th Year':       s.twelfth_year || '',
      '12th Board':      s.twelfth_board || '',
      'Enrollment No':   s.enrollmentNumber || '',
    }));

    if (rows.length === 0) { toast.error('No students to export'); return; }

    const headers = Object.keys(rows[0]);
    const escape  = v => `"${String(v).replace(/"/g, '""')}"`;
    const csv     = [headers.map(escape).join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
    const blob    = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = `students_${label}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} ${label} students`);
  }

  function toggleDocSelection(docId) {
    const id = String(docId);
    setSelectedDocIds(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  }

  function toggleAllDocs(list) {
    const ids = list.map(d => String(d._id));
    const allOn = ids.length > 0 && ids.every(id => selectedDocIds.includes(id));
    setSelectedDocIds(prev => (allOn ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
  }

  // A student opened from a request card: the full list entry when we have it (it carries the status)
  function openDocStudent(st) {
    if (!st?._id) return;
    setModalStudent(allStudents.find(x => String(x._id) === String(st._id)) || st);
  }

  // Request tabs: kind is 'Marksheet', 'Other' or 'urgent'
  const inRequestTab = (kind, d) => (kind === 'urgent'
    ? isUrgentDoc(d) && (!urgentSection || requestSection(d) === urgentSection)
    : requestSection(d) === kind);
  const tabPendingDocs = kind => filtDocs.filter(d => d.status === 'Sent_To_University' && !d.correctionOpen && inRequestTab(kind, d) && (kind === 'urgent' || !isUrgentDoc(d)));
  const tabCorrectionDocs = () => filtDocs.filter(d => d.status === 'Sent_To_University' && d.correctionOpen)
    .sort((a, b) => new Date(a.correctionSentAt || 0) - new Date(b.correctionSentAt || 0));
  const kindNoun = kind => (kind === 'urgent' ? 'urgent' : kind === 'Marksheet' ? 'marksheet' : 'other document');
  // Sent tabs: requests the university has sent (Dispatch received them), latest received first
  const receivedTime = d => new Date(receivedOn(d) || d.updatedAt || 0).getTime();
  const tabSentDocs = section => filtDocs
    .filter(d => DISPATCHED_STATUSES.includes(d.status) && requestSection(d) === section)
    .sort((a, b) => receivedTime(b) - receivedTime(a));

  function downloadSentCSV(section) {
    const list = tabSentDocs(section);
    if (!list.length) return toast.error(`No ${kindNoun(section)}s sent yet`);
    const rows = list.map(d => ({
      'Student Name': d.student?.name || '',
      'Enrollment Number': d.student?.enrollmentNumber || '',
      'Course': d.student?.courseName || '',
      'Document': d.name || '',
      'Copy': d.requestType || '',
      'Urgent': isUrgentDoc(d) ? 'Yes' : 'No',
      'Requested On': fmtDt(requestedAt(d)),
      'Received On': receivedOn(d) ? fmtDt(receivedOn(d)) : 'On the way',
      'Courier': d.courierInfo?.company || '',
      'Tracking No': d.courierInfo?.trackingNo || '',
    }));
    const headers = Object.keys(rows[0]);
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `university_${section === 'Marksheet' ? 'marksheet' : 'other'}_sent_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} documents`);
  }

  function downloadDocRequestsCSV(kind) {
    const pendingList = tabPendingDocs(kind);
    const selected = pendingList.filter(d => selectedDocIds.includes(String(d._id)));
    const list = selected.length ? selected : pendingList;
    if (!list.length) return toast.error(`No ${kindNoun(kind)} requests to export`);
    const grouped = new Map();   // one row per student and section
    list.forEach(doc => {
      const section = requestSection(doc);
      const sid = `${String(doc.student?._id || doc.student?.enrollmentNumber || doc.student?.name || doc._id)}|${section}`;
      if (!grouped.has(sid)) grouped.set(sid, { student: doc.student || {}, section, urgent: false, docs: [] });
      const g = grouped.get(sid);
      g.docs.push(doc.name);
      if (isUrgentDoc(doc)) g.urgent = true;
    });
    const rows = [...grouped.values()].map(({ student, section, urgent, docs }) => ({
      'Student Name': student.name || '',
      'Enrollment Number': student.enrollmentNumber || '',
      'Course': student.courseName || '',
      'Section': SECTION_META[section].label,
      'Request Type': urgent ? 'Urgent' : 'Normal',
      'Requested Documents': docs.join(' | '),
    }));
    const headers = Object.keys(rows[0]);
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `university_${kind === 'urgent' ? 'urgent' : kind === 'Marksheet' ? 'marksheet' : 'other'}_doc_requests_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} students`);
  }

  // Search filters
  const q  = search.toLowerCase();
  const dq = docSearch.toLowerCase();
  const filtPending  = pending.filter(s => !q || s.name?.toLowerCase().includes(q) || s.enrollmentNumber?.toLowerCase().includes(q) || s.phone?.includes(q));
  const filtEnrolled = enrolled.filter(s => !q || s.name?.toLowerCase().includes(q) || s.enrollmentNumber?.toLowerCase().includes(q) || s.phone?.includes(q));
  const filtCancelled = cancelled.filter(s => !q || s.name?.toLowerCase().includes(q) || s.enrollmentNumber?.toLowerCase().includes(q) || s.phone?.includes(q));
  const filtDocs     = docs.filter(d => !dq || d.name?.toLowerCase().includes(dq) || d.student?.name?.toLowerCase().includes(dq) || d.student?.enrollmentNumber?.toLowerCase().includes(dq) || d.courierInfo?.trackingNo?.toLowerCase().includes(dq));

  function renderRequestTab(kind) {
    const isUrgentTab = kind === 'urgent';
    const noun = kindNoun(kind);
    const pendingList = tabPendingDocs(kind);
    const selectedHere = pendingList.filter(d => selectedDocIds.includes(String(d._id))).length;
    const allSelected = pendingList.length > 0 && selectedHere === pendingList.length;
    const urgentOfSection = isUrgentTab ? 0 : urgentPendingDocs.filter(d => requestSection(d) === kind).length;
    // pending in this tab before the search box
    const anyPending = docs.some(d => d.status === 'Sent_To_University' && inRequestTab(kind, d) && (isUrgentTab || !isUrgentDoc(d)));
    const EmptyIcon = isUrgentTab ? AlertTriangle : SECTION_META[kind].icon;
    return (
      <>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
            <Input className="pl-9 pr-9" placeholder={`Search ${noun} requests…`}
              value={docSearch} onChange={e => setDocSearch(e.target.value)}/>
            {docSearch && <button onClick={() => setDocSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4"/></button>}
          </div>
          <Button variant="outline" className={`gap-2 ${isUrgentTab ? 'border-red-300 text-red-700 hover:bg-red-50' : ''}`}
            onClick={() => downloadDocRequestsCSV(kind)} disabled={pendingList.length === 0}>
            <Download className="h-4 w-4"/>CSV {selectedHere ? `(${selectedHere})` : isUrgentTab ? 'Urgent Requests' : 'Requests'}
          </Button>
        </div>

        {isUrgentTab && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Urgent requests by section">
            {[['', 'All'], ['Marksheet', 'Marksheet'], ['Other', 'Other Documents']].map(([val, label]) => {
              const on = urgentSection === val;
              const n = urgentPendingDocs.filter(d => !val || requestSection(d) === val).length;
              return (
                <button key={label} type="button" aria-pressed={on} onClick={() => setUrgentSection(val)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${on ? 'border-red-600 bg-red-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:text-red-700'}`}>
                  {label} <span className="tabular-nums opacity-80">{n}</span>
                </button>
              );
            })}
          </div>
        )}

        {urgentOfSection > 0 && (
          <button type="button" onClick={() => { setUrgentSection(kind); setTab('urgent'); }}
            className="flex w-full items-center gap-2 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-left text-xs font-medium text-red-700 hover:bg-red-50">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0"/>
            <span className="flex-1">{urgentOfSection} urgent {noun} request{urgentOfSection === 1 ? ' is' : 's are'} in the Urgent Requests tab</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0"/>
          </button>
        )}

        {pendingList.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <input type="checkbox" checked={allSelected} onChange={() => toggleAllDocs(pendingList)} aria-label="Select all"
                className={`h-4 w-4 ${isUrgentTab ? 'accent-red-600' : 'accent-purple-600'}`}/>
              <div className={`h-2 w-2 rounded-full animate-pulse ${isUrgentTab ? 'bg-red-500' : 'bg-amber-500'}`}/>
              <span className={`text-sm font-semibold ${isUrgentTab ? 'text-red-700' : 'text-amber-700'}`}>
                {isUrgentTab ? 'Urgent Pending Requests' : 'Pending My Action'} ({pendingList.length})
              </span>
              {selectedHere > 0 && <span className="text-xs text-muted-foreground">· {selectedHere} selected</span>}
            </div>
            {pendingList.map(d => (
              <PendingRequestCard key={d._id} d={d} showSection={isUrgentTab}
                selected={selectedDocIds.includes(String(d._id))} onToggle={() => toggleDocSelection(d._id)}
                onOpenStudent={openDocStudent}/>
            ))}
          </div>
        )}

        {pendingList.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {anyPending ? (
              <><Search className="h-10 w-10 mx-auto mb-3 opacity-40"/>No results{docSearch ? ` for "${docSearch}"` : ''}</>
            ) : (
              <>
                <EmptyIcon className={`h-10 w-10 mx-auto mb-3 ${isUrgentTab ? 'text-red-300' : 'text-emerald-400'}`}/>
                <p>No pending {noun} requests</p>
                <p className="text-xs mt-1">Requests that reached our office are in Marksheet Sent / Other Doc Sent.</p>
              </>
            )}
          </div>
        )}
      </>
    );
  }

  function downloadCorrectionCSV() {
    const list = tabCorrectionDocs();
    if (!list.length) return toast.error('No documents need correction');
    const rows = list.map(d => ({
      'Student Name': d.student?.name || '',
      'Enrollment Number': d.student?.enrollmentNumber || '',
      'Course': d.student?.courseName || '',
      'Document': d.name || '',
      'Section': SECTION_META[requestSection(d)].label,
      'Correction Needed': d.correctionNote || '',
      'Sent Back On': fmtDt(d.correctionSentAt),
      'Times Sent Back': d.correctionCount || 1,
    }));
    const headers = Object.keys(rows[0]);
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `university_correction_needed_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} documents`);
  }

  function renderCorrectionTab() {
    const list = tabCorrectionDocs();
    return (
      <>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
            <Input className="pl-9 pr-9" placeholder="Search documents needing correction…"
              value={docSearch} onChange={e => setDocSearch(e.target.value)}/>
            {docSearch && <button onClick={() => setDocSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4"/></button>}
          </div>
          <Button variant="outline" className="gap-2 border-amber-300 text-amber-800 hover:bg-amber-50" onClick={downloadCorrectionCSV} disabled={list.length === 0}>
            <Download className="h-4 w-4"/>CSV Corrections
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Documents our office found a mistake in. Correct them and send the corrected copy — it then shows under Marksheet Sent / Other Doc Sent.</p>
        {list.length > 0
          ? list.map(d => <CorrectionCard key={d._id} d={d} onOpenStudent={openDocStudent}/>)
          : (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-400"/>
              {correctionDocs.length ? `No results${docSearch ? ` for "${docSearch}"` : ''}` : 'No document needs correction'}
            </div>
          )}
      </>
    );
  }

  function renderSentTab(section) {
    const noun = kindNoun(section);
    const list = tabSentDocs(section);
    const anySent = docs.some(d => DISPATCHED_STATUSES.includes(d.status) && requestSection(d) === section);
    return (
      <>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
            <Input className="pl-9 pr-9" placeholder={`Search sent ${noun}s…`}
              value={docSearch} onChange={e => setDocSearch(e.target.value)}/>
            {docSearch && <button onClick={() => setDocSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4"/></button>}
          </div>
          <Button variant="outline" className="gap-2" onClick={() => downloadSentCSV(section)} disabled={list.length === 0}>
            <Download className="h-4 w-4"/>CSV Sent
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{noun.charAt(0).toUpperCase() + noun.slice(1)} requests you have sent, with the date each reached our office.</p>
        {list.length > 0
          ? list.map(d => <SentCard key={d._id} d={d} onOpenStudent={openDocStudent}/>)
          : (
            <div className="text-center py-12 text-muted-foreground">
              <Send className="h-10 w-10 mx-auto mb-3 opacity-40"/>
              {anySent ? `No results${docSearch ? ` for "${docSearch}"` : ''}` : `No ${noun}s sent yet`}
            </div>
          )}
      </>
    );
  }

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/>
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-purple-600"/>University Portal
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage student admissions and document requests
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => downloadCSV('pending')} disabled={pending.length===0}>
            <Download className="h-4 w-4"/>Pending CSV ({pending.length})
          </Button>
          <Button variant="outline" size="sm" className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => downloadCSV('enrolled')} disabled={enrolled.length===0}>
            <Download className="h-4 w-4"/>Enrolled CSV ({enrolled.length})
          </Button>
          {pending.length > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"/>
              <span className="text-sm text-amber-700 font-medium">{pending.length} awaiting enrollment</span>
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          icon={GraduationCap}
          label="Total Students"
          value={allStudents.length}
          sub={`${pending.length} pending · ${enrolled.length} enrolled`}
          color="text-purple-600"
        />
        <StatCard
          icon={BadgeCheck}
          label="Enrolled"
          value={enrolled.length}
          sub="Enrollment numbers assigned"
          color="text-emerald-600"
          trend={enrolled.length > 0 ? `${Math.round((enrolled.length/Math.max(allStudents.length,1))*100)}% completion rate` : null}
        />
        <StatCard
          icon={FileText}
          label="Document Requests"
          value={totalDocs}
          sub={`${marksheetPending.length} marksheet · ${otherPending.length} other · ${urgentPendingDocs.length} urgent pending`}
          color="text-blue-600"
        />
        <StatCard
          icon={XCircle}
          label="Cancelled"
          value={cancelled.length}
          sub="Applications cancelled by Admin"
          color="text-slate-500"
        />
      </div>

      {/* ── Quick Overview Row ───────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Pending Action card */}
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm text-amber-700 flex items-center gap-2">
              <Clock className="h-4 w-4"/>Requires Action
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {pending.length > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Enrollment Pending</span>
                <span className="font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">{pending.length}</span>
              </div>
            )}
            {[
              ['marksheetreq', 'Marksheet Requests', marksheetPending.length, 'text-violet-700 bg-violet-100'],
              ['otherreq',     'Other Doc Requests', otherPending.length,     'text-sky-700 bg-sky-100'],
              ['urgent',       'Urgent Doc Requests', urgentPendingDocs.length, 'text-red-700 bg-red-100'],
              ['correction',   'Correction Needed',   correctionDocs.length,    'text-amber-800 bg-amber-100'],
            ].filter(([, , n]) => n > 0).map(([val, label, n, tone]) => (
              <button key={val} type="button" onClick={() => { if (val === 'urgent') setUrgentSection(''); setTab(val); }}
                className="flex w-full items-center justify-between text-sm rounded hover:bg-amber-100/60 -mx-1 px-1">
                <span className="text-muted-foreground">{label}</span>
                <span className={`font-bold px-2 py-0.5 rounded ${tone}`}>{n}</span>
              </button>
            ))}
            {pending.length === 0 && awaitingDocs.length === 0 && correctionDocs.length === 0 && (
              <p className="text-sm text-muted-foreground">All clear ✓</p>
            )}
          </CardContent>
        </Card>

        {/* Document status breakdown */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600"/>Document Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5">
            {[
              ['Sent_To_University',    'Pending My Action'],
              ['University_Dispatched', 'Sent to Dispatch'],
              ['Dispatch_Received',     'Dispatch Confirmed Receipt'],
              ['Scanned',               'Scanned by Dispatch'],
              ['Counselor_Received',    'With Counselor'],
              ['Payment_Verified',      'Payment Verified'],
              ['Dispatched',            'Dispatched to Center'],
              ['Delivered',             'Delivered'],
            ].map(([status, label]) => {
              const count = docs.filter(d => d.status === status).length;
              if (count === 0) return null;
              const si = DOC_STATUS[status];
              return (
                <div key={status} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className={`h-1.5 w-1.5 rounded-full ${si?.dot || 'bg-gray-400'}`}/>
                    <span className="text-muted-foreground">{label}</span>
                  </div>
                  <span className="font-semibold">{count}</span>
                </div>
              );
            })}
            {docs.length === 0 && <p className="text-xs text-muted-foreground">No documents yet</p>}
          </CardContent>
        </Card>

        {/* Recent dispatches */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Truck className="h-4 w-4 text-teal-600"/>Recent Dispatches
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {dispatchedDocs.slice(0,3).map(d => (
              <div key={d._id} className="text-xs">
                <div className="font-medium truncate">{d.student?.name} · {d.name}</div>
                {d.courierInfo?.trackingNo && (
                  <div className="text-muted-foreground font-mono">{d.courierInfo.trackingNo}</div>
                )}
              </div>
            ))}
            {dispatchedDocs.length === 0 && <p className="text-xs text-muted-foreground">No dispatches yet</p>}
            {dispatchedDocs.length > 3 && (
              <p className="text-xs text-muted-foreground">+{dispatchedDocs.length-3} more</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Main Tabs ────────────────────────────────────────── */}
      <div>
        {/* Combined search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
          <Input className="pl-9 pr-9"
            placeholder="Search student name, enrollment no., phone…"
            value={search} onChange={e => setSearch(e.target.value)}/>
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4"/>
            </button>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap h-auto gap-1 bg-slate-100 p-1 rounded-xl">
            {[
              { val:'pending',    label:'Pending Enrollment',  count: pending.length,       dot:'bg-amber-500',  icon: <Clock className="h-3.5 w-3.5"/> },
              // a count only on tabs with work waiting; Enrolled / Cancelled / Dispatched History are records
              { val:'enrolled',   label:'Enrolled',            count: 0,                    dot:'',              icon: <CheckCircle2 className="h-3.5 w-3.5"/> },
              { val:'cancelled',  label:'Cancelled',           count: 0,                    dot:'',              icon: <XCircle className="h-3.5 w-3.5"/> },
              { val:'marksheetreq', label:'Marksheet Requests', count: marksheetPending.length, dot:'bg-violet-500', icon: <GraduationCap className="h-3.5 w-3.5"/> },
              { val:'otherreq',   label:'Other Doc Requests',  count: otherPending.length,  dot:'bg-sky-500',    icon: <FileText className="h-3.5 w-3.5"/> },
              { val:'urgent',     label:'Urgent Requests',     count: urgentPendingDocs.length, dot:'bg-red-500', icon: <AlertTriangle className="h-3.5 w-3.5"/> },
              { val:'correction', label:'Correction Needed',   count: correctionDocs.length, dot:'bg-amber-500', icon: <Undo2 className="h-3.5 w-3.5"/> },
              { val:'marksheetsent', label:'Marksheet Sent',   count: 0,                    dot:'',              icon: <Send className="h-3.5 w-3.5"/> },
              { val:'othersent',  label:'Other Doc Sent',      count: 0,                    dot:'',              icon: <Send className="h-3.5 w-3.5"/> },
              { val:'dispatched', label:'Dispatched History',  count: 0,                    dot:'',              icon: <Truck className="h-3.5 w-3.5"/> },
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

          {/* ── Pending Enrollment ───────────────────────── */}
          <TabsContent value="pending" className="space-y-2 mt-4">
            {filtPending.length === 0
              ? <div className="text-center py-12 text-muted-foreground">
                  {pending.length === 0
                    ? <><CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500"/><p>All students enrolled!</p></>
                    : <p>No results for "{search}"</p>}
                </div>
              : filtPending.map(s => (
                <Card key={s._id} className="border-l-4 border-l-amber-400 hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 cursor-pointer" onClick={() => setModalStudent(s)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-base">{s.name}</span>
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pending Enrollment</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 mt-2 text-xs text-muted-foreground">
                          {s.courseName    && <span className="flex items-center gap-1"><BookOpen className="h-3 w-3"/>{s.courseName} {s.courseYear}</span>}
                          {s.phone         && <span className="flex items-center gap-1"><User className="h-3 w-3"/>{s.phone}</span>}
                          {s.fatherName    && <span>Father: {s.fatherName}</span>}
                          {s.email         && <span>{s.email}</span>}
                        </div>
                        {s.submissionDocs?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {s.submissionDocs.map((d,i) => (
                              <span key={i} className="text-xs flex items-center gap-1 bg-muted border rounded px-2 py-0.5">
                                <Paperclip className="h-3 w-3 text-muted-foreground"/>
                                {d.fileUrl
                                  ? <a href={`${MEDIA}${d.fileUrl}`} target="_blank" rel="noreferrer" className="text-blue-600 underline" onClick={e=>e.stopPropagation()}>{d.name}</a>
                                  : <span>{d.name}</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => setModalStudent(s)}>
                          <Eye className="h-3.5 w-3.5"/>
                        </Button>
                        <Button size="sm" className="bg-purple-600 hover:bg-purple-700"
                          onClick={() => { setSelStudent(s); setEnrNum(''); setEnrOpen(true); }}>
                          <BadgeCheck className="h-3.5 w-3.5 mr-1"/>Assign
                        </Button>
                        <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50"
                          onClick={() => { setRejectStudent(s); setRejectReason(''); setRejectOpen(true); }}>
                          <XCircle className="h-3.5 w-3.5 mr-1"/>Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            }
          </TabsContent>

          {/* ── Enrolled Students ────────────────────────── */}
          <TabsContent value="enrolled" className="space-y-2 mt-4">
            {filtEnrolled.length === 0
              ? <div className="text-center py-12 text-muted-foreground">
                  {enrolled.length === 0 ? 'No enrolled students yet' : `No results for "${search}"`}
                </div>
              : filtEnrolled.map(s => {
                  const studentDocCount = docs.filter(d => String(d.student?._id||d.student) === String(s._id)).length;
                  const dispatched = docs.filter(d => String(d.student?._id||d.student) === String(s._id) && DISPATCHED_STATUSES.includes(d.status)).length;
                  return (
                    <Card key={s._id} className="border-l-4 border-l-emerald-400 cursor-pointer hover:shadow-sm transition-shadow"
                      onClick={() => setModalStudent(s)}>
                      <CardContent className="p-4 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{s.name}</span>
                            <span className="text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                              {s.enrollmentNumber}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3">
                            {s.courseName    && <span>{s.courseName} {s.courseYear}</span>}
                            {s.phone         && <span>{s.phone}</span>}
                          </div>
                          {(studentDocCount > 0) && (
                            <div className="flex gap-3 mt-1.5 text-xs">
                              {studentDocCount > 0 && <span className="text-blue-600"><FileText className="h-3 w-3 inline mr-0.5"/>{studentDocCount} doc request{studentDocCount!==1?'s':''}</span>}
                              {dispatched > 0 && <span className="text-teal-600"><Truck className="h-3 w-3 inline mr-0.5"/>{dispatched} dispatched</span>}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0"/>
                      </CardContent>
                    </Card>
                  );
                })
            }
          </TabsContent>

          {/* ── Cancelled Students ────────────────────────── */}
          <TabsContent value="cancelled" className="space-y-2 mt-4">
            {filtCancelled.length === 0 ? (
              <div className="text-center py-12 border border-dashed rounded-lg">
                <XCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2 opacity-40"/>
                <p className="text-sm text-muted-foreground">No cancelled students</p>
              </div>
            ) : filtCancelled.map(s => (
              <Card key={s._id} className="border-slate-200 bg-slate-50/50">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-700">{s.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 font-medium border border-slate-300">
                          🚫 Cancelled
                        </span>
                        {s.enrollmentNumber && (
                          <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {s.enrollmentNumber}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                        {s.center?.name   && <span>{s.center.name}</span>}
                        {s.courseName     && <span>· {s.courseName} {s.courseYear}</span>}
                        {s.phone          && <span>· {s.phone}</span>}
                      </div>
                      {s.rejectionReason && (
                        <div className="mt-1.5 text-xs bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600">
                          <span className="font-semibold">Reason:</span> {s.rejectionReason}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ── Document Requests: Marksheet / Other Documents / Urgent ── */}
          <TabsContent value="marksheetreq" className="space-y-3 mt-4">{renderRequestTab('Marksheet')}</TabsContent>
          <TabsContent value="otherreq" className="space-y-3 mt-4">{renderRequestTab('Other')}</TabsContent>
          <TabsContent value="urgent" className="space-y-3 mt-4">{renderRequestTab('urgent')}</TabsContent>
          <TabsContent value="correction" className="space-y-3 mt-4">{renderCorrectionTab()}</TabsContent>
          <TabsContent value="marksheetsent" className="space-y-3 mt-4">{renderSentTab('Marksheet')}</TabsContent>
          <TabsContent value="othersent" className="space-y-3 mt-4">{renderSentTab('Other')}</TabsContent>

          <TabsContent value="dispatched" className="space-y-2 mt-4">
            <p className="text-sm text-muted-foreground">Complete record of all documents dispatched from university.</p>
            {dispatchedDocs.length === 0
              ? <div className="text-center py-12 text-muted-foreground">
                  <Truck className="h-10 w-10 mx-auto mb-3"/>No dispatches yet
                </div>
              : dispatchedDocs.map(d => {
                  const si = docStatusInfo(d);
                  return (
                    <Card key={d._id} className="border-l-4 border-l-teal-400">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{d.name}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${si.color}`}>{si.label}</span>
                              <SectionBadge d={d}/>
                              {isUrgentDoc(d) && <UrgentBadge/>}
                            </div>
                            <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
  Student: <b>{d.student?.name}</b>
  {d.student?.enrollmentNumber && (
    <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
      {d.student.enrollmentNumber}
    </span>
  )}
</div>

                            {/* Courier details box */}
                            {d.courierInfo && (d.courierInfo.dispatchDate || d.courierInfo.documentsDesc || d.courierInfo.trackingNo || d.courierInfo.company) && (
                              <div className="mt-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-xs grid grid-cols-2 gap-x-4 gap-y-0.5">
                                {d.courierInfo.company && <div><span className="text-muted-foreground">Company:</span> <b>{d.courierInfo.company}</b></div>}
                                {d.courierInfo.trackingNo && <div><span className="text-muted-foreground">Tracking:</span> <b className="font-mono">{d.courierInfo.trackingNo}</b></div>}
                                {d.courierInfo.dispatchDate && <div><span className="text-muted-foreground">Date:</span> {fmtDt(d.courierInfo.dispatchDate)}</div>}
                                {d.courierInfo.documentsDesc && <div><span className="text-muted-foreground">Docs:</span> {d.courierInfo.documentsDesc}</div>}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
            }
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Enrollment Dialog ────────────────────────────────── */}
      <Dialog open={enrOpen} onOpenChange={setEnrOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Enrollment Number</DialogTitle></DialogHeader>
          <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
            <div className="font-semibold text-base">{selStudent?.name}</div>
            <div className="text-muted-foreground">{selStudent?.courseName} {selStudent?.courseYear}</div>
            {selStudent?.fatherName && <div>Father: {selStudent.fatherName}</div>}
            {selStudent?.phone && <div>{selStudent.phone}</div>}
          </div>
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            ⚠ This will permanently lock the student's core fields.
          </p>
          <div>
            <Label>Enrollment Number *</Label>
            <Input value={enrNum} onChange={e => setEnrNum(e.target.value)}
              placeholder="e.g. 2024MBA001" className="font-mono text-lg mt-1"/>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={assignEnrollment} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}
              <BadgeCheck className="h-4 w-4 mr-1"/>Confirm & Lock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject Application Dialog ────────────────────────── */}
      <Dialog open={rejectOpen} onOpenChange={v => { setRejectOpen(v); if (!v) setRejectReason(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center">
                <XCircle className="h-4 w-4 text-red-600"/>
              </div>
              Reject Application
            </DialogTitle>
          </DialogHeader>
          <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
            <div className="font-semibold text-base">{rejectStudent?.name}</div>
            <div className="text-muted-foreground">{rejectStudent?.courseName} {rejectStudent?.courseYear}</div>
            {rejectStudent?.center?.name && <div className="text-xs text-slate-500">Center: {rejectStudent.center.name}</div>}
          </div>
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            This will reject the application and send it back to the accountant for further action.
          </p>
          <div>
            <Label>Rejection Reason *</Label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Please provide a reason for rejection..."
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={rejectApplication} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}
              <XCircle className="h-4 w-4 mr-1"/>Reject Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Doc Dispatch Dialog removed — university no longer sends courier info via panel */}
      {false && <Dialog open={docDispOpen} onOpenChange={setDocDispOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send Document to Dispatch</DialogTitle></DialogHeader>
          <div className="bg-muted/30 rounded-lg p-3 text-sm">
            <div className="font-medium">{selDoc?.name}</div>
            <div className="text-muted-foreground">Student: {selDoc?.student?.name}</div>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Courier Company </Label><Input value={dispForm.company} onChange={e=>setDispForm(p=>({...p,company:e.target.value}))} placeholder="BlueDart, DTDC…"/></div>
              <div><Label>Tracking No. </Label><Input value={dispForm.trackingNo} onChange={e=>setDispForm(p=>({...p,trackingNo:e.target.value}))} placeholder="e.g. BD123456"/></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Dispatch Date</Label><Input type="date" value={dispForm.dispatchDate} onChange={e=>setDispForm(p=>({...p,dispatchDate:e.target.value}))}/></div>
              <div><Label>Documents Description</Label><Input value={dispForm.documentsDesc} onChange={e=>setDispForm(p=>({...p,documentsDesc:e.target.value}))}/></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocDispOpen(false)}>Cancel</Button>
            <Button onClick={sendDocToDispatch} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}
              <Truck className="h-4 w-4 mr-1"/>Send to Dispatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}

      {/* ── Student Detail Modal ─────────────────────────────── */}
      {modalStudent && (
        <StudentModal
          student={modalStudent}
          docs={docs}
          onClose={() => setModalStudent(null)}
          onAssign={s => { setSelStudent(s); setEnrNum(''); setEnrOpen(true); }}
          onReject={s => { setRejectStudent(s); setRejectReason(''); setRejectOpen(true); }}
        />
      )}
    </div>
  );
}

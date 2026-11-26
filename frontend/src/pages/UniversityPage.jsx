import { MEDIA } from '../lib/api';
import { useState, useEffect, useCallback } from 'react';
import {
  BadgeCheck, Truck, Paperclip, Search, Eye, Loader2, GraduationCap, FileText, CheckCircle2, Download, ChevronRight, History, Send, XCircle, AlertTriangle, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const [urgentSection, setUrgentSection] = useState('');
  const [now] = useState(() => Date.now());   // for "waiting N days"   // Urgent tab filter: '' (all) | 'Marksheet' | 'Other'

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

  // Request tabs: kind is 'all', 'Marksheet', 'Other' or 'urgent'
  const inRequestTab = (kind, d) => (kind === 'urgent'
    ? isUrgentDoc(d) && (!urgentSection || requestSection(d) === urgentSection)
    : kind === 'all' || requestSection(d) === kind);
  const tabPendingDocs = kind => filtDocs.filter(d => d.status === 'Sent_To_University' && !d.correctionOpen && inRequestTab(kind, d) && (kind === 'urgent' || !isUrgentDoc(d)));
  const tabCorrectionDocs = () => filtDocs.filter(d => d.status === 'Sent_To_University' && d.correctionOpen)
    .sort((a, b) => new Date(a.correctionSentAt || 0) - new Date(b.correctionSentAt || 0));
  const kindNoun = kind => (kind === 'urgent' ? 'urgent' : kind === 'all' ? 'document' : kind === 'Marksheet' ? 'marksheet' : 'other document');
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
    const grouped = new Map();   // one row per student and section; documents oldest request first
    [...list].sort((a, b) => new Date(requestedAt(a) || 0) - new Date(requestedAt(b) || 0)).forEach(doc => {
      const section = requestSection(doc);
      const sid = `${String(doc.student?._id || doc.student?.enrollmentNumber || doc.student?.name || doc._id)}|${section}`;
      if (!grouped.has(sid)) grouped.set(sid, { student: doc.student || {}, section, urgent: false, docs: [], dates: [] });
      const g = grouped.get(sid);
      g.docs.push(doc.name);
      g.dates.push(fmtDt(requestedAt(doc)));
      if (isUrgentDoc(doc)) g.urgent = true;
    });
    const rows = [...grouped.values()].map(({ student, section, urgent, docs, dates }) => ({
      'Student Name': student.name || '',
      'Enrollment Number': student.enrollmentNumber || '',
      'Course': student.courseName || '',
      'Section': SECTION_META[section].label,
      'Request Type': urgent ? 'Urgent' : 'Normal',
      'Requested Documents': docs.join(' | '),
      'Requested On': dates.join(' | '),   // the date each document was requested, in the same order
    }));
    const headers = Object.keys(rows[0]);
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `university_${kind === 'urgent' ? 'urgent' : kind === 'all' ? 'all' : kind === 'Marksheet' ? 'marksheet' : 'other'}_doc_requests_${new Date().toISOString().split('T')[0]}.csv`;
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

  // ── how long something has waited, as a coloured badge ──
  function waitBadge(at) {
    if (!at) return <span className="text-xs text-slate-400">—</span>;
    const days = Math.max(0, Math.floor((now - new Date(at).getTime()) / 86400000));
    const tone = days >= 14 ? 'bg-red-50 text-red-700' : days >= 7 ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-600';
    return <span className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${tone}`}>{days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`}</span>;
  }
  const thCls = 'px-3 py-2.5 font-semibold';
  const tdCls = 'px-3 py-3 align-top';
  const emptyRow = (cols, text) => (
    <tr><td colSpan={cols} className="px-3 py-14 text-center text-sm text-slate-500">{text}</td></tr>
  );
  const copyTag = d => d.requestType && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{d.requestType}</span>;

  // Document requests waiting for the university: one row per document, oldest first
  function renderRequestTab(kind) {
    const isUrgentTab = kind === 'urgent';
    const noun = kindNoun(kind);
    const pendingList = [...tabPendingDocs(kind)].sort((a, b) => new Date(requestedAt(a) || 0) - new Date(requestedAt(b) || 0));
    const selectedHere = pendingList.filter(d => selectedDocIds.includes(String(d._id))).length;
    const allSelected = pendingList.length > 0 && selectedHere === pendingList.length;
    const anyPending = docs.some(d => d.status === 'Sent_To_University' && !d.correctionOpen && inRequestTab(kind, d) && (isUrgentTab || !isUrgentDoc(d)));
    return (
      <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="w-10 px-4 py-2.5"><input type="checkbox" checked={allSelected} onChange={() => toggleAllDocs(pendingList)} aria-label="Select all" className="h-4 w-4 accent-indigo-600"/></th>
                <th className={thCls}>Student</th>
                <th className={thCls}>Course</th>
                <th className={thCls}>{kind === 'Marksheet' ? 'Marksheet' : 'Document'}</th>
                <th className={thCls}>Requested on</th>
                <th className={thCls}>Waiting</th>
              </tr>
            </thead>
            <tbody>
              {pendingList.length === 0
                ? emptyRow(6, anyPending ? `No results${docSearch ? ` for "${docSearch}"` : ''}` : `No pending ${noun} requests. Ones that reached our office are under "Sent to the office".`)
                : pendingList.map(d => {
                  const checked = selectedDocIds.includes(String(d._id));
                  return (
                    <tr key={d._id} className={`border-t border-slate-100 ${checked ? 'bg-indigo-50/50' : 'hover:bg-slate-50/70'}`}>
                      <td className="px-4 py-3 align-top"><input type="checkbox" checked={checked} onChange={() => toggleDocSelection(d._id)} aria-label={`Select ${d.name}`} className="mt-0.5 h-4 w-4 accent-indigo-600"/></td>
                      <td className={tdCls}><StudentLink student={d.student} onOpen={openDocStudent}/><div className="mt-0.5"><EnrollmentChip student={d.student}/></div></td>
                      <td className={`${tdCls} text-slate-600`}>{d.student?.courseName || '—'}</td>
                      <td className={tdCls}>
                        <div className="font-medium text-slate-900">{d.name}</div>
                        <div className="mt-1 flex flex-wrap gap-1">{(isUrgentTab || kind === 'all') && <SectionBadge d={d}/>}{isUrgentDoc(d) && <UrgentBadge/>}{copyTag(d)}</div>
                      </td>
                      <td className={`${tdCls} whitespace-nowrap text-slate-600`}>{fmtDt(requestedAt(d))}</td>
                      <td className={tdCls}>{waitBadge(requestedAt(d))}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <span>{pendingList.length} request{pendingList.length === 1 ? '' : 's'}{selectedHere ? ` · ${selectedHere} selected` : ''}</span>
          <span>CSV: student, enrollment, course, documents, requested on{selectedHere ? ' — only the selected ones' : ''}</span>
        </div>
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
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className={`${thCls} pl-4`}>Student</th>
              <th className={thCls}>Document</th>
              <th className={thCls}>What to correct</th>
              <th className={thCls}>Sent back</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0
              ? emptyRow(4, correctionDocs.length ? `No results${docSearch ? ` for "${docSearch}"` : ''}` : 'No document needs correction')
              : list.map(d => (
                <tr key={d._id} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className={`${tdCls} pl-4`}><StudentLink student={d.student} onOpen={openDocStudent}/><div className="mt-0.5"><EnrollmentChip student={d.student}/></div></td>
                  <td className={tdCls}><div className="font-medium text-slate-900">{d.name}</div><div className="mt-1 flex flex-wrap gap-1"><SectionBadge d={d}/>{isUrgentDoc(d) && <UrgentBadge/>}{copyTag(d)}</div></td>
                  <td className={tdCls}><div className="rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-orange-900">{d.correctionNote || '—'}</div></td>
                  <td className={`${tdCls} whitespace-nowrap text-slate-600`}>{fmtDt(d.correctionSentAt)}{d.correctionCount > 1 && <div className="text-xs font-semibold text-orange-700">{d.correctionCount} times</div>}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderSentTab(section) {
    const noun = kindNoun(section);
    const list = tabSentDocs(section);
    const anySent = docs.some(d => DISPATCHED_STATUSES.includes(d.status) && requestSection(d) === section);
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className={`${thCls} pl-4`}>Student</th>
              <th className={thCls}>{section === 'Marksheet' ? 'Marksheet' : 'Document'}</th>
              <th className={thCls}>Requested on</th>
              <th className={thCls}>Received at office</th>
              <th className={thCls}>Courier</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0
              ? emptyRow(5, anySent ? `No results${docSearch ? ` for "${docSearch}"` : ''}` : `No ${noun}s sent yet`)
              : list.map(d => {
                const received = receivedOn(d);
                return (
                  <tr key={d._id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className={`${tdCls} pl-4`}><StudentLink student={d.student} onOpen={openDocStudent}/><div className="mt-0.5"><EnrollmentChip student={d.student}/></div></td>
                    <td className={tdCls}><div className="font-medium text-slate-900">{d.name}</div><div className="mt-1 flex flex-wrap gap-1">{isUrgentDoc(d) && <UrgentBadge/>}{d.correctionCount > 0 && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">Corrected copy</span>}{copyTag(d)}</div></td>
                    <td className={`${tdCls} whitespace-nowrap text-slate-600`}>{fmtDt(requestedAt(d))}</td>
                    <td className={tdCls}>{received
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/>{fmtDt(received)}</span>
                      : <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700"><Truck className="h-3.5 w-3.5"/>On the way</span>}</td>
                    <td className={`${tdCls} text-xs text-slate-600`}>{hasCourier(d.courierInfo) ? <>{d.courierInfo.company}{d.courierInfo.trackingNo && <span className="ml-1 font-mono">{d.courierInfo.trackingNo}</span>}</> : '—'}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    );
  }

  function renderPendingTab() {
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className={`${thCls} pl-4`}>Student</th>
              <th className={thCls}>Course</th>
              <th className={thCls}>Father</th>
              <th className={thCls}>Submitted documents</th>
              <th className={`${thCls} pr-4 text-right`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtPending.length === 0
              ? emptyRow(5, pending.length === 0 ? 'All students enrolled' : `No results for "${search}"`)
              : filtPending.map(s => (
                <tr key={s._id} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className={`${tdCls} pl-4`}>
                    <button type="button" onClick={() => setModalStudent(s)} className="font-semibold text-slate-900 hover:text-indigo-700 hover:underline">{s.name}</button>
                    {s.phone && <div className="text-xs text-slate-500">{s.phone}</div>}
                  </td>
                  <td className={`${tdCls} text-slate-600`}>{[s.courseName, s.courseYear].filter(Boolean).join(' ') || '—'}</td>
                  <td className={`${tdCls} text-slate-600`}>{s.fatherName || '—'}</td>
                  <td className={tdCls}>
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {(s.submissionDocs || []).map((d, i) => d.fileUrl
                        ? <a key={i} href={`${MEDIA}${d.fileUrl}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs text-indigo-700 hover:bg-indigo-50"><Paperclip className="h-3 w-3"/>{d.name}</a>
                        : <span key={i} className="rounded-md border border-slate-200 px-1.5 py-0.5 text-xs text-slate-500">{d.name}</span>)}
                      {!s.submissionDocs?.length && <span className="text-xs text-slate-400">—</span>}
                    </div>
                  </td>
                  <td className={`${tdCls} pr-4`}>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" aria-label={`View ${s.name}`} onClick={() => setModalStudent(s)}><Eye className="h-4 w-4"/></Button>
                      <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => { setSelStudent(s); setEnrNum(''); setEnrOpen(true); }}><BadgeCheck className="mr-1 h-4 w-4"/>Assign</Button>
                      <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => { setRejectStudent(s); setRejectReason(''); setRejectOpen(true); }}><XCircle className="mr-1 h-4 w-4"/>Reject</Button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderEnrolledTab() {
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className={`${thCls} pl-4`}>Student</th>
              <th className={thCls}>Enrollment no.</th>
              <th className={thCls}>Course</th>
              <th className={thCls}>Phone</th>
              <th className={thCls}>Document requests</th>
            </tr>
          </thead>
          <tbody>
            {filtEnrolled.length === 0
              ? emptyRow(5, enrolled.length === 0 ? 'No enrolled students yet' : `No results for "${search}"`)
              : filtEnrolled.map(s => {
                const mine = docs.filter(d => String(d.student?._id || d.student) === String(s._id));
                const sent = mine.filter(d => DISPATCHED_STATUSES.includes(d.status)).length;
                return (
                  <tr key={s._id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className={`${tdCls} pl-4`}><button type="button" onClick={() => setModalStudent(s)} className="font-semibold text-slate-900 hover:text-indigo-700 hover:underline">{s.name}</button></td>
                    <td className={tdCls}><span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-xs font-bold text-emerald-700">{s.enrollmentNumber}</span></td>
                    <td className={`${tdCls} text-slate-600`}>{[s.courseName, s.courseYear].filter(Boolean).join(' ') || '—'}</td>
                    <td className={`${tdCls} text-slate-600`}>{s.phone || '—'}</td>
                    <td className={`${tdCls} text-xs text-slate-600`}>{mine.length ? `${mine.length} request${mine.length === 1 ? '' : 's'}${sent ? ` · ${sent} sent` : ''}` : '—'}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    );
  }

  function renderCancelledTab() {
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className={`${thCls} pl-4`}>Student</th>
              <th className={thCls}>Enrollment no.</th>
              <th className={thCls}>Centre</th>
              <th className={thCls}>Course</th>
              <th className={thCls}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {filtCancelled.length === 0
              ? emptyRow(5, 'No cancelled students')
              : filtCancelled.map(s => (
                <tr key={s._id} className="border-t border-slate-100">
                  <td className={`${tdCls} pl-4`}>
                    <button type="button" onClick={() => setModalStudent(s)} className="font-semibold text-slate-900 hover:text-indigo-700 hover:underline">{s.name}</button>
                    {s.phone && <div className="text-xs text-slate-500">{s.phone}</div>}
                  </td>
                  <td className={tdCls}>{s.enrollmentNumber ? <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-xs font-bold text-emerald-700">{s.enrollmentNumber}</span> : '—'}</td>
                  <td className={`${tdCls} text-slate-600`}>{s.center?.name || '—'}</td>
                  <td className={`${tdCls} text-slate-600`}>{[s.courseName, s.courseYear].filter(Boolean).join(' ') || '—'}</td>
                  <td className={`${tdCls} text-slate-600`}>{s.rejectionReason || '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderHistoryTab() {
    const list = filtDocs.filter(d => DISPATCHED_STATUSES.includes(d.status));
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className={`${thCls} pl-4`}>Document</th>
              <th className={thCls}>Student</th>
              <th className={thCls}>Where it is</th>
              <th className={thCls}>Courier</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0
              ? emptyRow(4, dispatchedDocs.length ? `No results${docSearch ? ` for "${docSearch}"` : ''}` : 'No dispatches yet')
              : list.map(d => {
                const si = docStatusInfo(d);
                return (
                  <tr key={d._id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className={`${tdCls} pl-4`}><div className="font-medium text-slate-900">{d.name}</div><div className="mt-1 flex flex-wrap gap-1"><SectionBadge d={d}/>{isUrgentDoc(d) && <UrgentBadge/>}</div></td>
                    <td className={tdCls}><StudentLink student={d.student} onOpen={openDocStudent}/><div className="mt-0.5"><EnrollmentChip student={d.student}/></div></td>
                    <td className={tdCls}><span className={`rounded-full px-2 py-0.5 text-xs ${si.color}`}>{si.label}</span></td>
                    <td className={`${tdCls} text-xs text-slate-600`}>{hasCourier(d.courierInfo) ? <>{d.courierInfo.company}{d.courierInfo.trackingNo && <span className="ml-1 font-mono">{d.courierInfo.trackingNo}</span>}{d.courierInfo.dispatchDate && <span> · {fmtDt(d.courierInfo.dispatchDate)}</span>}</> : '—'}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    );
  }

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/>
    </div>
  );

  // ── Cards on top (one per area, a count of what is there), tabs inside the chosen one, then its rows ──
  const CARDS = [
    { key: 'pending',    first: 'pending',       label: 'Pending enrollment', dot: 'bg-amber-500', tone: 'text-amber-700',   count: pending.length,
      sub: pending.length ? 'to enroll' : 'all enrolled', tabs: ['pending'] },
    { key: 'requests',   first: 'allreq',        label: 'Document requests', dot: 'bg-blue-600',  tone: 'text-blue-700',    count: marksheetPending.length + otherPending.length,
      sub: `${marksheetPending.length} marksheet · ${otherPending.length} other`, tabs: ['allreq', 'marksheetreq', 'otherreq'] },
    { key: 'urgent',     first: 'urgent',        label: 'Urgent requests', dot: 'bg-red-600',     tone: 'text-red-700',     count: urgentPendingDocs.length,
      sub: urgentPendingDocs.length ? 'send first' : 'none waiting', tabs: ['urgent'] },
    { key: 'correction', first: 'correction',    label: 'Correction needed', dot: 'bg-orange-500', tone: 'text-orange-700', count: correctionDocs.length,
      sub: correctionDocs.length ? 'to correct' : 'none waiting', tabs: ['correction'] },
    { key: 'sent',       first: 'marksheetsent', label: 'Document sent',  dot: 'bg-emerald-600', tone: 'text-emerald-700', count: dispatchedDocs.length,
      sub: `${dispatchedDocs.filter(d => requestSection(d) === 'Marksheet').length} marksheet · ${dispatchedDocs.filter(d => requestSection(d) === 'Other').length} other`,
      tabs: ['marksheetsent', 'othersent', 'dispatched'] },
    { key: 'enrolled',   first: 'enrolled',      label: 'Enrolled',       dot: 'bg-slate-500',   tone: 'text-slate-700',   count: enrolled.length,
      sub: 'students', tabs: ['enrolled'] },
    { key: 'cancelled',  first: 'cancelled',     label: 'Cancelled',      dot: 'bg-zinc-400',    tone: 'text-zinc-600',    count: cancelled.length,
      sub: 'admissions', tabs: ['cancelled'] },
  ];
  const card = CARDS.find(c => c.tabs.includes(tab)) || CARDS[0];
  const TAB_LABEL = {
    allreq: ['All', marksheetPending.length + otherPending.length], marksheetreq: ['Marksheet', marksheetPending.length], otherreq: ['Other documents', otherPending.length],
    marksheetsent: ['Marksheet sent'], othersent: ['Other doc sent'], dispatched: ['All sent (history)'],
  };
  const isStudentTab = ['pending', 'enrolled', 'cancelled'].includes(tab);
  const requestKind = { allreq: 'all', marksheetreq: 'Marksheet', otherreq: 'Other', urgent: 'urgent' }[tab];
  const selectedInTab = requestKind ? tabPendingDocs(requestKind).filter(d => selectedDocIds.includes(String(d._id))) : [];
  const urgentElsewhere = requestKind && requestKind !== 'urgent'
    ? urgentPendingDocs.filter(d => requestKind === 'all' || requestSection(d) === requestKind).length : 0;
  const segBtn = on => `rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`;

  return (
    <div className="space-y-5 pb-16">

      {/* ── Header ──────────────────────────────────────────── */}
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">University portal</h1>
        <p className="text-sm text-slate-500">Enrollments and document requests for your students</p>
      </header>

      {/* ── Cards ── */}
      <nav aria-label="Portal sections" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {CARDS.map(c => {
          const on = card.key === c.key;
          return (
            <button key={c.key} type="button" aria-pressed={on} title={`${c.label} — ${c.sub}`}
              onClick={() => { if (c.key === 'urgent') setUrgentSection(''); setTab(c.first); }}
              className={`flex min-w-0 flex-col gap-1.5 rounded-xl border bg-white px-3 py-2.5 text-left shadow-sm transition-colors ${on ? 'border-indigo-600 ring-1 ring-indigo-600' : 'border-slate-200 hover:border-slate-300'}`}>
              <span className={`flex min-w-0 items-center gap-1.5 text-xs font-semibold ${c.tone}`}>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`}/><span className="truncate whitespace-nowrap">{c.label}</span>
              </span>
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="text-lg font-bold leading-none text-slate-900 tabular-nums">{c.count}</span>
                <span className="truncate whitespace-nowrap text-[11px] text-slate-500">{c.sub}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* ── The chosen area: tabs, search, export, rows ── */}
      <section aria-label={card.label} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {card.tabs.length > 1 && (
              <div role="tablist" aria-label={card.label} className="inline-flex rounded-xl bg-slate-100 p-1">
                {card.tabs.map(t => (
                  <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={segBtn(tab === t)}>
                    {TAB_LABEL[t][0]}{TAB_LABEL[t][1] !== undefined && <span className="ml-1.5 tabular-nums text-slate-400">{TAB_LABEL[t][1]}</span>}
                  </button>
                ))}
              </div>
            )}
            {tab === 'urgent' && (
              <div role="tablist" aria-label="Urgent requests" className="inline-flex rounded-xl bg-slate-100 p-1">
                {[['', 'All'], ['Marksheet', 'Marksheet'], ['Other', 'Other documents']].map(([val, label]) => (
                  <button key={label} type="button" role="tab" aria-selected={urgentSection === val} onClick={() => setUrgentSection(val)} className={segBtn(urgentSection === val)}>
                    {label}<span className="ml-1.5 tabular-nums text-slate-400">{urgentPendingDocs.filter(d => !val || requestSection(d) === val).length}</span>
                  </button>
                ))}
              </div>
            )}
            {card.tabs.length === 1 && tab !== 'urgent' && <span className="text-[13px] font-semibold text-slate-700">{card.label}</span>}
            {urgentElsewhere > 0 && (
              <button type="button" onClick={() => { setUrgentSection(requestKind === 'all' ? '' : requestKind); setTab('urgent'); }}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-[13px] font-semibold text-red-700 hover:bg-red-100">
                <AlertTriangle className="h-3.5 w-3.5"/>{urgentElsewhere} urgent — under Urgent<ChevronRight className="h-3.5 w-3.5"/>
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-9 min-w-[240px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-slate-400">
              <Search className="h-4 w-4"/>
              <input type="search" value={isStudentTab ? search : docSearch} onChange={e => (isStudentTab ? setSearch : setDocSearch)(e.target.value)}
                placeholder={isStudentTab ? 'Name, enrollment no., phone' : 'Student, enrollment no., document'} aria-label="Search"
                className="flex-1 bg-transparent text-sm text-slate-900 outline-none"/>
            </label>
            {(tab === 'pending' || tab === 'enrolled') && (
              <Button variant="outline" size="sm" className="h-9" onClick={() => downloadCSV(tab)} disabled={(tab === 'pending' ? pending : enrolled).length === 0}>
                <Download className="mr-1.5 h-4 w-4"/>Export CSV
              </Button>
            )}
            {requestKind && (
              <Button variant="outline" size="sm" className="h-9" onClick={() => downloadDocRequestsCSV(requestKind)} disabled={tabPendingDocs(requestKind).length === 0}>
                <Download className="mr-1.5 h-4 w-4"/>Export CSV
              </Button>
            )}
            {tab === 'correction' && (
              <Button variant="outline" size="sm" className="h-9" onClick={downloadCorrectionCSV} disabled={tabCorrectionDocs().length === 0}><Download className="mr-1.5 h-4 w-4"/>Export CSV</Button>
            )}
            {(tab === 'marksheetsent' || tab === 'othersent') && (
              <Button variant="outline" size="sm" className="h-9" onClick={() => downloadSentCSV(tab === 'marksheetsent' ? 'Marksheet' : 'Other')}
                disabled={tabSentDocs(tab === 'marksheetsent' ? 'Marksheet' : 'Other').length === 0}><Download className="mr-1.5 h-4 w-4"/>Export CSV</Button>
            )}
          </div>
        </div>
        {tab === 'pending' && renderPendingTab()}
        {tab === 'enrolled' && renderEnrolledTab()}
        {tab === 'cancelled' && renderCancelledTab()}
        {requestKind && renderRequestTab(requestKind)}
        {tab === 'correction' && renderCorrectionTab()}
        {tab === 'marksheetsent' && renderSentTab('Marksheet')}
        {tab === 'othersent' && renderSentTab('Other')}
        {tab === 'dispatched' && renderHistoryTab()}
      </section>

      {/* ── Selection bar (only while something is selected) ── */}
      {selectedInTab.length > 0 && (
        <div role="toolbar" aria-label="Selected requests" className="sticky bottom-4 z-20 mx-auto flex w-fit flex-wrap items-center gap-3 rounded-2xl bg-slate-900 py-2.5 pl-5 pr-2.5 text-white shadow-xl">
          <span className="text-sm font-semibold">{selectedInTab.length} selected</span>
          <span className="h-5 w-px bg-slate-600"/>
          <Button size="sm" className="h-9 bg-white text-slate-900 hover:bg-slate-100" onClick={() => downloadDocRequestsCSV(requestKind)}>
            <Download className="mr-1.5 h-4 w-4"/>Export CSV
          </Button>
          <Button size="sm" variant="ghost" aria-label="Clear selection" className="h-9 text-slate-300 hover:bg-slate-800 hover:text-white"
            onClick={() => { const ids = selectedInTab.map(d => String(d._id)); setSelectedDocIds(prev => prev.filter(x => !ids.includes(x))); }}>
            <X className="h-4 w-4"/>
          </Button>
        </div>
      )}


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

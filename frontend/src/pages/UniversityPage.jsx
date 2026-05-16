import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, BadgeCheck, Truck, Paperclip, Search, X, Eye,
  Loader2, GraduationCap, FileText, Package, TrendingUp,
  Clock, CheckCircle2, Hash, User, Building2, Download,
  ChevronRight, History, Send, XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { studentsApi, docsApi } from '@/lib/api';

const MEDIA  = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
const fmtDt  = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const fmtFull= d => d ? new Date(d).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}) : '—';

const DOC_STATUS = {
  Sent_To_University:   { label:'Pending Action',     color:'bg-amber-100 text-amber-700',    dot:'bg-amber-500' },
  University_Dispatched:{ label:'Sent to Dispatch',   color:'bg-teal-100 text-teal-700',      dot:'bg-teal-500' },
  Dispatch_Received:    { label:'Dispatch Received',  color:'bg-blue-100 text-blue-700',      dot:'bg-blue-500' },
  Scanned:              { label:'Scanned',             color:'bg-indigo-100 text-indigo-700',  dot:'bg-indigo-500' },
  Counselor_Received:   { label:'With Counselor',     color:'bg-purple-100 text-purple-700',  dot:'bg-purple-500' },
  Payment_Verified:     { label:'Payment Verified',   color:'bg-green-100 text-green-700',    dot:'bg-green-500' },
  Dispatched:           { label:'Dispatched to Center',color:'bg-emerald-100 text-emerald-700',dot:'bg-emerald-500' },
  Delivered:            { label:'Delivered',           color:'bg-emerald-100 text-emerald-700',dot:'bg-emerald-600' },
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
  const isEnrolled = student.applicationStatus === 'Enrolled';

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
              ['Year/Batch',   s.courseYear],
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
                  const si = DOC_STATUS[d.status] || { label: d.status, color: 'bg-gray-100 text-gray-700' };
                  return (
                    <div key={d._id} className="flex items-center justify-between gap-2 bg-muted/20 rounded px-3 py-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{d.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${si.color}`}>{si.label}</span>
                        </div>
                        {d.courierInfo?.trackingNo && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            🚚 {d.courierInfo.company} · {d.courierInfo.trackingNo} · {fmtDt(d.courierInfo.dispatchDate)}
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
                  {d.courierInfo?.trackingNo && (
                    <div className="text-muted-foreground">
                      {d.courierInfo.company} · <span className="font-mono">{d.courierInfo.trackingNo}</span> · {fmtDt(d.courierInfo.dispatchDate)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {!isEnrolled && onReject && (
            <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50" onClick={() => { onClose(); onReject(student); }}>
              <XCircle className="h-4 w-4 mr-1"/>Reject Application
            </Button>
          )}
          {!isEnrolled && onAssign && (
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
  const [pending,  setPending]  = useState([]);
  const [enrolled, setEnrolled] = useState([]);
  const [docs,     setDocs]     = useState([]);
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

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [s, d] = await Promise.all([studentsApi.getAll(), docsApi.list({ all: '1' })]);
      setPending(s.filter(x => x.applicationStatus === 'Sent_To_University'));
      setEnrolled(s.filter(x => x.applicationStatus === 'Enrolled'));
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
    if (!dispForm.trackingNo.trim()) return toast.error('Tracking number required');
    if (!dispForm.company.trim())    return toast.error('Courier company required');
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
  const allStudents   = [...pending, ...enrolled];
  const pendingDocs   = docs.filter(d => d.status === 'Sent_To_University');
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
      'Year/Batch':      s.courseYear || '',
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

  // Search filters
  const q  = search.toLowerCase();
  const dq = docSearch.toLowerCase();
  const filtPending  = pending.filter(s => !q || s.name?.toLowerCase().includes(q) || s.enrollmentNumber?.toLowerCase().includes(q) || s.phone?.includes(q));
  const filtEnrolled = enrolled.filter(s => !q || s.name?.toLowerCase().includes(q) || s.enrollmentNumber?.toLowerCase().includes(q) || s.phone?.includes(q));
  const filtDocs     = docs.filter(d => !dq || d.name?.toLowerCase().includes(dq) || d.student?.name?.toLowerCase().includes(dq) || d.student?.enrollmentNumber?.toLowerCase().includes(dq) || d.courierInfo?.trackingNo?.toLowerCase().includes(dq));

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
          sub={`${pendingDocs.length} pending action`}
          color="text-blue-600"
        />
        <StatCard
          icon={Truck}
          label="Dispatched"
          value={dispatchedDocs.length}
          sub="Sent to dispatch dept"
          color="text-teal-600"
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
            {pendingDocs.length > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Doc Requests</span>
                <span className="font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">{pendingDocs.length}</span>
              </div>
            )}
            {pending.length === 0 && pendingDocs.length === 0 && (
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

        <Tabs defaultValue="pending">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-slate-100 p-1 rounded-xl">
            {[
              { val:'pending',    label:'Pending Enrollment',  count: pending.length,       dot:'bg-amber-500',  icon: <Clock className="h-3.5 w-3.5"/> },
              { val:'enrolled',   label:'Enrolled',            count: enrolled.length,      dot:'bg-emerald-500',icon: <CheckCircle2 className="h-3.5 w-3.5"/> },
              { val:'docreq',     label:'Doc Requests',        count: pendingDocs.length,   dot:'bg-blue-500',   icon: <FileText className="h-3.5 w-3.5"/> },
              { val:'dispatched', label:'Dispatched History',  count: dispatchedDocs.length,dot:'',              icon: <Truck className="h-3.5 w-3.5"/> },
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

          {/* ── Document Requests ────────────────────────── */}
          <TabsContent value="docreq" className="space-y-3 mt-4">
            {/* Doc search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
              <Input className="pl-9 pr-9" placeholder="Search documents…"
                value={docSearch} onChange={e => setDocSearch(e.target.value)}/>
              {docSearch && <button onClick={() => setDocSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4"/></button>}
            </div>

            {/* Group: Pending Action */}
            {filtDocs.filter(d => d.status === 'Sent_To_University').length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"/>
                  <span className="text-sm font-semibold text-amber-700">Pending My Action ({filtDocs.filter(d=>d.status==='Sent_To_University').length})</span>
                </div>
                {filtDocs.filter(d => d.status === 'Sent_To_University').map(d => (
                  <Card key={d._id} className="border-amber-200 mb-2">
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{d.name}</div>
                       <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
  Student: <b>{d.student?.name}</b>
  {d.student?.enrollmentNumber && (
    <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
      {d.student.enrollmentNumber}
    </span>
  )}
</div>
                        {/* {d.chargeFee > 0 && <div className="text-xs mt-0.5">Charge: <b>₹{d.chargeFee?.toLocaleString('en-IN')}</b></div>} */}
                      </div>
                      <Button size="sm" onClick={() => {
                        setSelDoc(d);
                        setDispForm({ company:'', trackingNo:'', dispatchDate:new Date().toISOString().split('T')[0], documentsDesc:d.name });
                        setDocDispOpen(true);
                      }}>
                        <Send className="h-3.5 w-3.5 mr-1"/>Send to Dispatch
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Group: History — only docs university has already dispatched or processed */}
            {filtDocs.filter(d => DISPATCHED_STATUSES.includes(d.status)).length > 0 && (
              <div>
                <span className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                  <History className="h-4 w-4"/>All Requests History ({filtDocs.filter(d=>DISPATCHED_STATUSES.includes(d.status)).length})
                </span>
                {filtDocs.filter(d => DISPATCHED_STATUSES.includes(d.status)).map(d => {
                  const si = DOC_STATUS[d.status] || { label: d.status, color: 'bg-gray-100 text-gray-700' };
                  return (
                    <div key={d._id} className="flex items-center justify-between border rounded-lg px-4 py-3 bg-card text-sm mb-1.5">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{d.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${si.color}`}>{si.label}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
  {d.student?.name}
  {d.student?.enrollmentNumber && (
    <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
      {d.student.enrollmentNumber}
    </span>
  )}
</div>
                        {d.courierInfo?.trackingNo && (
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Truck className="h-3 w-3"/>
                            {d.courierInfo.company} · <span className="font-mono">{d.courierInfo.trackingNo}</span> · {fmtDt(d.courierInfo.dispatchDate)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {filtDocs.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3"/>
                {docs.length === 0 ? 'No document requests yet' : `No results for "${docSearch}"`}
              </div>
            )}
          </TabsContent>

          {/* ── Dispatched History ───────────────────────── */}
          <TabsContent value="dispatched" className="space-y-2 mt-4">
            <p className="text-sm text-muted-foreground">Complete record of all documents dispatched from university.</p>
            {dispatchedDocs.length === 0
              ? <div className="text-center py-12 text-muted-foreground">
                  <Truck className="h-10 w-10 mx-auto mb-3"/>No dispatches yet
                </div>
              : dispatchedDocs.map(d => {
                  const si = DOC_STATUS[d.status] || { label: d.status, color: 'bg-gray-100 text-gray-700' };
                  return (
                    <Card key={d._id} className="border-l-4 border-l-teal-400">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{d.name}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${si.color}`}>{si.label}</span>
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
                            {d.courierInfo?.trackingNo && (
                              <div className="mt-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-xs grid grid-cols-2 gap-x-4 gap-y-0.5">
                                <div><span className="text-muted-foreground">Company:</span> <b>{d.courierInfo.company}</b></div>
                                <div><span className="text-muted-foreground">Tracking:</span> <b className="font-mono">{d.courierInfo.trackingNo}</b></div>
                                <div><span className="text-muted-foreground">Date:</span> {fmtDt(d.courierInfo.dispatchDate)}</div>
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

      {/* ── Doc Dispatch Dialog ──────────────────────────────── */}
      <Dialog open={docDispOpen} onOpenChange={setDocDispOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send Document to Dispatch</DialogTitle></DialogHeader>
          <div className="bg-muted/30 rounded-lg p-3 text-sm">
            <div className="font-medium">{selDoc?.name}</div>
            <div className="text-muted-foreground">Student: {selDoc?.student?.name}</div>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Courier Company *</Label><Input value={dispForm.company} onChange={e=>setDispForm(p=>({...p,company:e.target.value}))} placeholder="BlueDart, DTDC…"/></div>
              <div><Label>Tracking No. *</Label><Input value={dispForm.trackingNo} onChange={e=>setDispForm(p=>({...p,trackingNo:e.target.value}))} placeholder="e.g. BD123456"/></div>
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
      </Dialog>

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
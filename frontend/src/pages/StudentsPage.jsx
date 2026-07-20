import { useState, useEffect, useCallback } from 'react';
import { useLazyList } from '@/lib/useLazyList';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Loader2, GraduationCap, ChevronRight, Download, X, CheckSquare, Square, Trash2, ArrowRightLeft, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { studentsApi, centersApi, counselorsApi, paymentsApi, docsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const STATUS_COLORS = {
  Draft: 'bg-gray-100 text-gray-700', Submitted: 'bg-blue-100 text-blue-700',
  Changes_Requested: 'bg-amber-100 text-amber-700', Counselor_Approved: 'bg-indigo-100 text-indigo-700',
  Rejected: 'bg-red-100 text-red-700', Accountant_Pending: 'bg-amber-100 text-amber-700',
  Sent_To_University: 'bg-purple-100 text-purple-700', Enrolled: 'bg-emerald-100 text-emerald-700',
  University_Rejected: 'bg-orange-100 text-orange-700',
  Cancelled: 'bg-slate-100 text-slate-600',
};
const STATUS_LABELS = {
  Draft: 'Draft', Submitted: 'Submitted', Changes_Requested: 'Changes Needed',
  Counselor_Approved: 'Approved', Rejected: 'Rejected', Accountant_Pending: 'Fee Pending',
  Sent_To_University: 'At University', Enrolled: 'Enrolled', University_Rejected: 'Uni Rejected',
  Cancelled: 'Cancelled',
};
const ALL_STATUSES = Object.keys(STATUS_LABELS);

const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const fmtAmt  = n => n != null && n !== '' ? Number(n).toString() : '';

// Get the date when application was first submitted from statusHistory
function getSubmittedDate(student) {
  const hist = student.statusHistory || [];
  const entry = hist.find(h => h.status === 'Submitted');
  return entry?.at ? fmtDate(entry.at) : '';
}

export default function StudentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const [centers,    setCenters]    = useState([]);
  const [counselors, setCounselors] = useState([]);

  // Filters
  const [search,    setSearch]    = useState('');
  const [statusF,   setStatusF]   = useState('all');
  const [centerF,   setCenterF]   = useState('all');

  // Selection
  const [selected, setSelected] = useState(new Set());

  // CSV dialog state
  const [csvOpen,    setCsvOpen]    = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');

  // Add student dialog
  const [addOpen, setAddOpen] = useState(false);
  const [form,    setForm]    = useState({ name:'', phone:'', email:'', courseName:'', courseYear:'', center:'', counselor:'' });
  const [saving,  setSaving]  = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStudent, setDeleteStudent] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferStudent, setTransferStudent] = useState(null);
  const [transferCenterId, setTransferCenterId] = useState('');
  const [transferCenterSearch, setTransferCenterSearch] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  async function handleDelete() {
    if (!deleteStudent) return;
    setDeleteLoading(true);
    try {
      await studentsApi.delete(deleteStudent._id);
      toast.success(`${deleteStudent.name} and all related records deleted`);
      setDeleteOpen(false);
      setDeleteStudent(null);
      load();
    } catch(e) { toast.error(e.message); }
    finally { setDeleteLoading(false); }
  }

  const transferTargetCenter = centers.find(c => c._id === transferCenterId);

  function openTransfer(student) {
    setTransferStudent(student);
    setTransferCenterId('');
    setTransferCenterSearch('');
    setTransferNote('');
    setTransferOpen(true);
  }

  async function handleTransfer() {
    if (!transferStudent) return;
    if (!transferCenterId) return toast.error('Target center required');
    if (String(transferStudent.center?._id || transferStudent.center) === String(transferCenterId)) {
      return toast.error('Student is already in this center');
    }
    if (!transferTargetCenter?.assignedCounselor?._id && !transferTargetCenter?.assignedCounselor) {
      return toast.error('Selected center has no assigned counselor');
    }
    setTransferLoading(true);
    try {
      await studentsApi.transferCenter(transferStudent._id, transferCenterId, transferNote);
      toast.success(`${transferStudent.name} transferred to ${transferTargetCenter?.name || 'selected center'}`);
      setTransferOpen(false);
      setTransferStudent(null);
      setTransferCenterId('');
      setTransferCenterSearch('');
      setTransferNote('');
      load();
    } catch(e) { toast.error(e.message); }
    finally { setTransferLoading(false); }
  }

  const fetchStudentsPage = useCallback((page, limit) => {
    const params = { page, limit };
    if (statusF && statusF !== 'all') params.status   = statusF;
    if (centerF && centerF !== 'all') params.centerId = centerF;
    if (search)                        params.search   = search;
    return studentsApi.getAll(params);
  }, [search, statusF, centerF]);

  const { items: students, setItems: setStudents, loading, bgLoading, reload: load } =
    useLazyList(fetchStudentsPage, { limit: 30, deps: [search, statusF, centerF] });

  useEffect(() => {
    Promise.all([centersApi.getAll(), counselorsApi.getAll()])
      .then(([c, co]) => { setCenters(c); setCounselors(co); })
      .catch(() => toast.error('Failed to load centers/counselors'));
  }, []);

  useEffect(() => { setSelected(new Set()); }, [students]);

  // ── Selection helpers ──────────────────────────────────────
  const allSelected  = students.length > 0 && students.every(s => selected.has(s._id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(students.map(s => s._id)));
  }
  function toggleOne(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── CSV Export ─────────────────────────────────────────────
  async function doExportCSV() {
    const toExport = students.filter(s => selected.size === 0 || selected.has(s._id));
    if (toExport.length === 0) { toast.error('No students to export'); return; }

    setCsvLoading(true);
    try {
      const enriched = await Promise.all(toExport.map(async s => {
        let pay = null, docs = [];
        try { pay  = await paymentsApi.get(s._id); }  catch {}
        try { docs = await docsApi.list({ studentId: s._id, all: '1' }); } catch {}
        return { s, pay, docs };
      }));

      const filtered = enriched.filter(({ s }) => {
  if (!dateFrom && !dateTo) return true;
  const submittedDate = getSubmittedDate(s);
  if (!submittedDate) return false;
  const hist = s.statusHistory || [];
  const entry = hist.find(h => h.status === 'Submitted');
  if (!entry?.at) return false;
  const d = new Date(entry.at);
  if (dateFrom && d < new Date(dateFrom)) return false;
  if (dateTo   && d > new Date(dateTo + 'T23:59:59')) return false;
  return true;
});

      if (filtered.length === 0) { toast.error('No students match the date filter'); setCsvLoading(false); return; }

      const headers = [
        // Student basic
        'S.No','Name', 'Father Name', 'Mother Name', 'DOB', 'Gender', 'Phone', 'Email', 'Aadhaar', 'Address',
        'Course', 'Session', 'University', 'Center', 'Counselor', 'Status', 'Enrollment No',
        'Submitted Date', 'Admission Expiry Date',                                       // ← new column
        '10th %', '10th Year', '10th Board', '12th %', '12th Year', '12th Board',
        // Fees
        'Total Fee', 'Discount', 'Net Fee', 'Total Paid', 'Balance Due',
        // Transactions (up to 5)
        'Tx1 Amount', 'Tx1 Mode', 'Tx1 UTR', 'Tx1 Paid Date', 'Tx1 Verified Date', 'Tx1 Status', 'Tx1 Paid To Account',
        'Tx2 Amount', 'Tx2 Mode', 'Tx2 UTR', 'Tx2 Paid Date', 'Tx2 Verified Date', 'Tx2 Status', 'Tx2 Paid To Account',
        'Tx3 Amount', 'Tx3 Mode', 'Tx3 UTR', 'Tx3 Paid Date', 'Tx3 Verified Date', 'Tx3 Status', 'Tx3 Paid To Account',
        'Tx4 Amount', 'Tx4 Mode', 'Tx4 UTR', 'Tx4 Paid Date', 'Tx4 Verified Date', 'Tx4 Status', 'Tx4 Paid To Account',
        'Tx5 Amount', 'Tx5 Mode', 'Tx5 UTR', 'Tx5 Paid Date', 'Tx5 Verified Date', 'Tx5 Status', 'Tx5 Paid To Account',
        'Last Payment Verified Date',
        // Documents (up to 3)
        'Doc1 Name', 'Doc1 Current Status', 'Doc1 Charge', 'Doc1 Paid', 'Doc1 Requested Date', 'Doc1 Request Expiry', 'Doc1 Uni Dispatched Date', 'Doc1 Dispatch Received Date', 'Doc1 Center Dispatched Date', 'Doc1 Center Received Date',
        'Doc2 Name', 'Doc2 Current Status', 'Doc2 Charge', 'Doc2 Paid', 'Doc2 Requested Date', 'Doc2 Request Expiry', 'Doc2 Uni Dispatched Date', 'Doc2 Dispatch Received Date', 'Doc2 Center Dispatched Date', 'Doc2 Center Received Date',
        'Doc3 Name', 'Doc3 Current Status', 'Doc3 Charge', 'Doc3 Paid', 'Doc3 Requested Date', 'Doc3 Request Expiry', 'Doc3 Uni Dispatched Date', 'Doc3 Dispatch Received Date', 'Doc3 Center Dispatched Date', 'Doc3 Center Received Date',
        'Doc4 Name', 'Doc4 Current Status', 'Doc4 Charge', 'Doc4 Paid', 'Doc4 Requested Date', 'Doc4 Request Expiry', 'Doc4 Uni Dispatched Date', 'Doc4 Dispatch Received Date', 'Doc4 Center Dispatched Date', 'Doc4 Center Received Date',
      ];

      const rows = filtered.map((item, rowIdx) => {
        const { s, pay, docs } = item;
        const txs = pay?.transactions || [];
        const verifiedTxs = txs.filter(t => t.verificationStatus === 'verified' && t.verifiedAt);
        const lastVerifiedDate = verifiedTxs.length > 0
          ? fmtDate(verifiedTxs.sort((a,b) => new Date(b.verifiedAt) - new Date(a.verifiedAt))[0].verifiedAt)
          : '';

        const txCols = [];
        for (let i = 0; i < 5; i++) {
          const t = txs[i];
          txCols.push(
            t ? fmtAmt(t.amount)      : '',
            t ? t.mode || ''          : '',
            t ? t.utrRef || ''        : '',
            t ? fmtDate(t.paidAt)     : '',
            t ? fmtDate(t.verifiedAt) : '',
            t ? (t.verificationStatus || '') : '',
            t ? (t.paidToAccountLabel || '') : '',
          );
        }

        const docCols = [];
        for (let i = 0; i < 4; i++) {
          const d = docs[i];
          const docExpiry = (() => {
            if (!d?.createdAt) return '';
            const exp = new Date(d.createdAt);
            exp.setDate(exp.getDate() + 25);
            return fmtDate(exp);
          })();
          docCols.push(
            d ? d.name || ''                       : '',
            d ? (d.status || '').replace(/_/g,' ') : '',
            d ? fmtAmt(d.chargeFee)                : '',
            d ? fmtAmt(d.totalPaid)                : '',
            d ? fmtDate(d.createdAt)               : '',
            d ? docExpiry                          : '',
            (() => {
              if (!d) return '';
              const hist = d.statusHistory || [];
              const entry = hist.find(h => h.status === 'University_Dispatched');
              return entry?.at ? fmtDate(entry.at) : fmtDate(d.courierInfo?.dispatchDate);
            })(),
            (() => {
              if (!d) return '';
              const hist = d.statusHistory || [];
              const entry = hist.find(h => h.status === 'Dispatch_Received');
              return entry?.at ? fmtDate(entry.at) : '';
            })(),
            d ? fmtDate(d.centerCourierInfo?.dispatchDate || '') : '',
            d ? fmtDate(d.deliveredAt || (d.status === 'Delivered' ? d.updatedAt : '')) : '',
          );
        }

        return [
          String(rowIdx + 1),
          s.name || '', s.fatherName || '', s.motherName || '',
          fmtDate(s.dob), s.gender || '', s.phone || '', s.email || '',
          s.aadharNumber || '', s.address || '',
          s.courseName || '', s.courseYear || '',
          s.university?.name || s.universityName || '',
          s.center?.name || '', s.counselor?.name || '',
          STATUS_LABELS[s.applicationStatus] || s.applicationStatus || '',
          s.enrollmentNumber || '',
          getSubmittedDate(s), 
          (() => {
            const hist = s.statusHistory || [];
            const entry = hist.find(h => h.status === 'Submitted');
            if (!entry?.at) return '';
            const exp = new Date(entry.at);
            exp.setDate(exp.getDate() + 16);
            return fmtDate(exp);
          })(),                                  // ← new value
          s.tenth_percent || '', s.tenth_year || '', s.tenth_board || '',
          s.twelfth_percent || '', s.twelfth_year || '', s.twelfth_board || '',
          // Fee
          fmtAmt(pay?.totalFee), fmtAmt(pay?.discount), fmtAmt(pay?.netFee),
          fmtAmt(pay?.paidAmount), fmtAmt(pay?.dueAmount),
          // Transactions
          ...txCols,
          lastVerifiedDate,
          // Docs
          ...docCols,
        ];
      });

      const escape = v => `"${String(v).replace(/"/g, '""')}"`;
      const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      const suffix     = centerF !== 'all' ? `_${centers.find(c=>c._id===centerF)?.name||'center'}` : '';
      const dateSuffix = dateFrom || dateTo ? `_${dateFrom||''}to${dateTo||''}` : '';
      a.download = `students${suffix}${dateSuffix}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`CSV downloaded — ${filtered.length} student${filtered.length > 1 ? 's' : ''}`);
      setCsvOpen(false);
    } catch(e) { toast.error('Export failed: ' + e.message); }
    finally { setCsvLoading(false); }
  }

  async function addStudent() {
    if (!form.name || !form.center || !form.counselor) return toast.error('Name, center and counselor required');
    setSaving(true);
    try {
      await studentsApi.create(form);
      toast.success('Student added'); setAddOpen(false);
      setForm({ name:'', phone:'', email:'', courseName:'', courseYear:'', center:'', counselor:'' });
      load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          Students ({students.length})
          {bgLoading && (
            <span className="flex items-center gap-1.5 text-xs font-normal text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin"/>Loading more…
            </span>
          )}
          {someSelected && <span className="ml-2 text-sm font-normal text-indigo-600">{selected.size} selected</span>}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)}>
            <Download className="h-4 w-4 mr-1"/>CSV
          </Button>
          {isAdmin && <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1"/>Add Student</Button>}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name, phone, email, enrollment…" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        {isAdmin && (
          <Select value={centerF} onValueChange={setCenterF}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Centers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Centers</SelectItem>
              {centers.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Select All bar */}
      {!loading && students.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
          <button onClick={toggleAll} className="flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 transition-colors">
            {allSelected
              ? <CheckSquare className="h-4 w-4 text-indigo-600"/>
              : <Square className="h-4 w-4"/>}
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          {someSelected && (
            <>
              <span className="text-xs text-slate-400">|</span>
              <span className="text-xs text-slate-500">{selected.size} of {students.length} selected for CSV</span>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-400 hover:text-red-500 flex items-center gap-1">
                <X className="h-3 w-3"/>Clear
              </button>
            </>
          )}
          {!someSelected && <span className="text-xs text-slate-400 ml-2">Select students for CSV, or leave unselected to export all</span>}
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/></div>
      ) : students.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-lg">
          <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No students found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {students.map(s => (
            <Card key={s._id}
              className={`transition-colors cursor-pointer ${selected.has(s._id) ? 'border-indigo-400 bg-indigo-50/30' : 'hover:border-primary/50'}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={e => { e.stopPropagation(); toggleOne(s._id); }}
                    className="flex-shrink-0 text-slate-300 hover:text-indigo-500 transition-colors"
                  >
                    {selected.has(s._id)
                      ? <CheckSquare className="h-4 w-4 text-indigo-600"/>
                      : <Square className="h-4 w-4"/>}
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); openTransfer(s); }}
                        className="flex-shrink-0 text-slate-300 hover:text-indigo-600 transition-colors p-1"
                        title="Transfer student to another center"
                      >
                        <ArrowRightLeft className="h-4 w-4"/>
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteStudent(s); setDeleteOpen(true); }}
                        className="flex-shrink-0 text-slate-300 hover:text-red-500 transition-colors p-1"
                        title="Delete student"
                      >
                        <Trash2 className="h-4 w-4"/>
                      </button>
                    </>
                  )}
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-3"
                    onClick={() => navigate(`/students/${s._id}`)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{s.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[s.applicationStatus] || 'bg-gray-100 text-gray-700'}`}>
                          {STATUS_LABELS[s.applicationStatus] || s.applicationStatus}
                        </span>
                        {s.enrollmentNumber && <span className="text-xs font-mono text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded">{s.enrollmentNumber}</span>}
                        {s.enrollmentNumberChecked && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="h-3 w-3"/>Enrollment Checked
                          </span>
                        )}
                      </div>
                      <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        {s.center?.name    && <span>{s.center.name}</span>}
                        {s.counselor?.name && <span>· {s.counselor.name}</span>}
                        {s.courseName      && <span>· {s.courseName} {s.courseYear}</span>}
                        {s.phone           && <span>· {s.phone}</span>}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── CSV Export Dialog ────────────────────────────────── */}
      <Dialog open={csvOpen} onOpenChange={v => { setCsvOpen(v); if (!v) { setDateFrom(''); setDateTo(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-4 w-4"/>Export CSV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm space-y-1">
              <div className="font-medium text-slate-700">Students to export:</div>
              <div className="text-slate-500">
                {selected.size > 0
                  ? <span className="text-indigo-600 font-semibold">{selected.size} selected student{selected.size > 1 ? 's' : ''}</span>
                  : <span>All <b>{students.length}</b> students (current filters)</span>}
              </div>
              {centerF !== 'all' && <div className="text-xs text-slate-400">Center: {centers.find(c=>c._id===centerF)?.name}</div>}
              {statusF !== 'all' && <div className="text-xs text-slate-400">Status: {STATUS_LABELS[statusF]}</div>}
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Filter by Payment Verified Date <span className="text-slate-400 font-normal normal-case">(optional)</span>
              </Label>
              <p className="text-xs text-slate-400 mt-0.5 mb-2">Only students whose application was submitted in this date range will be included.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-500">From</Label>
                  <Input type="date" className="mt-1 h-9" value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">To</Label>
                  <Input type="date" className="mt-1 h-9" value={dateTo} onChange={e => setDateTo(e.target.value)}/>
                </div>
              </div>
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="mt-1.5 text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                  <X className="h-3 w-3"/>Clear date filter
                </button>
              )}
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 text-xs text-emerald-700 space-y-1">
              <div className="font-semibold">CSV includes:</div>
              <div>✓ Student details (name, DOB, phone, address, marks…)</div>
              <div>✓ Submitted Date (when application was first submitted)</div>
              <div>✓ Fee summary (total, paid, due, discount)</div>
              <div>✓ All payment transactions (amount, mode, UTR, dates)</div>
              <div>✓ Last payment verified date</div>
              <div>✓ Document requests (name, status, charge, paid)</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvOpen(false)}>Cancel</Button>
            <Button onClick={doExportCSV} disabled={csvLoading} className="bg-indigo-600 hover:bg-indigo-700">
              {csvLoading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin"/>Preparing…</> : <><Download className="h-4 w-4 mr-1.5"/>Download CSV</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Student Dialog */}
      <Dialog open={transferOpen} onOpenChange={v => { setTransferOpen(v); if (!v) { setTransferStudent(null); setTransferCenterId(''); setTransferNote(''); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4"/>Transfer Student Center
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="font-semibold text-slate-800">{transferStudent?.name}</div>
              <div className="mt-1 text-sm text-slate-500">
                Current: <span className="font-medium text-slate-700">{transferStudent?.center?.name || 'No center'}</span>
                {transferStudent?.counselor?.name && <span> · {transferStudent.counselor.name}</span>}
              </div>
              {transferStudent?.enrollmentNumber && (
                <div className="mt-1 text-xs font-mono text-emerald-700">{transferStudent.enrollmentNumber}</div>
              )}
            </div>

            <div>
              <Label>New Center *</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  value={transferCenterSearch}
                  onChange={e => setTransferCenterSearch(e.target.value)}
                  placeholder="Search center name, city, counselor..."
                />
              </div>
              <Select value={transferCenterId} onValueChange={setTransferCenterId}>
                <SelectTrigger className="mt-2"><SelectValue placeholder="Select target center..." /></SelectTrigger>
                <SelectContent>
                  {centers.filter(c => {
                    const q = transferCenterSearch.trim().toLowerCase();
                    if (!q) return true;
                    return [c.name, c.city, c.state, c.assignedCounselor?.name]
                      .some(v => String(v || '').toLowerCase().includes(q));
                  }).map(c => {
                    const current = String(c._id) === String(transferStudent?.center?._id || transferStudent?.center);
                    return (
                      <SelectItem key={c._id} value={c._id} disabled={current}>
                        {c.name}{current ? ' (Current)' : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {transferCenterId && (
              <div className={`rounded-xl border px-4 py-3 text-sm ${transferTargetCenter?.assignedCounselor ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                New counselor: <span className="font-semibold">{transferTargetCenter?.assignedCounselor?.name || 'No counselor assigned'}</span>
              </div>
            )}

            <div>
              <Label>Note</Label>
              <Input
                className="mt-1"
                value={transferNote}
                onChange={e => setTransferNote(e.target.value)}
                placeholder="Optional reason for transfer"
              />
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              This will move the student, fee payment record, document requests, and document inventory to the new center and its assigned counselor.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={transferLoading || !transferCenterId || !transferTargetCenter?.assignedCounselor} className="bg-indigo-600 hover:bg-indigo-700">
              {transferLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}
              Transfer Student
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Student Dialog */}
      {/* ── Delete Confirm Dialog ─────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={v => { setDeleteOpen(v); if (!v) setDeleteStudent(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-4 w-4"/>Delete Student Record
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-red-700">{deleteStudent?.name}</p>
              {deleteStudent?.phone && <p className="text-xs text-red-500 mt-0.5">{deleteStudent.phone}</p>}
              {deleteStudent?.courseName && <p className="text-xs text-red-500">{deleteStudent.courseName} {deleteStudent.courseYear}</p>}
              {deleteStudent?.center?.name && <p className="text-xs text-red-500">Center: {deleteStudent.center.name}</p>}
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Following will be permanently deleted:</p>
              <div className="space-y-1 text-xs text-slate-600">
                <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-red-400 flex-shrink-0"/>Student profile & application data</div>
                <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-red-400 flex-shrink-0"/>All fee payment records & transactions</div>
                <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-red-400 flex-shrink-0"/>All document requests & payments</div>
                <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-red-400 flex-shrink-0"/>Status history & audit trail</div>
              </div>
            </div>
            <p className="text-xs text-red-600 font-semibold">⚠ This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button onClick={handleDelete} disabled={deleteLoading} className="bg-red-600 hover:bg-red-700">
              {deleteLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}
              <Trash2 className="h-4 w-4 mr-1"/>Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Student Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Student</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Full Name *</Label><Input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} /></div>
            <div><Label>Course</Label><Input value={form.courseName} onChange={e=>setForm(p=>({...p,courseName:e.target.value}))} /></div>
            <div><Label>Year / Batch</Label><Input value={form.courseYear} onChange={e=>setForm(p=>({...p,courseYear:e.target.value}))} /></div>
            <div>
              <Label>Center *</Label>
              <Select value={form.center} onValueChange={v=>setForm(p=>({...p,center:v}))}>
                <SelectTrigger><SelectValue placeholder="Select…"/></SelectTrigger>
                <SelectContent>{centers.map(c=><SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Counselor *</Label>
              <Select value={form.counselor} onValueChange={v=>setForm(p=>({...p,counselor:v}))}>
                <SelectTrigger><SelectValue placeholder="Select…"/></SelectTrigger>
                <SelectContent>{counselors.map(c=><SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setAddOpen(false)}>Cancel</Button>
            <Button onClick={addStudent} disabled={saving}>{saving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Add Student</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

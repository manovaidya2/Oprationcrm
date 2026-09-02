import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Edit2, Trash2, Loader2, Building2, User, Key,
  UserPlus, ChevronDown, ChevronUp, MapPin, Phone,
  Globe, Users, GraduationCap, Clock, BookOpen, CheckCircle2, ChevronRight, Eye, Paperclip, Search, X, Download, CreditCard,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { centersApi, counselorsApi, authApi, studentsApi, universitiesApi, paymentAccountsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// ── Options matching WhatsApp Flow ──────────────────────────
const MEDIA = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
const ORG_TYPES     = ['Education Consultant','Admission Centre','Coaching Institute','School/Institute','Freelance Consultant','Other'];
const EXPERIENCE    = ['0 to 1 year','1 to 3 years','3 to 7 years','7+ years'];
const TEAM_SIZES    = ['Solo','2 to 5','6 to 15','15+'];
const ENQUIRIES     = ['Under 20','20 to 50','50 to 150','150+'];
const COVERAGE      = ['City','State','Multiple States','PAN India'];
const TIMELINES     = ['Immediate (0 to 15 days)','15 to 30 days','1 to 3 months','Not sure'];
const PROGRAMS      = ['UG','PG','Diploma/Certificate','Research/PhD (if applicable)'];
const STREAMS_LIST  = ['Management','IT/Computer','Education','Arts','Science','Healthcare','Engineering','Other'];
const FEE_STRUCTURES = ['Very Special', 'Special', 'Normal'];
const LOGIN_PROVISION_OPTIONS = ['Login Provided', 'Login Not Provided'];
const NO_VIEWER_COUNSELOR = '__no_viewer_counselor__';

const csvEscape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
const csvDate = value => value ? new Date(value).toLocaleDateString('en-IN') : '';
const joinList = value => Array.isArray(value) ? value.filter(Boolean).join(' | ') : (value || '');

function downloadCsv(filename, headers, rows) {
  const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const EMPTY_FORM = {
  // Screen 1
  organisationType:'', fullName:'', organisationName:'', name:'',
  emailId:'', city:'', state:'', website:'', contactNumber:'', address:'',
  // Screen 2
  experience:'', teamSize:'', monthlyEnquiries:'', coverage:'',
  programInterest:[], streams:[], timeline:'',
};

// ── Multi-select checkbox group ──────────────────────────────
function CheckboxGroup({ label, options, selected, onChange }) {
  return (
    <div>
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex flex-wrap gap-2 mt-1.5">
        {options.map(opt => {
          const checked = selected.includes(opt);
          return (
            <button key={opt} type="button"
              onClick={() => onChange(checked ? selected.filter(x => x !== opt) : [...selected, opt])}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                checked
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-foreground hover:border-primary/50'
              }`}>
              {checked && '✓ '}{opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}


const STATUS_COLORS = {
  Draft:'bg-gray-100 text-gray-700', Submitted:'bg-blue-100 text-blue-700',
  Changes_Requested:'bg-amber-100 text-amber-700', Counselor_Approved:'bg-indigo-100 text-indigo-700',
  Rejected:'bg-red-100 text-red-700', Accountant_Pending:'bg-amber-100 text-amber-700',
  Accountant_Rejected:'bg-red-100 text-red-700', Sent_To_University:'bg-purple-100 text-purple-700',
  Enrolled:'bg-emerald-100 text-emerald-700',
};
const STATUS_LABELS = {
  Draft:'Draft', Submitted:'Under Review', Changes_Requested:'Changes Needed',
  Counselor_Approved:'Approved', Rejected:'Rejected', Accountant_Pending:'Fee Pending',
  Accountant_Rejected:'Acct Rejected', Sent_To_University:'At University', Enrolled:'Enrolled',
};

function CenterStudentsModal({ center, onClose }) {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');

  useEffect(() => {
    if (!center) return;
    studentsApi.getAll({ centerId: center._id })
      .then(setStudents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [center?._id]);

  const filtered = students.filter(s =>
    !search ||
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.phone?.includes(search) ||
    s.enrollmentNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const statusCounts = students.reduce((acc, s) => {
    acc[s.applicationStatus] = (acc[s.applicationStatus] || 0) + 1;
    return acc;
  }, {});

  if (!center) return null;
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4"/>
            {center.name}
            <span className="text-sm font-normal text-muted-foreground">— {students.length} students</span>
          </DialogTitle>
        </DialogHeader>

        {/* Status summary pills */}
        {!loading && students.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(statusCounts).map(([st, cnt]) => (
              <span key={st} className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[st] || 'bg-gray-100 text-gray-700'}`}>
                {STATUS_LABELS[st] || st}: {cnt}
              </span>
            ))}
          </div>
        )}

        {/* Search */}
        {students.length > 5 && (
          <div className="relative">
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm pl-9 bg-background"
              placeholder="Search by name, phone, enrollment…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <Eye className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
          </div>
        )}

        {/* Student list */}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/></div>
        ) : students.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <GraduationCap className="h-10 w-10 mx-auto mb-3"/>
            <p>No students in this center</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map(s => (
              <div key={s._id}
                className="flex items-center justify-between border rounded-lg px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => { onClose(); navigate(`/students/${s._id}`); }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{s.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[s.applicationStatus] || 'bg-gray-100 text-gray-700'}`}>
                      {STATUS_LABELS[s.applicationStatus] || s.applicationStatus}
                    </span>
                    {s.enrollmentNumber && (
                      <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        {s.enrollmentNumber}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                    {s.phone && <span>{s.phone}</span>}
                    {s.courseName && <span>{s.courseName} {s.courseYear}</span>}
                    {s.fatherName && <span>Father: {s.fatherName}</span>}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0"/>
              </div>
            ))}
            {filtered.length === 0 && search && (
              <p className="text-center text-sm text-muted-foreground py-4">No students matching "{search}"</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Center detail card expand ────────────────────────────────
function CenterCard({ center, isAdmin, isViewer = false, canViewerManage = false, viewerCounselor, loginUsers = [], selectedForExport = false, onToggleExport, onEdit, onDelete, onCreateLogin, onResetLogin, onAssignCounselor, onViewStudents, onRefresh }) {
  const [expanded,    setExpanded]    = useState(false);
  const [uploadOpen,  setUploadOpen]  = useState(false);
  const [uploadName,  setUploadName]  = useState('');
  const [uploading,   setUploading]   = useState(false);
  const uploadFileRef = useRef(null);

  // University access management
  const [allUniversities, setAllUniversities] = useState([]);
  const [uniManageOpen,   setUniManageOpen]   = useState(false);
  const [selectedUniIds,  setSelectedUniIds]  = useState([]);
  const [savingUnis,      setSavingUnis]       = useState(false);
  const [allPayAccounts, setAllPayAccounts]   = useState([]);
  const [payManageOpen,  setPayManageOpen]    = useState(false);
  const [selectedPayIds, setSelectedPayIds]   = useState([]);
  const [savingPayAccts, setSavingPayAccts]   = useState(false);
  const [savingFeeStructure, setSavingFeeStructure] = useState(false);
  const [editingFeeStructure, setEditingFeeStructure] = useState(false);
  const [savingLoginProvision, setSavingLoginProvision] = useState(false);
  const [editingLoginProvision, setEditingLoginProvision] = useState(false);

  const programBadges = Array.isArray(center.programInterest) ? center.programInterest : [];
  const streamBadges  = Array.isArray(center.streams) ? center.streams : [];
  const verDocs       = center.verificationDocs || [];
  const allowedUnis   = center.allowedUniversities || [];
  const allowedPayAccts = center.allowedPaymentAccounts || [];

  async function openUniManage() {
    try {
      const unis = await universitiesApi.getAll();
      setAllUniversities(unis);
      setSelectedUniIds((center.allowedUniversities || []).map(u => String(u._id || u)));
      setUniManageOpen(true);
    } catch(e) { toast.error(e.message); }
  }

  async function saveUnis() {
    setSavingUnis(true);
    try {
      await centersApi.setUniversities(center._id, selectedUniIds);
      toast.success('University access updated');
      setUniManageOpen(false);
      onRefresh?.();
    } catch(e) { toast.error(e.message); }
    finally { setSavingUnis(false); }
  }

  async function openPayManage() {
    try {
      const accs = await paymentAccountsApi.list();
      setAllPayAccounts(accs);
      setSelectedPayIds((center.allowedPaymentAccounts || []).map(a => String(a._id || a)));
      setPayManageOpen(true);
    } catch(e) { toast.error(e.message); }
  }

  async function savePayAccts() {
    setSavingPayAccts(true);
    try {
      await centersApi.setPaymentAccounts(center._id, selectedPayIds);
      toast.success('Payment account access updated');
      setPayManageOpen(false);
      onRefresh?.();
    } catch(e) { toast.error(e.message); }
    finally { setSavingPayAccts(false); }
  }

  function togglePayAcct(id) {
    setSelectedPayIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function updateFeeStructure(value) {
    setSavingFeeStructure(true);
    try {
      await centersApi.update(center._id, { feeStructureType: value });
      toast.success('Fee structure updated');
      setEditingFeeStructure(false);
      onRefresh?.();
    } catch(e) { toast.error(e.message); }
    finally { setSavingFeeStructure(false); }
  }

  async function updateLoginProvision(value) {
    setSavingLoginProvision(true);
    try {
      await centersApi.update(center._id, { loginProvisionStatus: value });
      toast.success('Login provision status updated');
      setEditingLoginProvision(false);
      onRefresh?.();
    } catch(e) { toast.error(e.message); }
    finally { setSavingLoginProvision(false); }
  }

  function toggleUni(id) {
    setSelectedUniIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }

  async function handleUploadDoc() {
    const file = uploadFileRef.current?.files?.[0];
    if (!file) return toast.error('Please select a file');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', uploadName.trim() || file.name);
      await centersApi.uploadDoc(center._id, fd);
      toast.success('Document uploaded');
      setUploadOpen(false); setUploadName('');
      if (uploadFileRef.current) uploadFileRef.current.value = '';
      onRefresh?.();
    } catch(e) { toast.error(e.message); }
    finally { setUploading(false); }
  }

  async function handleDeleteDoc(docId) {
    if (!confirm('Remove this document?')) return;
    try {
      await centersApi.deleteDoc(center._id, docId);
      toast.success('Document removed');
      onRefresh?.();
    } catch(e) { toast.error(e.message); }
  }

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <input
              type="checkbox"
              checked={selectedForExport}
              onChange={() => onToggleExport?.(center._id)}
              onClick={e => e.stopPropagation()}
              className="mt-1 h-4 w-4 rounded border-slate-300"
              aria-label={`Select ${center.name || center.organisationName} for CSV`}
            />
            <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap cursor-pointer" onClick={() => onViewStudents(center)}>
              <span className="font-semibold text-base text-primary hover:underline">{center.name || center.organisationName}</span>
              {center.organisationType && (
                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">{center.organisationType}</span>
              )}
              {!center.isActive && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Inactive</span>}
            </div>
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
              {center.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3"/>{center.city}{center.state?`, ${center.state}`:''}</span>}
              {center.contactNumber && <span className="flex items-center gap-1"><Phone className="h-3 w-3"/>{center.contactNumber}</span>}
              {center.emailId && <span>{center.emailId}</span>}
            </div>
            {center.assignedCounselor && (
              <div className="text-xs text-indigo-600 mt-1 flex items-center gap-1">
                <User className="h-3 w-3"/>Counselor: {center.assignedCounselor.name}
              </div>
            )}
            {viewerCounselor && (
              <div className="text-xs text-violet-600 mt-1 flex items-center gap-1">
                <Eye className="h-3 w-3"/>Viewer Counselor: {viewerCounselor.name || viewerCounselor.email}
              </div>
            )}
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setExpanded(p => !p)} title="View details">
              {expanded ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
            </Button>
            {(!isViewer || canViewerManage) && <Button variant="ghost" size="sm" onClick={() => onAssignCounselor(center)} title="Assign Counselor">
              <User className="h-3.5 w-3.5"/>
            </Button>}
            {!isViewer && <Button variant="ghost" size="sm" onClick={() => onEdit(center)} title="Edit">
              <Edit2 className="h-3.5 w-3.5"/>
            </Button>}
            {(!isViewer || canViewerManage) && <Button variant="ghost" size="sm" onClick={() => onCreateLogin(center)} title="Create Login">
              <Key className="h-3.5 w-3.5"/>
            </Button>}
            {isAdmin && (
              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={() => onDelete(center._id)} title="Delete">
                <Trash2 className="h-3.5 w-3.5"/>
              </Button>
            )}
          </div>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {center.fullName && (
                <div className="bg-muted/30 rounded px-3 py-2">
                  <div className="text-xs text-muted-foreground">Contact Person</div>
                  <div className="font-medium">{center.fullName}</div>
                </div>
              )}
              {center.experience && (
                <div className="bg-muted/30 rounded px-3 py-2">
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3"/>Experience</div>
                  <div className="font-medium">{center.experience}</div>
                </div>
              )}
              {center.teamSize && (
                <div className="bg-muted/30 rounded px-3 py-2">
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3"/>Team Size</div>
                  <div className="font-medium">{center.teamSize}</div>
                </div>
              )}
              {center.monthlyEnquiries && (
                <div className="bg-muted/30 rounded px-3 py-2">
                  <div className="text-xs text-muted-foreground">Monthly Enquiries</div>
                  <div className="font-medium">{center.monthlyEnquiries}</div>
                </div>
              )}
              {center.coverage && (
                <div className="bg-muted/30 rounded px-3 py-2">
                  <div className="text-xs text-muted-foreground">Coverage</div>
                  <div className="font-medium">{center.coverage}</div>
                </div>
              )}
              {center.timeline && (
                <div className="bg-muted/30 rounded px-3 py-2">
                  <div className="text-xs text-muted-foreground">Timeline</div>
                  <div className="font-medium">{center.timeline}</div>
                </div>
              )}
              {center.website && (
                <div className="bg-muted/30 rounded px-3 py-2 col-span-2">
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><Globe className="h-3 w-3"/>Website / Instagram</div>
                  <a href={center.website.startsWith('http') ? center.website : `https://${center.website}`}
                    target="_blank" rel="noreferrer"
                    className="font-medium text-blue-600 underline text-sm break-all" onClick={e => e.stopPropagation()}>
                    {center.website}
                  </a>
                </div>
              )}
            </div>

            {programBadges.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><GraduationCap className="h-3 w-3"/>Program Interest</div>
                <div className="flex flex-wrap gap-1.5">
                  {programBadges.map(p => <span key={p} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">{p}</span>)}
                </div>
              </div>
            )}

            {streamBadges.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><BookOpen className="h-3 w-3"/>Streams</div>
                <div className="flex flex-wrap gap-1.5">
                  {streamBadges.map(s => <span key={s} className="text-xs bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded-full">{s}</span>)}
                </div>
              </div>
            )}

            <div className="border rounded-lg p-3 bg-blue-50/40 border-blue-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Login Status</div>
                  <p className="text-xs text-blue-600 mt-0.5">Whether login access has been provided to this center.</p>
                </div>
                <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
                  {editingLoginProvision ? (
                    <Select
                      value={center.loginProvisionStatus || 'Login Not Provided'}
                      onValueChange={updateLoginProvision}
                      disabled={savingLoginProvision}
                    >
                      <SelectTrigger className="w-full bg-white border-blue-200 sm:w-56">
                        <SelectValue placeholder="Select login status" />
                      </SelectTrigger>
                      <SelectContent>
                        {LOGIN_PROVISION_OPTIONS.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <>
                      <span className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-sm font-semibold text-blue-700">
                        {center.loginProvisionStatus || 'Login Not Provided'}
                      </span>
                      {!isViewer && <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
                        onClick={e => { e.stopPropagation(); setEditingLoginProvision(true); }}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit
                      </Button>}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-3 bg-emerald-50/40 border-emerald-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Fee Structure Given</div>
                  <p className="text-xs text-emerald-600 mt-0.5">Which fee structure this center has been offered.</p>
                </div>
                <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
                  {editingFeeStructure ? (
                    <Select
                      value={center.feeStructureType || 'Normal'}
                      onValueChange={updateFeeStructure}
                      disabled={savingFeeStructure}
                    >
                      <SelectTrigger className="w-full bg-white border-emerald-200 sm:w-56">
                        <SelectValue placeholder="Select fee structure" />
                      </SelectTrigger>
                      <SelectContent>
                        {FEE_STRUCTURES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <>
                      <span className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-700">
                        {center.feeStructureType || 'Normal'}
                      </span>
                      {!isViewer && <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                        onClick={e => { e.stopPropagation(); setEditingFeeStructure(true); }}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit
                      </Button>}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Key className="h-3.5 w-3.5"/> Center Logins ({loginUsers.length})
                </div>
                {(!isViewer || canViewerManage) && <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1"
                  onClick={e => { e.stopPropagation(); onCreateLogin(center); }}>
                  <Plus className="h-3 w-3"/> Create Login
                </Button>}
              </div>
              {loginUsers.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No login created for this center yet</p>
              ) : (
                <div className="space-y-1.5">
                  {loginUsers.map(u => (
                    <div key={u._id || u.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] bg-muted/30 rounded-lg px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">Login Email</div>
                        <div className="font-mono font-semibold truncate">{u.email}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">Password</div>
                        <div className="font-mono font-semibold truncate">{u.createdPassword || 'Not saved'}</div>
                      </div>
                      <div className="flex items-end">
                        {(!isViewer || canViewerManage) && <Button size="sm" variant="outline" className="h-8 text-xs"
                          onClick={e => { e.stopPropagation(); onResetLogin(u); }}>
                          Reset
                        </Button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Verification Documents — always shown */}
            <div className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Paperclip className="h-3.5 w-3.5"/> Verification Documents ({verDocs.length})
                </div>
                {(!isViewer || canViewerManage) && <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1"
                  onClick={e => { e.stopPropagation(); setUploadOpen(true); }}>
                  <Plus className="h-3 w-3"/> Upload
                </Button>}
              </div>

              {verDocs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No verification documents uploaded yet</p>
              ) : (
                <div className="space-y-1.5">
                  {verDocs.map(d => (
                    <div key={d._id} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0"/>
                        <span className="font-medium truncate">{d.name}</span>
                        {d.sizeKb > 0 && <span className="text-xs text-muted-foreground shrink-0">{d.sizeKb} KB</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {d.fileUrl && (
                          <a href={`${MEDIA}${d.fileUrl}`} target="_blank" rel="noreferrer"
                            className="text-xs text-blue-600 underline hover:text-blue-800"
                            onClick={e => e.stopPropagation()}>
                            View
                          </a>
                        )}
                        {(isAdmin || canViewerManage) && (
                          <button onClick={e => { e.stopPropagation(); handleDeleteDoc(d._id); }}
                            className="text-destructive hover:text-destructive/80 text-xs">
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Inline upload form */}
              {uploadOpen && (
                <div className="mt-3 border-t pt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Document Name</Label>
                      <Input value={uploadName} onChange={e => setUploadName(e.target.value)}
                        placeholder="e.g. GST Certificate" className="text-sm h-8"/>
                    </div>
                    <div>
                      <Label className="text-xs">File</Label>
                      <Input ref={uploadFileRef} type="file" className="text-sm h-8"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"/>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleUploadDoc} disabled={uploading} className="gap-1">
                      {uploading ? <Loader2 className="h-3 w-3 animate-spin"/> : <Plus className="h-3 w-3"/>}
                      Save Document
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setUploadOpen(false); setUploadName(''); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Allowed Universities ─────────────────────── */}
            <div className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <GraduationCap className="h-3.5 w-3.5"/> University Access ({allowedUnis.length})
                </div>
                {(!isViewer || canViewerManage) && <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1" onClick={openUniManage}>
                  <Plus className="h-3 w-3"/> Manage
                </Button>}
              </div>
              {allowedUnis.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No universities assigned — center can see all universities</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {allowedUnis.map(u => (
                    <span key={u._id} className="text-xs px-2 py-1 rounded-full border flex items-center gap-1"
                      style={{ background: (u.avatarColor || '#6366f1') + '20', borderColor: u.avatarColor || '#6366f1', color: u.avatarColor || '#6366f1' }}>
                      {u.name}{u.shortName ? ` (${u.shortName})` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* ── Allowed Payment Accounts ─────────────────── */}
            <div className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <CreditCard className="h-3.5 w-3.5"/> Payment Account Access ({allowedPayAccts.length})
                </div>
                {(!isViewer || canViewerManage) && <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1" onClick={openPayManage}>
                  <Plus className="h-3 w-3"/> Manage
                </Button>}
              </div>
              {allowedPayAccts.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No accounts assigned — center can see all payment accounts</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {allowedPayAccts.map(a => (
                    <span key={a._id} className="text-xs px-2 py-1 rounded-full border flex items-center gap-1">
                      {a.label} {a.mode ? `(${a.mode})` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Payment Account Manage Modal ─────────────────── */}
        {payManageOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPayManageOpen(false)}>
            <div className="bg-background rounded-xl shadow-xl p-5 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
              <h3 className="font-semibold text-base mb-1">Manage Payment Account Access</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Tick the bank/UPI accounts this center should see in its payment dropdown. Untick to hide an account from this center.
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                {allPayAccounts.map(a => (
                  <label key={a._id} className="flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedPayIds.includes(String(a._id))}
                      onChange={() => togglePayAcct(String(a._id))}
                      className="h-4 w-4 rounded"
                    />
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${a.mode === 'UPI' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {a.mode}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{a.label}</p>
                        {a.mode === 'UPI' && a.upiId && <p className="text-xs text-muted-foreground">{a.upiId}</p>}
                        {a.mode === 'Bank Transfer' && a.bankName && <p className="text-xs text-muted-foreground">{a.bankName}</p>}
                      </div>
                    </div>
                  </label>
                ))}
                {allPayAccounts.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No payment accounts found. Add accounts first in Settings.</p>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <button className="text-sm px-3 py-1.5 rounded-lg border hover:bg-muted/50" onClick={() => setPayManageOpen(false)}>Cancel</button>
                <button
                  className="text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 disabled:opacity-50"
                  onClick={savePayAccts} disabled={savingPayAccts}>
                  {savingPayAccts && <span className="inline-block h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin"/>}
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── University Manage Modal ──────────────────────── */}
        {uniManageOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setUniManageOpen(false)}>
            <div className="bg-background rounded-xl shadow-xl p-5 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
              <h3 className="font-semibold text-base mb-1">Manage University Access</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Select which universities this center can apply to. Only selected universities will appear in the student form.
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                {allUniversities.map(u => (
                  <label key={u._id} className="flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedUniIds.includes(String(u._id))}
                      onChange={() => toggleUni(String(u._id))}
                      className="h-4 w-4 rounded"
                    />
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ background: u.avatarColor || '#6366f1' }}>
                        {u.shortName?.[0] || u.name[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{u.name}</p>
                        {u.city && <p className="text-xs text-muted-foreground">{u.city}</p>}
                      </div>
                    </div>
                  </label>
                ))}
                {allUniversities.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No universities found. Add universities first.</p>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <button className="text-sm px-3 py-1.5 rounded-lg border hover:bg-muted/50" onClick={() => setUniManageOpen(false)}>Cancel</button>
                <button
                  className="text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 disabled:opacity-50"
                  onClick={saveUnis} disabled={savingUnis}>
                  {savingUnis && <span className="inline-block h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin"/>}
                  Save Access
                </button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function CentersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const isViewer = user?.role === 'ViewerCounselor';
  const canViewerManage = isViewer;
  const canCreateCenters = ['Admin', 'Counselor', 'ViewerCounselor'].includes(user?.role);

  const [centers,    setCenters]    = useState([]);
  const [counselors, setCounselors] = useState([]);
  const [viewerCounselors, setViewerCounselors] = useState([]);
  const [centerUsers,setCenterUsers]= useState([]);
  const [centerSearch,setCenterSearch]= useState('');
  const [loading,    setLoading]    = useState(true);
  const [selectedCenters, setSelectedCenters] = useState(() => new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportCenterDetails, setExportCenterDetails] = useState(true);
  const [exportStudentList, setExportStudentList] = useState(false);

  // Form state
  const [formOpen,   setFormOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [step,       setStep]       = useState(1);
  const [saving,     setSaving]     = useState(false);
  // Verification docs
  const [docFiles,     setDocFiles]     = useState([]); // [{file, name}]
  const [docUploading, setDocUploading] = useState(false);
  const [newDocName,   setNewDocName]   = useState('');
  const newDocFileRef = useRef(null);

  // Login dialog
  const [loginOpen,    setLoginOpen]    = useState(false);
  const [loginTarget,  setLoginTarget]  = useState(null);
  const [loginForm,    setLoginForm]    = useState({ name:'', email:'', password:'' });
  const [resetTarget,  setResetTarget]  = useState(null);
  const [resetPwd,     setResetPwd]     = useState('');

  // Assign counselor
  const [assignOpen,    setAssignOpen]    = useState(null);
  const [selCounselor,  setSelCounselor]  = useState('');
  const [selViewerCounselor, setSelViewerCounselor] = useState(NO_VIEWER_COUNSELOR);
  const [viewCenter,    setViewCenter]    = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [c, co, users, viewers] = await Promise.all([
        centersApi.getAll(),
        counselorsApi.getAll(),
        authApi.listUsers('Center').catch(()=>[]),
        isAdmin ? authApi.listUsers('ViewerCounselor').catch(()=>[]) : Promise.resolve([]),
      ]);
      setCenters(c); setCounselors(co); setCenterUsers(users); setViewerCounselors(viewers);
    } catch { toast.error('Failed to load'); } finally { setLoading(false); }
  }, [isAdmin]);
  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditTarget(null); setForm(EMPTY_FORM); setStep(1); setDocFiles([]); setNewDocName(''); setFormOpen(true);
  }
  function openEdit(center) {
    setEditTarget(center);
    setForm({
      organisationType: center.organisationType || '',
      fullName:         center.fullName || '',
      organisationName: center.organisationName || '',
      name:             center.name || '',
      emailId:          center.emailId || '',
      city:             center.city || '',
      state:            center.state || '',
      website:          center.website || '',
      contactNumber:    center.contactNumber || '',
      address:          center.address || '',
      experience:       center.experience || '',
      teamSize:         center.teamSize || '',
      monthlyEnquiries: center.monthlyEnquiries || '',
      coverage:         center.coverage || '',
      programInterest:  Array.isArray(center.programInterest) ? center.programInterest : [],
      streams:          Array.isArray(center.streams) ? center.streams : [],
      timeline:         center.timeline || '',
    });
    setStep(1); setFormOpen(true);
  }

  async function saveCenter() {
    if (!form.organisationName.trim()) return toast.error('Organisation name required');
    if (!form.city.trim())             return toast.error('City required');

    // Auto-add any file sitting in the input that user forgot to click "Add Document"
    let finalDocFiles = [...docFiles];
    const pendingFile = newDocFileRef.current?.files?.[0];
    if (pendingFile) {
      finalDocFiles.push({ name: newDocName.trim() || pendingFile.name, file: pendingFile });
    }

    setSaving(true);
    try {
      const data = { ...form, name: form.organisationName };

      if (editTarget) {
        await centersApi.update(editTarget._id, data);
        if (finalDocFiles.length > 0) {
          for (const df of finalDocFiles) {
            const fd = new FormData();
            fd.append('file', df.file);
            fd.append('name', df.name || df.file.name);
            await centersApi.uploadDoc(editTarget._id, fd);
          }
        }
        toast.success('Center updated');
      } else {
        let newCenter;
        if (finalDocFiles.length > 0) {
          const fd = new FormData();
          Object.entries(data).forEach(([k, v]) => {
            if (Array.isArray(v)) fd.append(k, JSON.stringify(v));
            else if (v !== undefined && v !== null) fd.append(k, v);
          });
          fd.append('docNames', JSON.stringify(finalDocFiles.map(df => df.name || df.file.name)));
          finalDocFiles.forEach(df => fd.append('verificationDocs', df.file));
          newCenter = await centersApi.create(fd);
        } else {
          newCenter = await centersApi.create(data);
        }
        toast.success('Center created');
        if (user?.role === 'Counselor' && user?.counselorId) {
          try { await counselorsApi.addCenter(user.counselorId, newCenter._id); } catch {}
        }
      }
      setFormOpen(false); setEditTarget(null); setForm(EMPTY_FORM); setStep(1); setDocFiles([]); setNewDocName(''); load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function deleteCenter(id) {
    if (!confirm('Delete this center?')) return;
    try { await centersApi.delete(id); toast.success('Deleted'); load(); }
    catch(e) { toast.error(e.message); }
  }

  async function createLogin() {
    if (!loginForm.name || !loginForm.email || !loginForm.password) return toast.error('All fields required');
    setSaving(true);
    try {
      await authApi.createUser({ ...loginForm, role: 'Center', centerId: loginTarget._id });
      toast.success('Login created'); setLoginOpen(false); setLoginForm({ name:'', email:'', password:'' });
      load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function resetLoginPassword() {
    if (!resetTarget) return;
    if (resetPwd.length < 6) return toast.error('Password min 6 characters');
    setSaving(true);
    try {
      await authApi.resetPassword(resetTarget._id || resetTarget.id, resetPwd);
      toast.success('Password reset');
      setResetTarget(null); setResetPwd('');
      load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function assignCounselor() {
    if (!selCounselor) return toast.error('Select a counselor');
    try {
      await counselorsApi.addCenter(selCounselor, assignOpen._id);
      toast.success('Counselor assigned'); setAssignOpen(null); setSelCounselor(''); load();
    } catch(e) { toast.error(e.message); }
  }

  function getViewerCounselorForCenter(centerId) {
    return viewerCounselors.find(v => (
      v.counselorId?.centers || []
    ).some(c => String(c?._id || c) === String(centerId)));
  }

  function openAssignDialog(center) {
    const currentViewer = getViewerCounselorForCenter(center._id);
    const viewerId = currentViewer?.counselorId?._id || currentViewer?.counselorId;
    setAssignOpen(center);
    setSelCounselor('');
    setSelViewerCounselor(viewerId ? String(viewerId) : NO_VIEWER_COUNSELOR);
  }

  async function assignViewerCounselor() {
    if (!assignOpen) return;
    try {
      const counselorId = selViewerCounselor === NO_VIEWER_COUNSELOR ? '' : selViewerCounselor;
      await centersApi.assignViewerCounselor(assignOpen._id, counselorId);
      toast.success(counselorId ? 'Viewer counselor assigned' : 'Viewer counselor removed');
      setAssignOpen(null);
      setSelViewerCounselor(NO_VIEWER_COUNSELOR);
      load();
    } catch(e) { toast.error(e.message); }
  }

  function toggleCenterSelection(id) {
    setSelectedCenters(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function getSelectedOrFilteredCenters(list = filteredCenters) {
    if (selectedCenters.size === 0) return list;
    return centers.filter(c => selectedCenters.has(c._id));
  }

  async function exportCentersCsv() {
    if (!exportCenterDetails && !exportStudentList) {
      toast.error('Select at least one export option');
      return;
    }

    const targetCenters = getSelectedOrFilteredCenters();
    if (targetCenters.length === 0) {
      toast.error('No centers to export');
      return;
    }

    setExportLoading(true);
    try {
      let studentsByCenter = new Map();
      if (exportStudentList) {
        const allStudents = await studentsApi.getAll();
        const targetIds = new Set(targetCenters.map(c => String(c._id)));
        allStudents
          .filter(s => targetIds.has(String(s.center?._id || s.center || '')))
          .forEach(s => {
            const centerId = String(s.center?._id || s.center || '');
            if (!studentsByCenter.has(centerId)) studentsByCenter.set(centerId, []);
            studentsByCenter.get(centerId).push(s);
          });
      }

      const centerHeaders = exportCenterDetails ? [
        'Center Name', 'Organisation Type', 'Contact Person', 'Email', 'Phone',
        'City', 'State', 'Address', 'Login Status', 'Fee Structure', 'Assigned Counselor',
        'Programs', 'Streams', 'Experience', 'Team Size', 'Monthly Enquiries',
        'Coverage', 'Timeline', 'Website', 'Active', 'Login Emails',
      ] : ['Center Name'];

      const studentHeaders = exportStudentList ? [
        'Student Name', 'Father Name', 'Phone', 'Email', 'Course', 'Session',
        'University', 'Status', 'Enrollment Number', 'Enrollment Checked',
        'Submitted Date',
      ] : [];

      const headers = [...centerHeaders, ...studentHeaders];

      const centerRow = center => {
        const loginEmails = centerUsers
          .filter(u => String(u.centerId?._id || u.centerId) === String(center._id))
          .map(u => u.email)
          .filter(Boolean)
          .join(' | ');

        if (!exportCenterDetails) return [center.name || center.organisationName || ''];

        return [
          center.name || center.organisationName || '',
          center.organisationType || '',
          center.fullName || '',
          center.emailId || '',
          center.contactNumber || '',
          center.city || '',
          center.state || '',
          center.address || '',
          center.loginProvisionStatus || 'Login Not Provided',
          center.feeStructureType || 'Normal',
          center.assignedCounselor?.name || '',
          joinList(center.programInterest),
          joinList(center.streams),
          center.experience || '',
          center.teamSize || '',
          center.monthlyEnquiries || '',
          center.coverage || '',
          center.timeline || '',
          center.website || '',
          center.isActive === false ? 'No' : 'Yes',
          loginEmails,
        ];
      };

      const studentRow = student => [
        student.name || '',
        student.fatherName || '',
        student.phone || '',
        student.email || '',
        student.courseName || '',
        student.courseYear || '',
        student.university?.name || student.universityName || '',
        STATUS_LABELS[student.applicationStatus] || student.applicationStatus || '',
        student.enrollmentNumber || '',
        student.enrollmentNumberChecked ? 'Yes' : 'No',
        csvDate((student.statusHistory || []).find(h => h.status === 'Submitted')?.at),
      ];

      const rows = [];
      targetCenters.forEach(center => {
        const base = centerRow(center);
        const centerStudents = studentsByCenter.get(String(center._id)) || [];
        if (!exportStudentList) {
          rows.push(base);
          return;
        }
        if (centerStudents.length === 0) {
          rows.push([...base, ...studentHeaders.map(() => '')]);
          return;
        }
        centerStudents.forEach(student => rows.push([...base, ...studentRow(student)]));
      });

      const date = new Date().toISOString().slice(0, 10);
      const scope = selectedCenters.size > 0 ? 'selected' : 'all';
      downloadCsv(`centers_${scope}_${date}.csv`, headers, rows);
      toast.success(`CSV downloaded - ${targetCenters.length} center${targetCenters.length > 1 ? 's' : ''}`);
      setExportOpen(false);
    } catch(e) {
      toast.error('Export failed: ' + e.message);
    } finally {
      setExportLoading(false);
    }
  }

  const set = (field, val) => setForm(p => ({ ...p, [field]: val }));
  const centerQuery = centerSearch.toLowerCase().trim();
  const filteredCenters = centers.filter(c => {
    if (!centerQuery) return true;
    return [
      c.name,
      c.organisationName,
      c.fullName,
      c.emailId,
      c.city,
      c.state,
      c.contactNumber,
      c.organisationType,
      c.assignedCounselor?.name,
    ].some(v => String(v || '').toLowerCase().includes(centerQuery));
  });
  const filteredIds = filteredCenters.map(c => c._id);
  const selectedInFiltered = filteredIds.filter(id => selectedCenters.has(id)).length;

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Centers ({centerQuery ? `${filteredCenters.length}/${centers.length}` : centers.length})</h1>
          <p className="text-sm text-muted-foreground">Manage admission centers and their details</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setExportOpen(true)} disabled={centers.length === 0}>
            <Download className="h-4 w-4 mr-1"/>CSV
          </Button>
          {canCreateCenters && <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1"/>Add Center
          </Button>}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
        <Input
          value={centerSearch}
          onChange={e => setCenterSearch(e.target.value)}
          placeholder="Search centers by name, city, email, phone, counselor..."
          className="pl-9 pr-9"
        />
        {centerSearch && (
          <button
            type="button"
            onClick={() => setCenterSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4"/>
          </button>
        )}
      </div>

      {centers.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={filteredCenters.length > 0 && selectedInFiltered === filteredCenters.length}
              onChange={e => {
                setSelectedCenters(prev => {
                  const next = new Set(prev);
                  filteredIds.forEach(id => e.target.checked ? next.add(id) : next.delete(id));
                  return next;
                });
              }}
            />
            <span className="font-medium">Select All</span>
          </label>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>
              {selectedCenters.size > 0
                ? `${selectedCenters.size} center selected for CSV`
                : 'No selection - CSV will export all visible centers'}
            </span>
            {selectedCenters.size > 0 && (
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSelectedCenters(new Set())}>
                Clear
              </Button>
            )}
          </div>
        </div>
      )}

      {centers.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-lg">
          <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3"/>
          <p className="text-muted-foreground">No centers yet</p>
        </div>
      ) : filteredCenters.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-lg">
          <Search className="h-10 w-10 mx-auto text-muted-foreground mb-3"/>
          <p className="text-muted-foreground">No centers matching "{centerSearch}"</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCenters.map(c => (
            <CenterCard key={c._id} center={c} isAdmin={isAdmin} isViewer={isViewer} canViewerManage={canViewerManage}
              viewerCounselor={getViewerCounselorForCenter(c._id)}
              loginUsers={centerUsers.filter(u => String(u.centerId?._id || u.centerId) === String(c._id))}
              selectedForExport={selectedCenters.has(c._id)}
              onToggleExport={toggleCenterSelection}
              onEdit={openEdit}
              onDelete={deleteCenter}
              onCreateLogin={c => { setLoginTarget(c); setLoginForm({ name: c.fullName||'', email:'', password:'' }); setLoginOpen(true); }}
              onResetLogin={u => { setResetTarget(u); setResetPwd(''); }}
              onAssignCounselor={openAssignDialog}
              onViewStudents={setViewCenter}
              onRefresh={load}
            />
          ))}
        </div>
      )}

      {/* ── Add/Edit Center Dialog — 2-step form ──────────── */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Export Centers CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-3 text-sm">
              <div className="font-medium">Centers to export</div>
              <p className="text-muted-foreground mt-1">
                {selectedCenters.size > 0
                  ? `${selectedCenters.size} selected center${selectedCenters.size > 1 ? 's' : ''}`
                  : `${filteredCenters.length} visible center${filteredCenters.length > 1 ? 's' : ''} (all)`}
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">What should be exported?</div>
              <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/30">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                  checked={exportCenterDetails}
                  onChange={e => setExportCenterDetails(e.target.checked)}
                />
                <span>
                  <span className="block font-medium">Center details</span>
                  <span className="block text-xs text-muted-foreground">Name, phone, city, counselor, fee structure, login emails and business details.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/30">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                  checked={exportStudentList}
                  onChange={e => setExportStudentList(e.target.checked)}
                />
                <span>
                  <span className="block font-medium">Student list</span>
                  <span className="block text-xs text-muted-foreground">Students under each selected center with course, status and enrollment number.</span>
                </span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>Cancel</Button>
            <Button onClick={exportCentersCsv} disabled={exportLoading}>
              {exportLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin"/>Preparing</> : <><Download className="h-4 w-4 mr-1"/>Download CSV</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? 'Edit Center' : 'Add Center'}
              <span className="text-sm font-normal text-muted-foreground ml-2">
                Step {step} of 3 — {step===1?'Basic Details':step===2?'Business Info':'Documents'}
              </span>
            </DialogTitle>
            {/* Step indicator */}
            <div className="flex items-center gap-2 mt-2">
              <div className={`flex items-center gap-1.5 text-sm font-medium ${step === 1 ? 'text-primary' : 'text-muted-foreground'}`}>
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 1 ? 'bg-primary text-primary-foreground' : step > 1 ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                  {step > 1 ? '✓' : '1'}
                </div>
                Basic Details
              </div>
              <div className="flex-1 h-0.5 bg-muted mx-1"/>
              <div className={`flex items-center gap-1.5 text-sm font-medium ${step === 2 ? 'text-primary' : 'text-muted-foreground'}`}>
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  2
                </div>
                Additional Info
              </div>
            </div>
          </DialogHeader>

          {/* ── STEP 1: Basic Details ────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label>Type of Organisation</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {ORG_TYPES.map(t => (
                    <button key={t} type="button"
                      onClick={() => set('organisationType', t)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        form.organisationType === t
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border hover:border-primary/50'
                      }`}>{t}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Full Name (Contact Person) *</Label>
                  <Input value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="Contact person's name"/>
                </div>
                <div className="col-span-2">
                  <Label>Organisation Name *</Label>
                  <Input value={form.organisationName} onChange={e => set('organisationName', e.target.value)} placeholder="Your organisation name"/>
                </div>
                <div className="col-span-2">
                  <Label>Email ID *</Label>
                  <Input type="email" value={form.emailId} onChange={e => set('emailId', e.target.value)} placeholder="email@example.com"/>
                </div>
                <div>
                  <Label>City *</Label>
                  <Input value={form.city} onChange={e => set('city', e.target.value)} placeholder="City"/>
                </div>
                <div>
                  <Label>State *</Label>
                  <Input value={form.state} onChange={e => set('state', e.target.value)} placeholder="State"/>
                </div>
                <div>
                  <Label>Contact Number</Label>
                  <Input value={form.contactNumber} onChange={e => set('contactNumber', e.target.value)} placeholder="+91 XXXXX XXXXX"/>
                </div>
                <div>
                  <Label>Address</Label>
                  <Input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Address"/>
                </div>
                <div className="col-span-2">
                  <Label>Website / Instagram / Google Profile</Label>
                  <Input value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://... or @handle"/>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Additional Info ──────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Experience */}
              <div>
                <Label>Experience</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {EXPERIENCE.map(e => (
                    <button key={e} type="button"
                      onClick={() => set('experience', e)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${form.experience === e ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:border-primary/50'}`}>{e}</button>
                  ))}
                </div>
              </div>

              {/* Team Size */}
              <div>
                <Label>Team Size</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {TEAM_SIZES.map(t => (
                    <button key={t} type="button"
                      onClick={() => set('teamSize', t)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${form.teamSize === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:border-primary/50'}`}>{t}</button>
                  ))}
                </div>
              </div>

              {/* Monthly Enquiries */}
              <div>
                <Label>Monthly Student Enquiries</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {ENQUIRIES.map(e => (
                    <button key={e} type="button"
                      onClick={() => set('monthlyEnquiries', e)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${form.monthlyEnquiries === e ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:border-primary/50'}`}>{e}</button>
                  ))}
                </div>
              </div>

              {/* Coverage */}
              <div>
                <Label>Coverage</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {COVERAGE.map(c => (
                    <button key={c} type="button"
                      onClick={() => set('coverage', c)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${form.coverage === c ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:border-primary/50'}`}>{c}</button>
                  ))}
                </div>
              </div>

              {/* Program Interest - multi-select */}
              <CheckboxGroup
                label="Program Interest"
                options={PROGRAMS}
                selected={form.programInterest}
                onChange={v => set('programInterest', v)}
              />

              {/* Streams - multi-select */}
              <CheckboxGroup
                label="Streams"
                options={STREAMS_LIST}
                selected={form.streams}
                onChange={v => set('streams', v)}
              />

              {/* Timeline */}
              <div>
                <Label>Timeline</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {TIMELINES.map(t => (
                    <button key={t} type="button"
                      onClick={() => set('timeline', t)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${form.timeline === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:border-primary/50'}`}>{t}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Verification Documents ── */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Upload verification documents like GST certificate, PAN card, address proof, etc.</p>

              {/* Add doc row */}
              <div className="space-y-2">
                {docFiles.map((df, i) => (
                  <div key={i} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
                    <Paperclip className="h-4 w-4 text-muted-foreground shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{df.name || df.file.name}</p>
                      <p className="text-xs text-muted-foreground">{df.file.name} · {Math.round(df.file.size/1024)}KB</p>
                    </div>
                    <button onClick={() => setDocFiles(p => p.filter((_,j) => j!==i))} className="text-destructive hover:text-destructive/80">
                      <Trash2 className="h-4 w-4"/>
                    </button>
                  </div>
                ))}
              </div>

              {/* Add new doc */}
              <div className="border-2 border-dashed rounded-lg p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Add Document</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Document Name</Label>
                    <Input
                      value={newDocName}
                      onChange={e => setNewDocName(e.target.value)}
                      placeholder="e.g. GST Certificate"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">File</Label>
                    <Input
                      ref={newDocFileRef}
                      type="file"
                      className="text-sm"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    />
                  </div>
                </div>
                <Button size="sm" variant="outline" className="gap-1 mt-1" onClick={() => {
                  const file = newDocFileRef.current?.files?.[0];
                  if (!file) return toast.error('Please select a file');
                  setDocFiles(p => [...p, { name: newDocName.trim() || file.name, file }]);
                  setNewDocName('');
                  if (newDocFileRef.current) newDocFileRef.current.value = '';
                }}>
                  <Plus className="h-3.5 w-3.5"/> Add Document
                </Button>
              </div>

              {/* Existing docs (on edit) */}
              {editTarget?.verificationDocs?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Already uploaded:</p>
                  <div className="space-y-1.5">
                    {editTarget.verificationDocs.map(d => (
                      <div key={d._id} className="flex items-center justify-between bg-muted/20 rounded-lg px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0"/>
                          <span className="truncate font-medium">{d.name}</span>
                          {d.sizeKb > 0 && <span className="text-xs text-muted-foreground">{d.sizeKb}KB</span>}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {d.fileUrl && <a href={`${MEDIA}${d.fileUrl}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">View</a>}
                          <button onClick={async () => {
                            try {
                              await centersApi.deleteDoc(editTarget._id, d._id);
                              setEditTarget(p => ({ ...p, verificationDocs: p.verificationDocs.filter(x => x._id !== d._id) }));
                              toast.success('Document removed');
                            } catch(e) { toast.error(e.message); }
                          }} className="text-destructive hover:text-destructive/80 text-xs">Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 flex-wrap">
            {step === 1 && <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>}
            {step > 1  && <Button variant="outline" onClick={() => setStep(s => s-1)}>← Back</Button>}
            {step === 1 && (
              <Button onClick={() => {
                if (!form.organisationName.trim()) return toast.error('Organisation name required');
                if (!form.city.trim())             return toast.error('City required');
                setStep(2);
              }}>
                Continue →
              </Button>
            )}
            {step === 2 && (
              <Button onClick={() => setStep(3)}>Next: Add Documents →</Button>
            )}
            {step === 3 && (
              <Button onClick={saveCenter} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}
                {editTarget ? 'Save Changes' : 'Create Center'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Login Dialog ─────────────────────────── */}
      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-4 w-4"/>Create Login — {loginTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Create login credentials for this center to access the portal.</p>
          <div className="space-y-3">
            <div><Label>Contact Name *</Label><Input value={loginForm.name} onChange={e => setLoginForm(p => ({...p, name: e.target.value}))}/></div>
            <div><Label>Email *</Label><Input type="email" value={loginForm.email} onChange={e => setLoginForm(p => ({...p, email: e.target.value}))}/></div>
            <div><Label>Password *</Label><Input type="password" value={loginForm.password} onChange={e => setLoginForm(p => ({...p, password: e.target.value}))} placeholder="Min 6 characters"/></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoginOpen(false)}>Cancel</Button>
            <Button onClick={createLogin} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Create Login</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={() => { setResetTarget(null); setResetPwd(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-4 w-4"/>Reset Center Login
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-muted/30 rounded-lg px-3 py-2 text-sm">
              <div className="text-xs text-muted-foreground">Login Email</div>
              <div className="font-mono font-semibold">{resetTarget?.email}</div>
            </div>
            <div>
              <Label>New Password *</Label>
              <Input type="password" value={resetPwd} onChange={e => setResetPwd(e.target.value)} placeholder="Min 6 characters"/>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetTarget(null); setResetPwd(''); }}>Cancel</Button>
            <Button onClick={resetLoginPassword} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Reset Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Center Students Modal ──────────────────────── */}
      {viewCenter && <CenterStudentsModal center={viewCenter} onClose={() => setViewCenter(null)}/>}

      {/* ── Assign Counselor Dialog ─────────────────────── */}
      <Dialog open={!!assignOpen} onOpenChange={() => setAssignOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Counselor — {assignOpen?.name}</DialogTitle></DialogHeader>
          {(isAdmin || isViewer) ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>Assigned Counselor</Label>
                <Select value={selCounselor} onValueChange={setSelCounselor}>
                  <SelectTrigger><SelectValue placeholder="Select counselor..."/></SelectTrigger>
                  <SelectContent>{counselors.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {isAdmin && <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <Label>Viewer Counselor</Label>
                <Select value={selViewerCounselor} onValueChange={setSelViewerCounselor}>
                  <SelectTrigger><SelectValue placeholder="Select viewer counselor..."/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_VIEWER_COUNSELOR}>No viewer counselor</SelectItem>
                    {viewerCounselors.map(v => {
                      const id = v.counselorId?._id || v.counselorId;
                      if (!id) return null;
                      return <SelectItem key={v._id} value={String(id)}>{v.name || v.email}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The viewer counselor will get read-only access to this center and its students.
                </p>
              </div>}
              <DialogFooter>
                <Button variant="outline" onClick={() => setAssignOpen(null)}>Cancel</Button>
                {isAdmin && <Button variant="outline" onClick={assignViewerCounselor}>Assign Viewer</Button>}
                <Button onClick={assignCounselor}>Assign Counselor</Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                As a Counselor, you will be automatically assigned to centers you create.
                Only Admin can reassign counselors.
              </p>
              {user?.counselorId && (
                <div className="bg-muted/30 rounded-lg px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Will assign: </span>
                  <span className="font-medium">{user.name}</span>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setAssignOpen(null)}>Close</Button>
                <Button onClick={async () => {
                  if (!user?.counselorId) return toast.error('No counselor ID found');
                  try {
                    await counselorsApi.addCenter(user.counselorId, assignOpen._id);
                    toast.success('You have been assigned to this center');
                    setAssignOpen(null); load();
                  } catch(e) { toast.error(e.message); }
                }}>Assign Myself</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Lock, Edit2, IndianRupee, FileText, CreditCard, Search,
  History, PlusCircle, Plus, Trash2, Download, Send, CheckCircle2, XCircle,
  RotateCcw, AlertTriangle, Clock, Activity, Paperclip, Shield, ArrowRightLeft,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { studentsApi, paymentsApi, docsApi, authApi, paymentAccountsApi, centersApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { DOCUMENT_OPTIONS } from '@/lib/documentOptions';

const MEDIA = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
const fmt   = n => `₹${(Number(n)||0).toLocaleString('en-IN')}`;
const fmtDt = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const toDateInput = d => d ? new Date(d).toISOString().split('T')[0] : '';

function PaidToBox({ tx, accMap=[] }) {
  if (!tx?.paidToAccount && !tx?.paidToAccountLabel) return null;
  const acc = Array.isArray(accMap)
    ? accMap.find(a => String(a._id) === String(tx.paidToAccount))
    : accMap[String(tx.paidToAccount)];
  const label = acc?.label || tx.paidToAccountLabel || '';
  const isUPI = acc?.mode === 'UPI';
  const isBank = acc?.mode === 'Bank Transfer';
  return (
    <div className="mt-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 space-y-0.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Paid To</span>
        <span className="text-sm font-semibold text-indigo-800">{label}</span>
        {acc?.mode && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isUPI?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>{acc.mode}</span>}
      </div>
      {acc && (<div className="space-y-0.5 text-xs text-indigo-700">
        {isUPI  && acc.upiId         && <div>UPI ID: <span className="font-mono font-bold">{acc.upiId}</span></div>}
        {isUPI  && acc.upiName        && <div>Name: <span className="font-semibold">{acc.upiName}</span></div>}
        {isBank && acc.bankName       && <div>Bank: <span className="font-semibold">{acc.bankName}</span></div>}
        {isBank && acc.accountHolder  && <div>Account Holder: <span className="font-semibold">{acc.accountHolder}</span></div>}
        {isBank && acc.accountNumber  && <div>Account No: <span className="font-mono font-bold">{acc.accountNumber}</span></div>}
        {isBank && acc.ifscCode       && <div>IFSC: <span className="font-mono">{acc.ifscCode}</span></div>}
        {isBank && acc.branch         && <div>Branch: <span className="font-semibold">{acc.branch}</span></div>}
      </div>)}
    </div>
  );
}

const STATUS_COLORS = {
  Draft:'bg-gray-100 text-gray-700', Submitted:'bg-blue-100 text-blue-700',
  Changes_Requested:'bg-amber-100 text-amber-700', Counselor_Approved:'bg-indigo-100 text-indigo-700',
  Rejected:'bg-red-100 text-red-700', Accountant_Pending:'bg-amber-100 text-amber-700',
  Sent_To_University:'bg-purple-100 text-purple-700', Enrolled:'bg-emerald-100 text-emerald-700',
  Cancelled:'bg-slate-100 text-slate-600',
};

const DOC_STATUS_COLORS = {
  Requested:'bg-blue-100 text-blue-700', Forwarded:'bg-indigo-100 text-indigo-700',
  Fee_Approved:'bg-green-100 text-green-700', Fee_Rejected:'bg-red-100 text-red-700',
  Sent_To_University:'bg-purple-100 text-purple-700', Center_Notified:'bg-amber-100 text-amber-700',
  Payment_Submitted:'bg-blue-100 text-blue-700', Payment_Verified:'bg-green-100 text-green-700',
  Dispatched:'bg-teal-100 text-teal-700', Delivered:'bg-emerald-100 text-emerald-700',
};

const ALL_APP_STATUSES = [
  'Draft','Submitted','Changes_Requested','Counselor_Approved',
  'Accountant_Pending','Sent_To_University','Enrolled','Rejected','Cancelled',
];

// ── Admin Transaction Edit Dialog ──────────────────────────────
function AdminTxEditDialog({ tx, studentId, payAccounts, onDone, onClose }) {
  const [f, setF] = useState({
    amount: tx.amount || '',
    mode: tx.mode || '',
    upiId: tx.upiId || '',
    utrRef: tx.utrRef || '',
    bankName: tx.bankName || '',
    accountHolder: tx.accountHolder || '',
    accountNumber: tx.accountNumber || '',
    ifscCode: tx.ifscCode || '',
    note: tx.note || '',
    paidAt: toDateInput(tx.paidAt),
    verificationStatus: tx.verificationStatus || 'pending',
    paidToAccount: tx.paidToAccount || '',
  });
  const [screenshotFile, setScreenshotFile] = useState(null);
  const screenshotRef = useRef();
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!f.amount || Number(f.amount) <= 0) return toast.error('Enter valid amount');
    setSaving(true);
    try {
      // Use FormData so file upload works alongside other fields
      const fd = new FormData();
      Object.entries(f).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') fd.append(key, val);
      });
      if (screenshotFile) fd.append('paymentScreenshot', screenshotFile);
      await paymentsApi.updateTransactionForm(studentId, tx._id, fd);
      toast.success('Transaction updated');
      onDone();
    } catch(e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-indigo-600"/>Admin — Edit Payment Transaction
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (₹) *</Label>
              <Input type="number" value={f.amount} onChange={e=>setF(p=>({...p,amount:e.target.value}))}/>
            </div>
            <div>
              <Label>Paid Date</Label>
              <Input type="date" value={f.paidAt} onChange={e=>setF(p=>({...p,paidAt:e.target.value}))}/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mode</Label>
              <Select value={f.mode} onValueChange={v=>setF(p=>({...p,mode:v}))}>
                <SelectTrigger><SelectValue placeholder="Select…"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Verification Status</Label>
              <Select value={f.verificationStatus} onValueChange={v=>setF(p=>({...p,verificationStatus:v}))}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="pending_counselor">Pending Counselor</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>UTR / Reference Number</Label>
            <Input value={f.utrRef} onChange={e=>setF(p=>({...p,utrRef:e.target.value}))} placeholder="Transaction reference"/>
          </div>
          {f.mode === 'UPI' && (
            <div>
              <Label>UPI ID</Label>
              <Input value={f.upiId} onChange={e=>setF(p=>({...p,upiId:e.target.value}))} placeholder="name@upi"/>
            </div>
          )}
          {f.mode === 'Bank Transfer' && (
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Bank Name</Label><Input value={f.bankName} onChange={e=>setF(p=>({...p,bankName:e.target.value}))}/></div>
              <div><Label className="text-xs">Account Holder</Label><Input value={f.accountHolder} onChange={e=>setF(p=>({...p,accountHolder:e.target.value}))}/></div>
              <div><Label className="text-xs">Account Number</Label><Input value={f.accountNumber} onChange={e=>setF(p=>({...p,accountNumber:e.target.value}))}/></div>
              <div><Label className="text-xs">IFSC</Label><Input value={f.ifscCode} onChange={e=>setF(p=>({...p,ifscCode:e.target.value}))}/></div>
            </div>
          )}
          {payAccounts.length > 0 && (
            <div>
              <Label>Paid To Account</Label>
              <Select value={f.paidToAccount||'__none__'} onValueChange={v=>setF(p=>({...p,paidToAccount:v==='__none__'?'':v}))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select account…"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {payAccounts.map(acc=>(
                    <SelectItem key={acc._id} value={acc._id}>{acc.label} ({acc.mode})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Note</Label>
            <Input value={f.note} onChange={e=>setF(p=>({...p,note:e.target.value}))}/>
          </div>

          {/* Payment Screenshot */}
          <div>
            <Label>Payment Screenshot</Label>
            {tx.paymentScreenshot && !screenshotFile && (
              <div className="mb-2">
                <a href={`${MEDIA}${tx.paymentScreenshot}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-100 transition-colors">
                  <Download className="h-3 w-3"/>View Current Screenshot
                </a>
              </div>
            )}
            <input
              ref={screenshotRef}
              type="file"
              accept="image/*,.pdf"
              onChange={e => setScreenshotFile(e.target.files[0] || null)}
              className="block w-full text-sm mt-1 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-muted"
            />
            {screenshotFile && (
              <div className="flex items-center gap-2 mt-1 text-xs text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5"/>
                New file selected: {screenshotFile.name}
                <button onClick={() => { setScreenshotFile(null); if(screenshotRef.current) screenshotRef.current.value=''; }}
                  className="text-red-400 hover:text-red-600 ml-1">✕</button>
              </div>
            )}
            <p className="text-xs text-slate-400 mt-1">Upload a new screenshot to replace the existing one.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
            {saving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StudentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [student, setStudent] = useState(null);
  const [payment, setPayment] = useState(null);
  const [docs,    setDocs]    = useState([]);
  const [centers, setCenters]  = useState([]);
  const [loading, setLoading] = useState(true);

  const [editOpen,   setEditOpen]   = useState(false);
  const [form,       setForm]       = useState({});
  const [actionOpen, setActionOpen] = useState(null);
  const [note,       setNote]       = useState('');
  const [saving,     setSaving]     = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferCenterId, setTransferCenterId] = useState('');
  const [transferCenterSearch, setTransferCenterSearch] = useState('');
  const [transferNote, setTransferNote] = useState('');

  const [txOpen, setTxOpen] = useState(false);
  const EMPTY_TF = { amount:'', mode:'', upiId:'', utrRef:'', bankName:'', accountHolder:'', accountNumber:'', ifscCode:'', note:'', paidAt:'', paidToAccount:'', paidToAccountLabel:'' };
  const [tf, setTf] = useState({...EMPTY_TF});
  const [payAccounts, setPayAccounts] = useState([]);

  // Admin tx edit
  const [editTx, setEditTx] = useState(null); // transaction object being edited

  useEffect(() => {
    paymentAccountsApi.list().then(setPayAccounts).catch(()=>{});
  }, []);

  const [feeOpen, setFeeOpen] = useState(false);
  const [ff, setFf] = useState({ totalFee:'', discount:'', notes:'' });

  const [docOpen, setDocOpen] = useState(false);
  const [docForm, setDocForm] = useState({ name:'', names:[], chargeFee:'', note:'' });
  const [docFile, setDocFile] = useState(null);
  const [editDoc, setEditDoc] = useState(null);
  const [editDocForm, setEditDocForm] = useState({ name:'', chargeFee:'', note:'' });
  const [editDocFile, setEditDocFile] = useState(null);
  const fileRef = useRef();
  const editDocFileRef = useRef();

  const [fwdDoc, setFwdDoc] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [s, p, d, c] = await Promise.all([
        studentsApi.getOne(id),
        paymentsApi.get(id).catch(()=>null),
        docsApi.list({ studentId: id, all: '1' }).catch(()=>[]),
        centersApi.getAll().catch(()=>[]),
      ]);
      setStudent(s); setPayment(p); setDocs(d); setCenters(c);
    } catch(e) { toast.error(e.message); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function saveEdit() {
    setSaving(true);
    try {
      const u = await studentsApi.update(id, form);
      setStudent(u); toast.success('Updated'); setEditOpen(false); load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function doAction(action) {
    if ((action==='reject'||action==='changes')&&!note.trim()) return toast.error('Note required');
    setSaving(true);
    try {
      if (action==='approve')  await studentsApi.approve(id);
      if (action==='reject')   await studentsApi.reject(id, note);
      if (action==='changes')  await studentsApi.requestChanges(id, note);
      toast.success('Done'); setActionOpen(null); setNote(''); load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function saveFee() {
    if (!ff.totalFee) return toast.error('Total fee required');
    setSaving(true);
    try {
      await paymentsApi.upsertFee(id, { totalFee:Number(ff.totalFee), discount:Number(ff.discount)||0, notes:ff.notes });
      toast.success('Fee saved'); setFeeOpen(false); load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function addTx() {
    if (!tf.amount||Number(tf.amount)<=0) return toast.error('Enter valid amount');
    setSaving(true);
    try {
      await paymentsApi.addTransaction(id, {...tf, amount:Number(tf.amount)});
      toast.success('Payment recorded'); setTxOpen(false); setTf({...EMPTY_TF}); load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function delTx(txId) {
    if (!confirm('Delete this transaction? This cannot be undone.')) return;
    try { await paymentsApi.deleteTransaction(id, txId); toast.success('Deleted'); load(); }
    catch(e) { toast.error(e.message); }
  }

  async function addDoc() {
    const names = docForm.names?.length ? docForm.names : (docForm.name?.trim() ? [docForm.name.trim()] : []);
    if (!names.length) return toast.error('Select at least one document');
    setSaving(true);
    try {
      for (const name of names) {
        const fd = new FormData();
        fd.append('studentId', id); fd.append('name', name);
        fd.append('note', docForm.note);
        fd.append('chargeFee', docForm.chargeFee||0);
        if (docFile) fd.append('file', docFile);
        await docsApi.create(fd);
      }
      toast.success(names.length > 1 ? `${names.length} documents added` : 'Document added'); setDocOpen(false);
      setDocForm({name:'',names:[],chargeFee:'',note:''}); setDocFile(null);
      if (fileRef.current) fileRef.current.value='';
      load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function forwardDoc(docId) {
    try { await docsApi.forward(docId); toast.success('Forwarded to accountant'); load(); }
    catch(e) { toast.error(e.message); }
  }

  const transferTargetCenter = centers.find(c => c._id === transferCenterId);

  async function handleTransfer() {
    if (!transferCenterId) return toast.error('Target center required');
    if (String(student.center?._id || student.center) === String(transferCenterId)) {
      return toast.error('Student is already in this center');
    }
    if (!transferTargetCenter?.assignedCounselor) {
      return toast.error('Selected center has no assigned counselor');
    }
    setSaving(true);
    try {
      await studentsApi.transferCenter(student._id, transferCenterId, transferNote);
      toast.success(`${student.name} transferred to ${transferTargetCenter?.name || 'selected center'}`);
      setTransferOpen(false);
      setTransferCenterId('');
      setTransferCenterSearch('');
      setTransferNote('');
      load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function handleEnrollmentCheck() {
    const prev = student;
    setStudent(p => ({
      ...p,
      enrollmentNumberChecked: true,
      enrollmentNumberCheckedAt: new Date().toISOString(),
    }));
    setSaving(true);
    try {
      const updated = await studentsApi.checkEnrollment(student._id);
      setStudent(updated);
      toast.success('Enrollment number marked as checked');
      load();
    } catch(e) {
      setStudent(prev);
      toast.error(e.message);
    } finally { setSaving(false); }
  }

  async function saveDocEdit() {
    if (!editDoc) return;
    if (!editDocForm.name.trim()) return toast.error('Document name required');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('name', editDocForm.name);
      fd.append('note', editDocForm.note || '');
      fd.append('chargeFee', editDocForm.chargeFee || 0);
      if (editDocFile) fd.append('file', editDocFile);
      await docsApi.update(editDoc._id, fd);
      toast.success('Document updated');
      setEditDoc(null);
      setEditDocForm({ name:'', chargeFee:'', note:'' });
      setEditDocFile(null);
      if (editDocFileRef.current) editDocFileRef.current.value = '';
      load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/></div>;
  if (!student) return <div className="text-center py-16 text-muted-foreground">Student not found</div>;

  const canEdit = !student.coreLocked || user?.role === 'Admin';
  const isCounselor = user?.role === 'Counselor';
  const isAdmin = user?.role === 'Admin';
  const canManageDocs = isCounselor || isAdmin;
  const st = STATUS_COLORS[student.applicationStatus] || 'bg-gray-100 text-gray-700';

  const allPayments = [];
  payment?.transactions?.forEach(t => allPayments.push({...t, source:'Fee'}));
  docs.forEach(d => d.payments?.forEach(p => allPayments.push({...p, source:`Doc: ${d.name}`})));
  allPayments.sort((a,b) => new Date(b.paidAt||b.createdAt)-new Date(a.paidAt||a.createdAt));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-1"/>Back</Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold">{student.name}</h1>
            {student.coreLocked && <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"><Lock className="h-3 w-3"/>Core Locked</span>}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st}`}>{student.applicationStatus?.replace(/_/g,' ')}</span>
            {student.enrollmentNumber && <span className="text-xs font-mono text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded">{student.enrollmentNumber}</span>}
            {student.enrollmentNumberChecked && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="h-3 w-3"/>Enrollment Checked
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground">{student.center?.name} · {student.counselor?.name}</div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => { setTransferCenterId(''); setTransferCenterSearch(''); setTransferNote(''); setTransferOpen(true); }}>
              <ArrowRightLeft className="h-3.5 w-3.5 mr-1"/>Transfer
            </Button>
          )}
          {user?.role === 'Center' && student.applicationStatus === 'Enrolled' && student.enrollmentNumber && !student.enrollmentNumberChecked && (
            <Button size="sm" onClick={handleEnrollmentCheck} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin"/> : <CheckCircle2 className="h-3.5 w-3.5 mr-1"/>}
              Enrollment Checked
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => {
              setForm({
                name: student.name, phone: student.phone||'', email: student.email||'',
                fatherName: student.fatherName||'', motherName: student.motherName||'',
                dob: toDateInput(student.dob), gender: student.gender||'',
                address: student.address||'', aadharNumber: student.aadharNumber||'',
                courseName: student.courseName||'', courseYear: student.courseYear||'',
                university: student.university?._id || student.university || '',
                tenth_percent: student.tenth_percent||'', tenth_year: student.tenth_year||'',
                tenth_board: student.tenth_board||'',
                twelfth_percent: student.twelfth_percent||'', twelfth_year: student.twelfth_year||'',
                twelfth_board: student.twelfth_board||'',
                // Admin-only fields
                enrollmentNumber: student.enrollmentNumber||'',
              });
              setEditOpen(true);
            }}>
              <Edit2 className="h-3.5 w-3.5 mr-1"/>Edit
            </Button>
          )}
          {(isCounselor||isAdmin) && student.applicationStatus==='Submitted' && (
            <>
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={()=>{setActionOpen('approve');setNote('');}}>Approve</Button>
              <Button size="sm" variant="outline" className="border-amber-400 text-amber-700" onClick={()=>{setActionOpen('changes');setNote('');}}>Changes</Button>
              <Button size="sm" variant="destructive" onClick={()=>{setActionOpen('reject');setNote('');}}>Reject</Button>
            </>
          )}
        </div>
      </div>

      {/* Alerts */}
      {student.applicationStatus==='Changes_Requested' && student.changesRequested && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0"/>
          <div><b>Changes Requested:</b> {student.changesRequested}</div>
        </div>
      )}
      {student.applicationStatus==='Rejected' && student.rejectionReason && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0"/>
          <div><b>Rejected:</b> {student.rejectionReason}</div>
        </div>
      )}
      {student.applicationStatus==='Cancelled' && (
        <div className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-700 flex items-start gap-2">
          <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0"/>
          <div><b>Cancelled</b>{student.rejectionReason ? `: ${student.rejectionReason}` : ''}</div>
        </div>
      )}

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
          <TabsTrigger value="docs">Documents</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        {/* ── Info Tab ── */}
        <TabsContent value="info" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[['Name', student.name], ['Phone', student.phone], ['Email', student.email],
              ['Father Name', student.fatherName], ['Mother Name', student.motherName],
              ['DOB', fmtDt(student.dob)], ['Gender', student.gender], ['Aadhaar', student.aadharNumber],
              ['Course', student.courseName], ['Session', student.courseYear],
              ['University', student.university?.name || student.universityName || student.university],
              ['Address', student.address],
              ['10th %',    student.tenth_percent    ? `${student.tenth_percent}%`    : null],
              ['10th Year', student.tenth_year       || null],
              ['10th Board',student.tenth_board      || null],
              ['12th %',    student.twelfth_percent  ? `${student.twelfth_percent}%`  : null],
              ['12th Year', student.twelfth_year     || null],
              ['12th Board',student.twelfth_board    || null],
            ].filter(([,v])=>v).map(([l,v])=>(
              <div key={l} className="bg-muted/30 rounded-lg px-3 py-2">
                <div className="text-xs text-muted-foreground">{l}</div>
                <div className="text-sm font-medium mt-0.5 break-words">{v}</div>
              </div>
            ))}
          </div>
          {student.enrollmentNumber && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
              <div className="text-xs text-muted-foreground">Enrollment Number</div>
              <div className="text-lg font-mono font-bold text-emerald-700 mt-0.5">{student.enrollmentNumber}</div>
            </div>
          )}
          <div className="border rounded-lg p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <Paperclip className="h-3.5 w-3.5"/> Submitted Documents ({student.submissionDocs?.length || 0})
            </p>
            {student.submissionDocs?.length > 0 ? (
              <div className="space-y-1.5">
                {student.submissionDocs.map((d, i) => (
                  <div key={i} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0"/>
                      <span className="truncate font-medium">{d.name}</span>
                      {d.sizeKb > 0 && <span className="text-xs text-muted-foreground shrink-0">{d.sizeKb} KB</span>}
                    </div>
                    {d.fileUrl
                      ? <a href={`${MEDIA}${d.fileUrl}`} target="_blank" rel="noreferrer"
                          className="text-xs text-blue-600 underline shrink-0 ml-2 hover:text-blue-800">View / Download</a>
                      : <span className="text-xs text-muted-foreground shrink-0 ml-2">No file uploaded</span>
                    }
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No documents submitted yet</p>
            )}
          </div>
        </TabsContent>

        {/* ── Fees Tab ── */}
        <TabsContent value="fees" className="mt-4 space-y-4">
          {payment ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[['Total Fee',fmt(payment.totalFee),'text-foreground'],['Discount',fmt(payment.discount),'text-amber-600'],['Net Fee',fmt(payment.netFee),'text-blue-600'],['Paid',fmt(payment.paidAmount),'text-emerald-600']].map(([l,v,c])=>(
                  <Card key={l}><CardContent className="pt-4 pb-3 text-center"><div className={`text-xl font-bold ${c}`}>{v}</div><div className="text-xs text-muted-foreground">{l}</div></CardContent></Card>
                ))}
              </div>
              <div className={`flex items-center justify-between rounded-lg border p-3 ${payment.dueAmount>0?'border-amber-300 bg-amber-50':'border-emerald-300 bg-emerald-50'}`}>
                <div><span className="text-sm font-medium">Balance Due: </span><span className={`text-lg font-bold ${payment.dueAmount>0?'text-amber-700':'text-emerald-700'}`}>{fmt(payment.dueAmount)}</span></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={()=>{setFf({totalFee:payment.totalFee,discount:payment.discount,notes:payment.notes||''});setFeeOpen(true);}}>Edit Fee</Button>
                  <Button size="sm" onClick={()=>setTxOpen(true)}><PlusCircle className="h-3.5 w-3.5 mr-1"/>Add Payment</Button>
                </div>
              </div>
              {payment.notes && <p className="text-sm text-muted-foreground">Note: {payment.notes}</p>}
            </>
          ) : (
            <div className="text-center py-10 border border-dashed rounded-lg">
              <IndianRupee className="h-8 w-8 mx-auto text-muted-foreground mb-2"/>
              <p className="text-sm text-muted-foreground mb-3">No fee structure</p>
              <Button onClick={()=>{setFf({totalFee:'',discount:'',notes:''});setFeeOpen(true);}}>Set Up Fees</Button>
            </div>
          )}
          {payment?.transactions?.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1"><History className="h-4 w-4"/>Fee Payment History</h4>
              <div className="space-y-1.5">
                {[...payment.transactions].reverse().map(tx=>(
                  <div key={tx._id} className="bg-muted/40 rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-emerald-700">{fmt(tx.amount)}</span>
                        {tx.mode && <span className="bg-muted px-1.5 py-0.5 rounded text-xs font-medium">{tx.mode}</span>}
                        {tx.recordedBy?.name && <span className="text-xs text-muted-foreground">by {tx.recordedBy.name}</span>}
                        {tx.verificationStatus==='verified'&&<span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ Verified</span>}
                        {tx.verificationStatus==='rejected'&&<span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">✗ Rejected</span>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">{fmtDt(tx.paidAt)}</span>
                        {isAdmin && (
                          <div className="flex gap-1">
                            <button onClick={()=>setEditTx(tx)}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors" title="Edit transaction">
                              <Edit2 className="h-3.5 w-3.5"/>
                            </button>
                            <button onClick={()=>delTx(tx._id)}
                              className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors" title="Delete transaction">
                              <Trash2 className="h-3.5 w-3.5"/>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {tx.mode==='UPI' && tx.upiId      && <div>UPI ID: <b>{tx.upiId}</b></div>}
                      {tx.utrRef                         && <div>UTR: <b className="font-mono">{tx.utrRef}</b></div>}
                      {tx.mode==='Bank Transfer' && tx.bankName      && <div>Bank: <b>{tx.bankName}</b></div>}
                      {tx.mode==='Bank Transfer' && tx.accountHolder && <div>Account Holder: <b>{tx.accountHolder}</b></div>}
                      {tx.mode==='Bank Transfer' && tx.accountNumber && <div>Account No: <b>{tx.accountNumber}</b></div>}
                      {tx.mode==='Bank Transfer' && tx.ifscCode      && <div>IFSC: <b>{tx.ifscCode}</b></div>}
                      {tx.note && <div>Note: {tx.note}</div>}
                      {tx.paymentScreenshot && (
                        <div className="mt-1.5">
                          <a href={`${MEDIA}${tx.paymentScreenshot}`} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-100 transition-colors">
                            <Download className="h-3 w-3"/>View Payment Screenshot
                          </a>
                        </div>
                      )}
                      <PaidToBox tx={tx} accMap={payAccounts}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Docs Tab ── */}
        <TabsContent value="docs" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{docs.length} document{docs.length!==1?'s':''}</p>
            {canManageDocs && student.applicationStatus==='Enrolled' && (
              <Button size="sm" onClick={()=>setDocOpen(true)}><Plus className="h-4 w-4 mr-1"/>Request Document</Button>
            )}
          </div>
          {docs.length===0?(
            <div className="text-center py-10 border border-dashed rounded-lg"><FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2"/><p className="text-sm text-muted-foreground">No documents</p></div>
          ):docs.map(d=>(
            <Card key={d._id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{d.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${DOC_STATUS_COLORS[d.status]||'bg-gray-100 text-gray-700'}`}>{d.status?.replace(/_/g,' ')}</span>
                    </div>
                    {d.note && <p className="text-xs text-muted-foreground mt-0.5">{d.note}</p>}
                    {d.fileUrl && <a href={`${MEDIA}${d.fileUrl}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline mt-1 flex items-center gap-1 w-fit"><Download className="h-3 w-3"/>View file</a>}
                    {d.scannedUrl && <a href={`${MEDIA}${d.scannedUrl}`} target="_blank" rel="noreferrer" className="text-xs text-teal-600 underline mt-1 flex items-center gap-1 w-fit"><Download className="h-3 w-3"/>Scanned copy</a>}
                    {d.courierInfo && (d.courierInfo.trackingNo || d.courierInfo.company || d.courierInfo.dispatchDate || d.courierInfo.documentsDesc) && (
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
                        🚚 {[d.courierInfo.company, d.courierInfo.trackingNo, d.courierInfo.dispatchDate ? new Date(d.courierInfo.dispatchDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '', d.courierInfo.documentsDesc].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    {(d.chargeFee>0||d.totalPaid>0) && (
                      <div className="flex gap-3 text-xs mt-1.5">
                        {d.chargeFee>0 && <span>Charge: <b>{fmt(d.chargeFee)}</b></span>}
                        {d.totalPaid>0 && <span className="text-emerald-600">Paid: <b>{fmt(d.totalPaid)}</b></span>}
                      </div>
                    )}
                    {d.statusHistory?.length>0 && (
                      <div className="mt-2 border-t pt-2">
                        <p className="text-xs text-muted-foreground font-medium mb-1">History</p>
                        <div className="space-y-0.5">
                          {d.statusHistory.slice(-4).map((h,i)=>(
                            <div key={i} className="text-xs flex gap-2 text-muted-foreground">
                              <span className="font-medium">{h.status?.replace(/_/g,' ')}</span>
                              {h.note && <span>· {h.note}</span>}
                              <span className="ml-auto">{fmtDt(h.at)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {canManageDocs && (
                    <div className="flex flex-col gap-2">
                      <Button size="sm" variant="outline" onClick={() => {
                        setEditDoc(d);
                        setEditDocForm({ name: d.name || '', chargeFee: d.chargeFee || '', note: d.note || '' });
                        setEditDocFile(null);
                        if (editDocFileRef.current) editDocFileRef.current.value = '';
                      }}>
                        <Edit2 className="h-3.5 w-3.5 mr-1"/>Edit
                      </Button>
                      {d.status==='Requested' && (
                        <Button size="sm" variant="outline" onClick={()=>forwardDoc(d._id)}>
                          <Send className="h-3.5 w-3.5 mr-1"/>Forward
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── Payments Tab ── */}
        <TabsContent value="payments" className="mt-4 space-y-3">
          <div className="flex items-center justify-between bg-muted/40 rounded-lg px-4 py-3">
            <span className="text-sm font-medium">Total Collected ({allPayments.length} transactions)</span>
            <span className="text-lg font-bold text-emerald-600">{fmt(allPayments.reduce((s,p)=>s+(p.amount||0),0))}</span>
          </div>
          {allPayments.length===0?(
            <div className="text-center py-10 border border-dashed rounded-lg"><CreditCard className="h-8 w-8 mx-auto text-muted-foreground mb-2"/><p className="text-sm text-muted-foreground">No payments yet</p></div>
          ):allPayments.map((p,i)=>(
            <div key={p._id||i} className="border rounded-lg px-3 py-2.5 text-sm bg-card">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-emerald-700">{fmt(p.amount)}</span>
                  <span className="text-xs bg-muted px-2 py-0.5 rounded">{p.source}</span>
                  {p.mode && <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">{p.mode}</span>}
                  {p.recordedBy?.name && <span className="text-xs text-muted-foreground">by {p.recordedBy.name}</span>}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{fmtDt(p.paidAt||p.createdAt)}</span>
              </div>
              <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {p.mode==='UPI' && p.upiId      && <div>UPI ID: <b>{p.upiId}</b></div>}
                {p.utrRef                        && <div>UTR: <b className="font-mono">{p.utrRef}</b></div>}
                {p.mode==='Bank Transfer' && p.bankName      && <div>Bank: <b>{p.bankName}</b></div>}
                {p.mode==='Bank Transfer' && p.accountHolder && <div>Account Holder: <b>{p.accountHolder}</b></div>}
                {p.mode==='Bank Transfer' && p.accountNumber && <div>Account No: <b>{p.accountNumber}</b></div>}
                {p.mode==='Bank Transfer' && p.ifscCode      && <div>IFSC: <b>{p.ifscCode}</b></div>}
                {p.note && <div>Note: {p.note}</div>}
                {p.paymentScreenshot && (
                  <div className="mt-1.5">
                    <a href={`${MEDIA}${p.paymentScreenshot}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-100 transition-colors">
                      <Download className="h-3 w-3"/>View Payment Screenshot
                    </a>
                  </div>
                )}
                <PaidToBox tx={p} accMap={payAccounts}/>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      {/* Transfer Center Dialog */}
      <Dialog open={transferOpen} onOpenChange={v => { setTransferOpen(v); if (!v) { setTransferCenterId(''); setTransferCenterSearch(''); setTransferNote(''); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4"/>Transfer Student Center
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="font-semibold text-slate-800">{student.name}</div>
              <div className="mt-1 text-sm text-slate-500">
                Current: <span className="font-medium text-slate-700">{student.center?.name || 'No center'}</span>
                {student.counselor?.name && <span> · {student.counselor.name}</span>}
              </div>
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
                    const current = String(c._id) === String(student.center?._id || student.center);
                    return <SelectItem key={c._id} value={c._id} disabled={current}>{c.name}{current ? ' (Current)' : ''}</SelectItem>;
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
              <Input className="mt-1" value={transferNote} onChange={e => setTransferNote(e.target.value)} placeholder="Optional reason for transfer" />
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              Student, fee record, document requests, and inventory will move to the selected center and its assigned counselor.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={saving || !transferCenterId || !transferTargetCenter?.assignedCounselor} className="bg-indigo-600 hover:bg-indigo-700">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}
              Transfer Student
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Student Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isAdmin && <Shield className="h-4 w-4 text-indigo-600"/>}
              Edit Student {isAdmin ? '(Admin — All fields editable)' : student.coreLocked ? '(Core fields locked)' : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">

            {/* Basic Info */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Basic Information</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Full Name {student.coreLocked && !isAdmin && '🔒'}</Label>
                  <Input value={form.name||''} onChange={e=>setForm(p=>({...p,name:e.target.value}))} disabled={student.coreLocked && !isAdmin}/>
                </div>
                <div><Label>Phone</Label><Input value={form.phone||''} onChange={e=>setForm(p=>({...p,phone:e.target.value}))}/></div>
                <div><Label>Email</Label><Input value={form.email||''} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/></div>
                <div>
                  <Label>Father Name {student.coreLocked && !isAdmin && '🔒'}</Label>
                  <Input value={form.fatherName||''} onChange={e=>setForm(p=>({...p,fatherName:e.target.value}))} disabled={student.coreLocked && !isAdmin}/>
                </div>
                <div><Label>Mother Name</Label><Input value={form.motherName||''} onChange={e=>setForm(p=>({...p,motherName:e.target.value}))}/></div>
                <div>
                  <Label>DOB {student.coreLocked && !isAdmin && '🔒'}</Label>
                  <Input type="date" value={form.dob||''} onChange={e=>setForm(p=>({...p,dob:e.target.value}))} disabled={student.coreLocked && !isAdmin}/>
                </div>
                <div>
                  <Label>Gender</Label>
                  <Select value={form.gender||''} onValueChange={v=>setForm(p=>({...p,gender:v}))}>
                    <SelectTrigger><SelectValue placeholder="Select…"/></SelectTrigger>
                    <SelectContent>{['Male','Female','Other'].map(g=><SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Aadhar {student.coreLocked && !isAdmin && '🔒'}</Label>
                  <Input value={form.aadharNumber||''} onChange={e=>setForm(p=>({...p,aadharNumber:e.target.value}))} disabled={student.coreLocked && !isAdmin}/>
                </div>
                <div><Label>Course</Label><Input value={form.courseName||''} onChange={e=>setForm(p=>({...p,courseName:e.target.value}))}/></div>
                <div><Label>Year / Batch</Label><Input value={form.courseYear||''} onChange={e=>setForm(p=>({...p,courseYear:e.target.value}))}/></div>
                <div className="col-span-2"><Label>Address</Label><Input value={form.address||''} onChange={e=>setForm(p=>({...p,address:e.target.value}))}/></div>
              </div>
            </div>

            {/* Academic Marks */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Academic Details</p>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">10th %</Label><Input value={form.tenth_percent||''} onChange={e=>setForm(p=>({...p,tenth_percent:e.target.value}))} placeholder="e.g. 85.5"/></div>
                <div><Label className="text-xs">10th Year</Label><Input value={form.tenth_year||''} onChange={e=>setForm(p=>({...p,tenth_year:e.target.value}))} placeholder="e.g. 2020"/></div>
                <div><Label className="text-xs">10th Board</Label><Input value={form.tenth_board||''} onChange={e=>setForm(p=>({...p,tenth_board:e.target.value}))} placeholder="e.g. CBSE"/></div>
                <div><Label className="text-xs">12th %</Label><Input value={form.twelfth_percent||''} onChange={e=>setForm(p=>({...p,twelfth_percent:e.target.value}))} placeholder="e.g. 78.2"/></div>
                <div><Label className="text-xs">12th Year</Label><Input value={form.twelfth_year||''} onChange={e=>setForm(p=>({...p,twelfth_year:e.target.value}))} placeholder="e.g. 2022"/></div>
                <div><Label className="text-xs">12th Board</Label><Input value={form.twelfth_board||''} onChange={e=>setForm(p=>({...p,twelfth_board:e.target.value}))} placeholder="e.g. UP Board"/></div>
              </div>
            </div>

            {/* Admin-only section */}
            {isAdmin && (
              <div className="border border-indigo-200 bg-indigo-50/50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5"/>Admin Only Fields
                </p>
                <div>
                  <Label>Enrollment Number</Label>
                  <Input
                    value={form.enrollmentNumber||''}
                    onChange={e=>setForm(p=>({...p,enrollmentNumber:e.target.value}))}
                    placeholder="Enter or update enrollment number"
                    className="font-mono"
                  />
                  <p className="text-xs text-slate-400 mt-1">Updating this will not change applicationStatus — use this to correct enrollment numbers.</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Tx Edit Dialog */}
      {editTx && (
        <AdminTxEditDialog
          tx={editTx}
          studentId={id}
          payAccounts={payAccounts}
          onDone={() => { setEditTx(null); load(); }}
          onClose={() => setEditTx(null)}
        />
      )}

      {/* Review Action Dialog */}
      <Dialog open={!!actionOpen} onOpenChange={()=>setActionOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionOpen==='approve'&&'Approve Application'}
              {actionOpen==='reject'&&'Reject Application'}
              {actionOpen==='changes'&&'Request Changes'}
            </DialogTitle>
          </DialogHeader>
          <div><Label>Note {(actionOpen==='reject'||actionOpen==='changes')&&'*'}</Label><Textarea value={note} onChange={e=>setNote(e.target.value)} rows={3}/></div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setActionOpen(null)}>Cancel</Button>
            <Button
              className={actionOpen==='approve'?'bg-green-600 hover:bg-green-700':actionOpen==='reject'?'bg-red-600 hover:bg-red-700':''}
              onClick={()=>doAction(actionOpen)} disabled={saving}>
              {saving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fee Setup Dialog */}
      <Dialog open={feeOpen} onOpenChange={setFeeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Fee Structure</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Total Fee (₹) *</Label><Input type="number" value={ff.totalFee} onChange={e=>setFf(p=>({...p,totalFee:e.target.value}))}/></div>
            <div><Label>Discount (₹)</Label><Input type="number" value={ff.discount} onChange={e=>setFf(p=>({...p,discount:e.target.value}))}/></div>
            {ff.totalFee && <p className="text-sm text-muted-foreground">Net: {fmt(Number(ff.totalFee)-Number(ff.discount||0))}</p>}
            <div><Label>Notes</Label><Textarea rows={2} value={ff.notes} onChange={e=>setFf(p=>({...p,notes:e.target.value}))}/></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setFeeOpen(false)}>Cancel</Button>
            <Button onClick={saveFee} disabled={saving}>{saving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Transaction Dialog */}
      <Dialog open={txOpen} onOpenChange={setTxOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Amount (₹) *</Label><Input type="number" value={tf.amount} onChange={e=>setTf(p=>({...p,amount:e.target.value}))}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Mode *</Label>
                <Select value={tf.mode} onValueChange={v=>setTf(p=>({...p,mode:v}))}>
                  <SelectTrigger><SelectValue placeholder="Select…"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Date</Label><Input type="date" value={tf.paidAt} onChange={e=>setTf(p=>({...p,paidAt:e.target.value}))}/></div>
            </div>
            {tf.mode==='UPI' && (
              <div className="space-y-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-semibold text-blue-700">UPI Details</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">UPI ID *</Label><Input value={tf.upiId} onChange={e=>setTf(p=>({...p,upiId:e.target.value}))} placeholder="name@upi"/></div>
                  <div><Label className="text-xs">UTR Number *</Label><Input value={tf.utrRef} onChange={e=>setTf(p=>({...p,utrRef:e.target.value}))} placeholder="12-digit UTR"/></div>
                </div>
              </div>
            )}
            {tf.mode==='Bank Transfer' && (
              <div className="space-y-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <p className="text-xs font-semibold text-emerald-700">Bank Transfer Details</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Bank Name *</Label><Input value={tf.bankName} onChange={e=>setTf(p=>({...p,bankName:e.target.value}))}/></div>
                  <div><Label className="text-xs">Account Holder *</Label><Input value={tf.accountHolder} onChange={e=>setTf(p=>({...p,accountHolder:e.target.value}))}/></div>
                  <div><Label className="text-xs">Account Number</Label><Input value={tf.accountNumber} onChange={e=>setTf(p=>({...p,accountNumber:e.target.value}))}/></div>
                  <div><Label className="text-xs">IFSC Code</Label><Input value={tf.ifscCode} onChange={e=>setTf(p=>({...p,ifscCode:e.target.value}))}/></div>
                  <div className="col-span-2"><Label className="text-xs">UTR / Reference *</Label><Input value={tf.utrRef} onChange={e=>setTf(p=>({...p,utrRef:e.target.value}))}/></div>
                </div>
              </div>
            )}
            {payAccounts.length > 0 && (
              <div>
                <Label>Paid To Account *</Label>
                <Select value={tf.paidToAccount||''} onValueChange={v => {
                  const acc = payAccounts.find(a => a._id === v);
                  setTf(p => ({...p, paidToAccount: v, paidToAccountLabel: acc?.label || ''}));
                }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select account payment was made to…"/></SelectTrigger>
                  <SelectContent>
                    {payAccounts.map(acc => (
                      <SelectItem key={acc._id} value={acc._id}>
                        <span className={`text-xs mr-1.5 px-1 py-0.5 rounded ${acc.mode==='UPI'?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>{acc.mode}</span>
                        {acc.label}
                        {acc.mode==='UPI' && acc.upiId ? ` — ${acc.upiId}` : ''}
                        {acc.mode==='Bank Transfer' && acc.bankName ? ` — ${acc.bankName}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tf.paidToAccount && (() => {
                  const acc = payAccounts.find(a => a._id === tf.paidToAccount);
                  if (!acc) return null;
                  return (
                    <div className="mt-1 bg-indigo-50 border border-indigo-200 rounded px-3 py-2 text-xs text-indigo-800 space-y-0.5">
                      <div className="font-semibold">{acc.label}</div>
                      {acc.mode==='UPI' && acc.upiId && <div>UPI ID: <span className="font-mono font-bold">{acc.upiId}</span></div>}
                      {acc.mode==='Bank Transfer' && acc.bankName && <div>Bank: <span className="font-semibold">{acc.bankName}</span></div>}
                      {acc.mode==='Bank Transfer' && acc.accountNumber && <div>Account No: <span className="font-mono font-bold">{acc.accountNumber}</span></div>}
                      {acc.mode==='Bank Transfer' && acc.ifscCode && <div>IFSC: <span className="font-mono">{acc.ifscCode}</span></div>}
                    </div>
                  );
                })()}
              </div>
            )}
            <div><Label>Note</Label><Input value={tf.note} onChange={e=>setTf(p=>({...p,note:e.target.value}))}/></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setTxOpen(false)}>Cancel</Button>
            <Button onClick={addTx} disabled={saving}>{saving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Doc Dialog */}
      <Dialog open={docOpen} onOpenChange={setDocOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Document</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Document Names *</Label>
              <div className="mt-1 max-h-72 overflow-y-auto rounded-md border p-2">
                {DOCUMENT_OPTIONS.map(name => {
                  const checked = docForm.names.includes(name);
                  return (
                    <label key={name} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setDocForm(p => ({
                          ...p,
                          name: '',
                          names: checked ? p.names.filter(x => x !== name) : [...p.names, name],
                        }))}
                        className="h-4 w-4 accent-indigo-600"
                      />
                      <span>{name}</span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{docForm.names.length} selected</div>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div><Label>Charge (₹)</Label><Input type="number" value={docForm.chargeFee} onChange={e=>setDocForm(p=>({...p,chargeFee:e.target.value}))}/></div>
            </div>
            <div><Label>Note</Label><Input value={docForm.note} onChange={e=>setDocForm(p=>({...p,note:e.target.value}))}/></div>
            <div><Label>Upload File</Label><input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e=>setDocFile(e.target.files[0])} className="block w-full text-sm mt-1 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-muted"/></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setDocOpen(false)}>Cancel</Button>
            <Button onClick={addDoc} disabled={saving}>{saving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editDoc} onOpenChange={() => {
        setEditDoc(null);
        setEditDocFile(null);
        if (editDocFileRef.current) editDocFileRef.current.value = '';
      }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Document Request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Document Name *</Label>
              <Select value={editDocForm.name} onValueChange={v=>setEditDocForm(p=>({...p,name:v}))}>
                <SelectTrigger><SelectValue placeholder="Choose document"/></SelectTrigger>
                <SelectContent className="max-h-72">
                  {DOCUMENT_OPTIONS.map(name=><SelectItem key={name} value={name}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Charge (₹)</Label><Input type="number" value={editDocForm.chargeFee} onChange={e=>setEditDocForm(p=>({...p,chargeFee:e.target.value}))}/></div>
            <div><Label>Note</Label><Input value={editDocForm.note} onChange={e=>setEditDocForm(p=>({...p,note:e.target.value}))}/></div>
            <div>
              <Label>Replace File</Label>
              <input ref={editDocFileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e=>setEditDocFile(e.target.files[0] || null)} className="block w-full text-sm mt-1 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-muted"/>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setEditDoc(null)}>Cancel</Button>
            <Button onClick={saveDocEdit} disabled={saving}>{saving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Search, Edit2, Phone, Mail, ArrowLeft, Loader2,
  IndianRupee, FileText, CreditCard, PlusCircle, Trash2,
  History, Download, Send, AlertTriangle, Paperclip, Pencil,
  CheckCircle2, ChevronRight, User, GraduationCap, BookOpen, KeyRound,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { studentsApi, paymentsApi, docsApi, centersApi, counselorsApi, universitiesApi, paymentAccountsApi, authApi } from '@/lib/api';

const MEDIA = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
const fmt   = n => `₹${(Number(n)||0).toLocaleString('en-IN')}`;
const fmtDt = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const MODES = ['UPI', 'Bank Transfer'];

// ── Payment Form Fields Component ─────────────────────────────
function PaymentFields({ form, setForm, showAmount = true, showDate = true }) {
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const isUPI  = form.mode === 'UPI';
  const isBank = form.mode === 'Bank Transfer';
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    paymentAccountsApi.list().then(setAccounts).catch(() => {});
  }, []);

  function selectAccount(accId) {
    if (!accId) { set('paidToAccount', ''); set('paidToAccountLabel', ''); return; }
    const acc = accounts.find(a => a._id === accId);
    if (acc) { set('paidToAccount', acc._id); set('paidToAccountLabel', acc.label); }
  }

  return (
    <div className="space-y-3">
      {showAmount && (
        <div>
          <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Amount (₹) *</Label>
          <Input type="number" value={form.amount||''} onChange={e=>set('amount',e.target.value)} placeholder="0" className="mt-1 h-10 border-slate-200 focus:border-indigo-400 focus:ring-indigo-100"/>
        </div>
      )}
      <div className={showDate ? 'grid grid-cols-2 gap-3' : ''}>
        <div>
          <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Payment Mode *</Label>
          <Select value={form.mode||''} onValueChange={v=>set('mode',v)}>
            <SelectTrigger className="mt-1 h-10 border-slate-200"><SelectValue placeholder="Select mode…"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="UPI">UPI</SelectItem>
              <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {showDate && (
          <div>
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Date</Label>
            <Input type="date" value={form.paidAt||''} onChange={e=>set('paidAt',e.target.value)} className="mt-1 h-10 border-slate-200"/>
          </div>
        )}
      </div>

      {isUPI && (
        <div className="space-y-2 p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl">
          <p className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 inline-block"/>UPI Details
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-slate-500">UPI ID *</Label>
              <Input value={form.upiId||''} onChange={e=>set('upiId',e.target.value)} placeholder="name@upi" className="mt-0.5 h-9 text-sm border-blue-200 bg-white"/>
            </div>
            <div>
              <Label className="text-xs text-slate-500">UTR Number *</Label>
              <Input value={form.utrRef||''} onChange={e=>set('utrRef',e.target.value)} placeholder="12-digit UTR" className="mt-0.5 h-9 text-sm border-blue-200 bg-white font-mono"/>
            </div>
          </div>
        </div>
      )}

      {isBank && (
        <div className="space-y-2 p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block"/>Bank Transfer Details
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-slate-500">Bank Name *</Label>
              <Input value={form.bankName||''} onChange={e=>set('bankName',e.target.value)} placeholder="e.g. SBI, HDFC" className="mt-0.5 h-9 text-sm border-emerald-200 bg-white"/>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Account Holder *</Label>
              <Input value={form.accountHolder||''} onChange={e=>set('accountHolder',e.target.value)} placeholder="As per bank" className="mt-0.5 h-9 text-sm border-emerald-200 bg-white"/>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Account Number</Label>
              <Input value={form.accountNumber||''} onChange={e=>set('accountNumber',e.target.value)} placeholder="Account number" className="mt-0.5 h-9 text-sm border-emerald-200 bg-white font-mono"/>
            </div>
            <div>
              <Label className="text-xs text-slate-500">IFSC Code</Label>
              <Input value={form.ifscCode||''} onChange={e=>set('ifscCode',e.target.value)} placeholder="e.g. SBIN0001234" className="mt-0.5 h-9 text-sm border-emerald-200 bg-white font-mono"/>
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-slate-500">UTR / Reference Number *</Label>
              <Input value={form.utrRef||''} onChange={e=>set('utrRef',e.target.value)} placeholder="Transaction UTR/Reference" className="mt-0.5 h-9 text-sm border-emerald-200 bg-white font-mono"/>
            </div>
          </div>
        </div>
      )}

      {/* Paid To Account Dropdown */}
      {accounts.length > 0 && (
        <div>
          <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Paid To Account *</Label>
          <Select value={form.paidToAccount||''} onValueChange={selectAccount}>
            <SelectTrigger className="mt-1 h-10 border-slate-200 focus:border-indigo-400">
              <SelectValue placeholder="Select account payment was made to…"/>
            </SelectTrigger>
            <SelectContent>
              {accounts.map(acc => (
                <SelectItem key={acc._id} value={acc._id}>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${acc.mode === 'UPI' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{acc.mode}</span>
                    <span>{acc.label}</span>
                    {acc.mode === 'UPI' && acc.upiId && <span className="text-slate-400 text-xs">— {acc.upiId}</span>}
                    {acc.mode === 'Bank Transfer' && acc.bankName && <span className="text-slate-400 text-xs">— {acc.bankName}</span>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.paidToAccount && (() => {
            const acc = accounts.find(a => a._id === form.paidToAccount);
            if (!acc) return null;
            return (
              <div className="mt-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs text-indigo-800 space-y-0.5">
                <div className="font-semibold">{acc.label}</div>
                {acc.mode === 'UPI' && acc.upiId && <div>UPI ID: <span className="font-mono font-bold">{acc.upiId}</span></div>}
                {acc.mode === 'UPI' && acc.upiName && <div>Name: {acc.upiName}</div>}
                {acc.mode === 'Bank Transfer' && acc.bankName && <div>Bank: <span className="font-bold">{acc.bankName}</span></div>}
                {acc.mode === 'Bank Transfer' && acc.accountHolder && <div>Account Holder: {acc.accountHolder}</div>}
                {acc.mode === 'Bank Transfer' && acc.accountNumber && <div>Account No: <span className="font-mono font-bold">{acc.accountNumber}</span></div>}
                {acc.mode === 'Bank Transfer' && acc.ifscCode && <div>IFSC: <span className="font-mono">{acc.ifscCode}</span></div>}
              </div>
            );
          })()}
        </div>
      )}

      {/* Payment Screenshot */}
<div>
  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
    Payment Screenshot *
  </Label>
  <input
    type="file"
    accept="image/*,.pdf"
    onChange={e => set('paymentScreenshot', e.target.files[0])}
    className="mt-1 block w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-indigo-50 file:text-indigo-600 file:font-medium"
  />
  {form.paymentScreenshot && typeof form.paymentScreenshot === 'string' && (
    <a href={`${MEDIA}${form.paymentScreenshot}`} target="_blank" rel="noreferrer"
      className="text-xs text-indigo-600 underline mt-1 flex items-center gap-1">
      <Download className="h-3 w-3"/>View uploaded screenshot
    </a>
  )}
</div>







      <div>
        <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Note</Label>
        <Input value={form.note||''} onChange={e=>set('note',e.target.value)} placeholder="Optional note" className="mt-1 h-9 border-slate-200"/>
      </div>
    </div>
  );
}

// ── Payment display helper ─────────────────────────────────────
function PaymentDetail({ tx, accMap }) {
  if (!tx) return null;
  const isUPI  = tx.mode === 'UPI';
  const isBank = tx.mode === 'Bank Transfer';
  const acc = accMap && tx.paidToAccount ? accMap[String(tx.paidToAccount)] : null;
  const accIsUPI  = acc?.mode === 'UPI';
  const accIsBank = acc?.mode === 'Bank Transfer';
  return (
    <div className="text-xs text-slate-500 space-y-0.5 mt-0.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {tx.mode && <span className="inline-flex items-center bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-xs font-medium">{tx.mode}</span>}
      </div>
      {isUPI  && tx.upiId         && <div>UPI ID: <span className="font-mono font-semibold text-slate-700">{tx.upiId}</span></div>}
      {tx.utrRef                   && <div>UTR: <span className="font-mono font-semibold text-slate-700">{tx.utrRef}</span></div>}
      {isBank && tx.bankName       && <div>Bank: <span className="font-semibold text-slate-700">{tx.bankName}</span></div>}
      {isBank && tx.accountHolder  && <div>Account Holder: <span className="font-semibold text-slate-700">{tx.accountHolder}</span></div>}
      {isBank && tx.accountNumber  && <div>Account No: <span className="font-mono font-semibold text-slate-700">{tx.accountNumber}</span></div>}
      {isBank && tx.ifscCode       && <div>IFSC: <span className="font-mono font-semibold text-slate-700">{tx.ifscCode}</span></div>}
      {tx.note && <div className="italic text-slate-400">"{tx.note}"</div>}
      {tx.paymentScreenshot && (
  <div className="mt-1.5">
    <a
      href={`${MEDIA}${tx.paymentScreenshot}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-100 transition-colors"
    >
      <Download className="h-3 w-3"/>View Payment Screenshot
    </a>
  </div>
)}
      {/* Paid To Account box */}
      {(acc || tx.paidToAccountLabel) && (
        <div className="mt-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Paid To</span>
            <span className="text-xs font-semibold text-indigo-800">{acc?.label || tx.paidToAccountLabel}</span>
            {acc?.mode && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${accIsUPI ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{acc.mode}</span>}
          </div>
          {acc && (
            <div className="space-y-0.5 text-xs text-indigo-700">
              {accIsUPI  && acc.upiId         && <div>UPI ID: <span className="font-mono font-bold">{acc.upiId}</span></div>}
              {accIsUPI  && acc.upiName        && <div>Name: <span className="font-semibold">{acc.upiName}</span></div>}
              {accIsBank && acc.bankName       && <div>Bank: <span className="font-semibold">{acc.bankName}</span></div>}
              {accIsBank && acc.accountHolder  && <div>Account Holder: <span className="font-semibold">{acc.accountHolder}</span></div>}
              {accIsBank && acc.accountNumber  && <div>Account No: <span className="font-mono font-bold">{acc.accountNumber}</span></div>}
              {accIsBank && acc.ifscCode       && <div>IFSC: <span className="font-mono font-semibold">{acc.ifscCode}</span></div>}
              {accIsBank && acc.branch         && <div>Branch: <span className="font-semibold">{acc.branch}</span></div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const APP_STATUS = {
  Draft:              {label:'Draft',              color:'bg-slate-100 text-slate-600 border border-slate-200'},
  Submitted:          {label:'Under Review',       color:'bg-blue-50 text-blue-700 border border-blue-200'},
  Changes_Requested:  {label:'⚠ Changes Needed',  color:'bg-amber-50 text-amber-700 border border-amber-300'},
  // Internal stages — center sees "In Process" 
  Counselor_Approved: {label:'In Process',         color:'bg-slate-100 text-slate-500 border border-slate-200'},
  Accountant_Pending: {label:'In Process',         color:'bg-slate-100 text-slate-500 border border-slate-200'},
  Accountant_Rejected:{label:'In Process',         color:'bg-slate-100 text-slate-500 border border-slate-200'},
  University_Rejected:{label:'In Process',         color:'bg-slate-100 text-slate-500 border border-slate-200'},
  // Visible outcomes
  Sent_To_University: {label:'In Process',         color:'bg-slate-100 text-slate-500 border border-slate-200'},
  Rejected:           {label:'Rejected',           color:'bg-red-50 text-red-600 border border-red-200'},
  Enrolled:           {label:'✓ Enrolled',         color:'bg-emerald-50 text-emerald-700 border border-emerald-200'},
};
const DOC_STATUS = {
  Requested:{label:'Requested',color:'bg-blue-50 text-blue-700 border border-blue-200'},
  Forwarded:{label:'Forwarded',color:'bg-indigo-50 text-indigo-700 border border-indigo-200'},
  Fee_Approved:{label:'Fee Approved',color:'bg-green-50 text-green-700 border border-green-200'},
  Fee_Rejected:{label:'Fee Rejected',color:'bg-red-50 text-red-600 border border-red-200'},
  Sent_To_University:{label:'At University',color:'bg-purple-50 text-purple-700 border border-purple-200'},
  University_Dispatched:{label:'Uni Dispatched',color:'bg-violet-50 text-violet-700 border border-violet-200'},
  Dispatch_Received:{label:'Dispatch Received',color:'bg-teal-50 text-teal-700 border border-teal-200'},
  Counselor_Received:{label:'With Counselor',color:'bg-indigo-50 text-indigo-700 border border-indigo-200'},
  Center_Notified:{label:'⚡ Pay Required',color:'bg-amber-50 text-amber-700 border border-amber-300'},
  Payment_Submitted:{label:'Payment Sent',color:'bg-blue-50 text-blue-700 border border-blue-200'},
  Payment_Verified:{label:'Payment Verified',color:'bg-green-50 text-green-700 border border-green-200'},
  Dispatched:{label:'🚚 Dispatched',color:'bg-teal-50 text-teal-700 border border-teal-200'},
  Delivered:{label:'✓ Delivered',color:'bg-emerald-50 text-emerald-700 border border-emerald-200'},
};
const SBadge = ({status,map}) => {
  const s=(map||APP_STATUS)[status]||{label:status,color:'bg-slate-100 text-slate-600 border border-slate-200'};
  return <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>;
};

// Default documents checklist
const DEFAULT_DOCS = [
  'Aadhaar Card','10th Marksheet','10th Certificate',
  '12th Marksheet','12th Certificate','Migration Certificate',
  'Transfer Certificate','Passport Size Photo',
  'Caste Certificate (if applicable)','Income Certificate (if applicable)',
];

const EMPTY_STUDENT = {
  name:'', fatherName:'', motherName:'', dob:'', age:'',
  phone:'', email:'', address:'', gender:'', aadharNumber:'',
  tenth_percent:'', tenth_year:'', tenth_board:'',
  twelfth_percent:'', twelfth_year:'', twelfth_board:'',
  courseName:'', courseYear:'', universityId:'',
};

// ── Section Header ─────────────────────────────────────────────
function SectionHeader({ icon: Icon, label, color = 'text-slate-500', bg = 'bg-slate-100' }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className={`h-7 w-7 rounded-lg ${bg} flex items-center justify-center`}>
        <Icon className={`h-3.5 w-3.5 ${color}`}/>
      </div>
      <h3 className="font-semibold text-sm text-slate-800">{label}</h3>
    </div>
  );
}

// ── Step Indicator ────────────────────────────────────────────
function StepIndicator({ step }) {
  const steps = [
    { n:1, label:'Student Details', icon:User },
    { n:2, label:'Fee Details',     icon:IndianRupee },
    { n:3, label:'Review & Submit', icon:CheckCircle2 },
  ];
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className={`flex flex-col items-center gap-1.5 ${step >= s.n ? 'text-indigo-600' : 'text-slate-400'}`}>
            <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all shadow-sm ${
              step > s.n  ? 'bg-emerald-500 border-emerald-500 text-white shadow-emerald-200' :
              step === s.n ? 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-200' :
                             'bg-white border-slate-200 text-slate-400'
            }`}>
              {step > s.n ? '✓' : s.n}
            </div>
            <span className="text-xs font-semibold whitespace-nowrap">{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 w-10 sm:w-16 mx-2 mb-5 rounded-full transition-all ${step > s.n ? 'bg-emerald-400' : 'bg-slate-200'}`}/>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Field Group ────────────────────────────────────────────────
function FieldGroup({ label, children }) {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

// ── Add Student Wizard ────────────────────────────────────────
function AddStudentWizard({ onClose, onSaved, defCounselor, centerId }) {
  const [step,   setStep]   = useState(1);
  const [saving, setSaving] = useState(false);
  const fileRefs = useRef([]);

  const [form, setForm] = useState({ ...EMPTY_STUDENT });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const [universities, setUniversities] = useState([]);
  useEffect(() => {
    if (centerId) {
      centersApi.getOne(centerId)
        .then(center => {
          const allowed = center?.allowedUniversities || [];
          if (allowed.length > 0) setUniversities(allowed);
          else universitiesApi.getAll().then(setUniversities).catch(() => {});
        })
        .catch(() => { universitiesApi.getAll().then(setUniversities).catch(() => {}); });
    } else {
      universitiesApi.getAll().then(setUniversities).catch(() => {});
    }
  }, [centerId]);

  const [fee, setFee] = useState({ totalFee:'', discount:'', notes:'' });
  const setF = (k, v) => setFee(p => ({ ...p, [k]: v }));

  const [docList, setDocList] = useState(
    DEFAULT_DOCS.map(name => ({ name, checked: true, file: null }))
  );
  const [customDoc, setCustomDoc] = useState('');

  function toggleDoc(i)    { setDocList(p => p.map((d,j) => j===i ? {...d, checked:!d.checked} : d)); }
  function setDocFile(i,f) { setDocList(p => p.map((d,j) => j===i ? {...d, file:f} : d)); }
  function addCustomDoc() {
    if (!customDoc.trim()) return;
    setDocList(p => [...p, { name: customDoc.trim(), checked: true, file: null }]);
    setCustomDoc('');
  }
  function removeDoc(i) { setDocList(p => p.filter((_,j) => j !== i)); }

  const netFee = Number(fee.totalFee||0) - Number(fee.discount||0);

  async function handleSave() {
    if (!form.name.trim())       return toast.error('Student name required');
    // if (!form.phone.trim())      return toast.error('Phone required');
    if (!form.courseName.trim()) return toast.error('Course name required');
    if (!form.universityId)      return toast.error('Please select a university');
    if (!defCounselor)           return toast.error('No counselor assigned. Contact admin.');
    setSaving(true);
    try {
      const student = await studentsApi.create({ ...form, counselor: defCounselor });
      if (fee.totalFee && Number(fee.totalFee) > 0) {
        await paymentsApi.upsertFee(student._id, {
          totalFee: Number(fee.totalFee), discount: Number(fee.discount)||0, notes: fee.notes,
        });
      }
      const checkedDocs = docList.filter(d => d.checked);
      if (checkedDocs.length > 0) {
        const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        const token = localStorage.getItem('crm_token');
        const fd = new FormData();
        fd.append('submissionDocs', JSON.stringify(checkedDocs.map(d => ({ name: d.name, fileUrl: '' }))));
        checkedDocs.forEach((d, i) => { if (d.file) fd.append(`submissionFile_${i}`, d.file); });
        fd.append('submissionDocCount', String(checkedDocs.length));
        await fetch(`${BASE}/students/${student._id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
      }
      toast.success('Student added successfully!');
      onSaved();
      onClose();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <StepIndicator step={step}/>

      {/* ── STEP 1 ─────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <FieldGroup label="Personal Information">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs font-semibold text-slate-600">Full Name *</Label>
                <Input value={form.name} onChange={e=>set('name',e.target.value.toUpperCase())} placeholder="Student's full name" className="mt-1 border-slate-200 h-10"/>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Father's Name *</Label>
                <Input value={form.fatherName} onChange={e=>set('fatherName',e.target.value.toUpperCase())} placeholder="Father's full name" className="mt-1 border-slate-200 h-10"/>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Mother's Name</Label>
                <Input value={form.motherName} onChange={e=>set('motherName',e.target.value.toUpperCase())} placeholder="Mother's full name" className="mt-1 border-slate-200 h-10"/>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Date of Birth</Label>
                <Input type="date" value={form.dob} onChange={e=>{ set('dob',e.target.value); if(e.target.value){ const age=Math.floor((new Date()-new Date(e.target.value))/(365.25*24*3600*1000)); set('age',String(age)); }}} className="mt-1 border-slate-200 h-10"/>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Age</Label>
                <Input type="number" value={form.age} onChange={e=>set('age',e.target.value)} placeholder="Auto-fills from DOB" className="mt-1 border-slate-200 h-10"/>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Gender</Label>
                <Select value={form.gender} onValueChange={v=>set('gender',v)}>
                  <SelectTrigger className="mt-1 border-slate-200 h-10"><SelectValue placeholder="Select…"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Phone </Label>
                <Input value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="+91 XXXXX XXXXX" className="mt-1 border-slate-200 h-10"/>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Email</Label>
                <Input type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="student@example.com" className="mt-1 border-slate-200 h-10"/>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Aadhaar Number</Label>
                <Input value={form.aadharNumber} onChange={e=>set('aadharNumber',e.target.value.toUpperCase())} placeholder="XXXX XXXX XXXX" className="mt-1 border-slate-200 h-10 font-mono"/>
              </div>
              <div className="col-span-2">
                <Label className="text-xs font-semibold text-slate-600">Address</Label>
                <Input value={form.address} onChange={e=>set('address',e.target.value.toUpperCase())} placeholder="Full address" className="mt-1 border-slate-200 h-10"/>
              </div>
            </div>
          </FieldGroup>

          <FieldGroup label="Academic Information">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="h-px flex-1 bg-slate-200"/>10th Details<span className="h-px flex-1 bg-slate-200"/>
                </p>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">10th %</Label>
                <Input value={form.tenth_percent} onChange={e=>set('tenth_percent',e.target.value.toUpperCase())} placeholder="e.g. 85.5" className="mt-1 border-slate-200 h-10"/>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Passing Year</Label>
                <Input value={form.tenth_year} onChange={e=>set('tenth_year',e.target.value.toUpperCase())} placeholder="e.g. 2020" className="mt-1 border-slate-200 h-10"/>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Board</Label>
                <Input value={form.tenth_board} onChange={e=>set('tenth_board',e.target.value.toUpperCase())} placeholder="CBSE / State" className="mt-1 border-slate-200 h-10"/>
              </div>
              <div className="col-span-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-1 flex items-center gap-1.5">
                  <span className="h-px flex-1 bg-slate-200"/>12th Details<span className="h-px flex-1 bg-slate-200"/>
                </p>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">12th %</Label>
                <Input value={form.twelfth_percent} onChange={e=>set('twelfth_percent',e.target.value.toUpperCase())} placeholder="e.g. 78.0" className="mt-1 border-slate-200 h-10"/>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Passing Year</Label>
                <Input value={form.twelfth_year} onChange={e=>set('twelfth_year',e.target.value.toUpperCase())} placeholder="e.g. 2022" className="mt-1 border-slate-200 h-10"/>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Board</Label>
                <Input value={form.twelfth_board} onChange={e=>set('twelfth_board',e.target.value.toUpperCase())} placeholder="CBSE / State" className="mt-1 border-slate-200 h-10"/>
              </div>
              <div className="col-span-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-1 flex items-center gap-1.5">
                  <span className="h-px flex-1 bg-slate-200"/>Course for Admission<span className="h-px flex-1 bg-slate-200"/>
                </p>
              </div>
              <div className="col-span-2">
                <Label className="text-xs font-semibold text-slate-600">Course Name *</Label>
                <Input value={form.courseName} onChange={e=>set('courseName',e.target.value.toUpperCase())} placeholder="e.g. MBA, BCA, B.Tech" className="mt-1 border-slate-200 h-10"/>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Session</Label>
                <Input value={form.courseYear} onChange={e=>set('courseYear',e.target.value.toUpperCase())} placeholder="2024-26" className="mt-1 border-slate-200 h-10"/>
              </div>
              <div className="col-span-3">
                <Label className="text-xs font-semibold text-slate-600">University *</Label>
                <Select value={form.universityId} onValueChange={v=>set('universityId',v)}>
                  <SelectTrigger className="mt-1 border-slate-200 h-10">
                    <SelectValue placeholder="Select university…"/>
                  </SelectTrigger>
                  <SelectContent>
                    {universities.map(u=>(
                      <SelectItem key={u._id} value={u._id}>{u.name}{u.shortName ? ` (${u.shortName})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </FieldGroup>

          <FieldGroup label="Documents Checklist">
            <p className="text-xs text-slate-400 mb-3">Tick documents that are available / will be submitted</p>
            <div className="space-y-1.5">
              {docList.map((doc, i) => (
                <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                  doc.checked
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-slate-50 border-slate-200 opacity-60'
                }`}>
                  <input type="checkbox" checked={doc.checked} onChange={() => toggleDoc(i)}
                    className="h-4 w-4 rounded accent-emerald-600 flex-shrink-0"/>
                  <span className={`flex-1 text-sm font-medium ${doc.checked ? 'text-slate-700' : 'text-slate-400 line-through'}`}>{doc.name}</span>
                  {doc.checked && (
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                      onChange={e => setDocFile(i, e.target.files[0])}
                      className="text-xs w-28 file:text-xs file:bg-white file:border file:border-slate-200 file:rounded file:px-2 file:py-0.5 file:mr-2 file:text-slate-600"/>
                  )}
                  <button onClick={() => removeDoc(i)} className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
                    <Trash2 className="h-3.5 w-3.5"/>
                  </button>
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <Input value={customDoc} onChange={e => setCustomDoc(e.target.value)}
                  placeholder="Add custom document…" className="flex-1 text-sm h-9 border-slate-200"
                  onKeyDown={e => e.key === 'Enter' && addCustomDoc()}/>
                <Button size="sm" variant="outline" onClick={addCustomDoc} className="h-9 border-slate-200 text-slate-600">
                  <Plus className="h-3.5 w-3.5 mr-1"/>Add
                </Button>
              </div>
            </div>
          </FieldGroup>
        </div>
      )}

      {/* ── STEP 2 ─────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <FieldGroup label="Fee Structure">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold text-slate-600">Total Fee (₹) *</Label>
                <Input type="number" value={fee.totalFee} onChange={e => setF('totalFee',e.target.value)}
                  placeholder="e.g. 50000" className="text-lg font-bold mt-1 h-12 border-slate-200"/>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Discount (₹)</Label>
                <Input type="number" value={fee.discount} onChange={e => setF('discount',e.target.value)}
                  placeholder="0" className="text-lg font-bold mt-1 h-12 border-slate-200"/>
              </div>
            </div>

            {fee.totalFee && (
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="bg-slate-50 rounded-xl py-3 text-center border border-slate-200">
                  <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Total Fee</div>
                  <div className="text-lg font-bold text-slate-700 mt-1">{fmt(Number(fee.totalFee))}</div>
                </div>
                <div className="bg-amber-50 rounded-xl py-3 text-center border border-amber-200">
                  <div className="text-xs text-amber-500 font-medium uppercase tracking-wider">Discount</div>
                  <div className="text-lg font-bold text-amber-600 mt-1">- {fmt(Number(fee.discount||0))}</div>
                </div>
                <div className="bg-emerald-50 rounded-xl py-3 text-center border border-emerald-300">
                  <div className="text-xs text-emerald-600 font-medium uppercase tracking-wider">Net Payable</div>
                  <div className="text-lg font-bold text-emerald-700 mt-1">{fmt(netFee)}</div>
                </div>
              </div>
            )}

            <div className="mt-3">
              <Label className="text-xs font-semibold text-slate-600">Notes</Label>
              <Textarea rows={2} value={fee.notes} onChange={e => setF('notes',e.target.value)}
                placeholder="Any payment terms, installment details, etc." className="mt-1 border-slate-200 text-sm resize-none"/>
            </div>
          </FieldGroup>

          <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <div className="h-5 w-5 rounded-full bg-blue-200 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-blue-700 text-xs font-bold">i</span>
            </div>
            <p className="text-xs text-blue-700">Fee details are locked after first submission. You can add payments later from the student's Fee tab.</p>
          </div>
        </div>
      )}

      {/* ── STEP 3 ─────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Review all details before saving.</p>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between border-b border-slate-200">
              <span className="font-semibold text-sm text-slate-700 flex items-center gap-2"><User className="h-4 w-4 text-slate-400"/>Student Details</span>
              <button onClick={() => setStep(1)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
                <Pencil className="h-3 w-3"/>Edit
              </button>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              {[
                ['Name', form.name],['Father', form.fatherName],['Mother', form.motherName],
                ['DOB', form.dob ? fmtDt(form.dob) : ''],['Age', form.age],['Gender', form.gender],
                ['Phone', form.phone],['Email', form.email],['Aadhaar', form.aadharNumber],
                ['10th %', form.tenth_percent && `${form.tenth_percent}% (${form.tenth_year})`],
                ['12th %', form.twelfth_percent && `${form.twelfth_percent}% (${form.twelfth_year})`],
                ['Course', form.courseName],['Session', form.courseYear],
                ['University', form.universityId ? (universities.find(u=>u._id===form.universityId)?.name || form.universityId) : ''],
              ].filter(([,v])=>v).map(([l,v])=>(
                <div key={l} className="bg-slate-50 rounded-lg px-3 py-2">
                  <div className="text-xs text-slate-400 font-medium">{l}</div>
                  <div className="font-semibold text-slate-700 mt-0.5 text-sm break-words">{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between border-b border-slate-200">
              <span className="font-semibold text-sm text-slate-700 flex items-center gap-2"><IndianRupee className="h-4 w-4 text-slate-400"/>Fee Details</span>
              <button onClick={() => setStep(2)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
                <Pencil className="h-3 w-3"/>Edit
              </button>
            </div>
            <div className="p-4">
              {fee.totalFee ? (
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-slate-50 rounded-lg py-2 border border-slate-200"><div className="text-xs text-slate-400">Total</div><div className="font-bold text-slate-700">{fmt(Number(fee.totalFee))}</div></div>
                  <div className="bg-amber-50 rounded-lg py-2 border border-amber-200"><div className="text-xs text-amber-500">Discount</div><div className="font-bold text-amber-600">- {fmt(Number(fee.discount||0))}</div></div>
                  <div className="bg-emerald-50 rounded-lg py-2 border border-emerald-200"><div className="text-xs text-emerald-600">Net</div><div className="font-bold text-emerald-700">{fmt(netFee)}</div></div>
                </div>
              ) : <p className="text-sm text-slate-400 italic">No fee set — can add later</p>}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between border-b border-slate-200">
              <span className="font-semibold text-sm text-slate-700 flex items-center gap-2"><FileText className="h-4 w-4 text-slate-400"/>Documents ({docList.filter(d=>d.checked).length})</span>
              <button onClick={() => setStep(1)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
                <Pencil className="h-3 w-3"/>Edit
              </button>
            </div>
            <div className="p-4 flex flex-wrap gap-2">
              {docList.filter(d => d.checked).map((d,i) => (
                <span key={i} className="text-xs flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full px-3 py-1 font-medium">
                  <CheckCircle2 className="h-3 w-3"/>
                  {d.name}{d.file ? ' 📎' : ''}
                </span>
              ))}
              {docList.filter(d => !d.checked).map((d,i) => (
                <span key={i} className="text-xs text-slate-400 line-through bg-slate-50 border border-slate-200 rounded-full px-3 py-1">{d.name}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-200">
        <Button variant="outline" onClick={() => { if(step===1) onClose(); else setStep(p=>p-1); }}
          className="border-slate-200 text-slate-600 hover:bg-slate-50">
          {step === 1 ? 'Cancel' : '← Back'}
        </Button>
        <div className="flex gap-2">
          {step < 3 && (
            <Button onClick={() => {
              if (step===1) {
                if (!form.name.trim())     return toast.error('Name required');
                // if (!form.phone.trim())    return toast.error('Phone required');
                if (!form.courseName.trim()) return toast.error('Course name required');
              }
              setStep(p=>p+1);
            }} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              Next →
            </Button>
          )}
          {step === 3 && (
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6">
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin"/>}
              Save Student
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── FEE SECTION ──────────────────────────────────────────────
function FeeSection({ studentId, appStatus }) {
  const [data,setData]=useState(null); const [loading,setLoading]=useState(true);
  const [feeOpen,setFeeOpen]=useState(false); const [txOpen,setTxOpen]=useState(false);
  const [editTx,setEditTx]=useState(null);
  const [saving,setSaving]=useState(false);
  const [accMap,setAccMap]=useState({});
  const [ff,setFf]=useState({totalFee:'',discount:'',notes:''});
  const EMPTY_TF = {amount:'',mode:'',upiId:'',utrRef:'',bankName:'',accountHolder:'',accountNumber:'',ifscCode:'',note:'',paidAt:'', paymentScreenshot: null};
  const [tf,setTf]=useState({...EMPTY_TF});

  useEffect(() => {
    paymentAccountsApi.list().then(accs => {
      const map = {};
      accs.forEach(a => { map[String(a._id)] = a; });
      setAccMap(map);
    }).catch(() => {});
  }, []);

  const load=useCallback(async()=>{ try{setLoading(true);setData(await paymentsApi.get(studentId));} catch{} finally{setLoading(false);} },[studentId]);
  useEffect(()=>{load();},[load]);

  const canSetFee = ['Draft', 'Changes_Requested'].includes(appStatus);

  async function saveFee(){
    if(!ff.totalFee) return toast.error('Total fee required');
    setSaving(true);
    try{ await paymentsApi.upsertFee(studentId,{totalFee:Number(ff.totalFee),discount:Number(ff.discount)||0,notes:ff.notes}); toast.success('Fee saved'); setFeeOpen(false); load(); }
    catch(e){toast.error(e.message);} finally{setSaving(false);}
  }

  async function addTx(){
    if(!tf.amount||Number(tf.amount)<=0) return toast.error('Enter valid amount');
    if(!tf.mode) return toast.error('Select payment mode');
    if(!tf.utrRef.trim()) return toast.error('UTR number is required');
    if (!tf.paymentScreenshot) return toast.error('Payment screenshot is required');
    if(tf.mode==='UPI' && !tf.upiId.trim()) return toast.error('UPI ID is required');
    if(tf.mode==='Bank Transfer' && !tf.bankName.trim()) return toast.error('Bank name is required');
    if(tf.mode==='Bank Transfer' && !tf.accountHolder.trim()) return toast.error('Account holder name is required');
    setSaving(true);
    try{
      const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    const token = localStorage.getItem('crm_token');
    const fd = new FormData();
    fd.append('amount', tf.amount);
    fd.append('mode', tf.mode);
    fd.append('upiId', tf.upiId || '');
    fd.append('utrRef', tf.utrRef || '');
    fd.append('bankName', tf.bankName || '');
    fd.append('accountHolder', tf.accountHolder || '');
    fd.append('accountNumber', tf.accountNumber || '');
    fd.append('ifscCode', tf.ifscCode || '');
    fd.append('note', tf.note || '');
    fd.append('paidAt', tf.paidAt || '');
    fd.append('paidToAccount', tf.paidToAccount || '');
    fd.append('paidToAccountLabel', tf.paidToAccountLabel || '');
    if (tf.paymentScreenshot) fd.append('paymentScreenshot', tf.paymentScreenshot);

    await fetch(`${BASE}/payments/${studentId}/transactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
      toast.success('Payment recorded'); setTxOpen(false);
      setTf({...EMPTY_TF}); load();
    } catch(e){toast.error(e.message);} finally{setSaving(false);}
  }

  async function updateTx(){
    if(!editTx) return;
    setSaving(true);
    try{
      await paymentsApi.updateTransaction(studentId, editTx._id, {
        mode:editTx.mode, upiId:editTx.upiId, utrRef:editTx.utrRef,
        bankName:editTx.bankName, accountHolder:editTx.accountHolder,
        accountNumber:editTx.accountNumber, ifscCode:editTx.ifscCode,
        note:editTx.note, paidAt:editTx.paidAt
      });
      toast.success('Updated'); setEditTx(null); load();
    } catch(e){toast.error(e.message);} finally{setSaving(false);}
  }

  async function delTx(id){ if(!confirm('Delete?')) return; try{await paymentsApi.deleteTransaction(studentId,id); toast.success('Deleted'); load();} catch(e){toast.error(e.message);} }

  if(loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-300"/></div>;

  return (
    <div className="space-y-4">
      {data ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Total Fee',   fmt(data.totalFee),   'text-slate-700',   'bg-slate-50 border-slate-200'],
              ['Discount',    fmt(data.discount),    'text-amber-600',   'bg-amber-50 border-amber-200'],
              ['Net Fee',     fmt(data.netFee),      'text-indigo-600',  'bg-indigo-50 border-indigo-200'],
              ['Paid',        fmt(data.paidAmount),  'text-emerald-600', 'bg-emerald-50 border-emerald-200'],
            ].map(([l,v,vc,bg])=>(
              <div key={l} className={`rounded-xl border p-3 text-center ${bg}`}>
                <div className={`text-xl font-bold ${vc}`}>{v}</div>
                <div className="text-xs text-slate-400 font-medium mt-0.5">{l}</div>
              </div>
            ))}
          </div>

          <div className={`flex items-center justify-between rounded-xl border p-4 ${data.dueAmount>0?'border-amber-300 bg-amber-50':'border-emerald-200 bg-emerald-50'}`}>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Balance Due</span>
              <div className={`text-2xl font-bold mt-0.5 ${data.dueAmount>0?'text-amber-700':'text-emerald-700'}`}>{fmt(data.dueAmount)}</div>
            </div>
            <div className="flex gap-2">
              {canSetFee && <Button size="sm" variant="outline" onClick={()=>{setFf({totalFee:data.totalFee,discount:data.discount,notes:data.notes||''});setFeeOpen(true);}} className="border-slate-200 text-slate-600">Edit Fee</Button>}
              <Button size="sm" onClick={()=>setTxOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">
                <PlusCircle className="h-3.5 w-3.5 mr-1.5"/>Add Payment
              </Button>
            </div>
          </div>

          {!canSetFee && <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><AlertTriangle className="h-3.5 w-3.5 flex-shrink-0"/>Fee structure locked. Only Admin/Counselor can modify fees at this stage.</div>}
        </>
      ) : (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
          <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <IndianRupee className="h-6 w-6 text-slate-400"/>
          </div>
          <p className="text-sm font-medium text-slate-600 mb-1">No fee structure set up</p>
          <p className="text-xs text-slate-400 mb-4">Set up fees to track payments</p>
          {canSetFee ? <Button onClick={()=>{setFf({totalFee:'',discount:'',notes:''});setFeeOpen(true);}} className="bg-indigo-600 hover:bg-indigo-700">Set Up Fees</Button>
            : <p className="text-xs text-slate-400">Fee will be set during application submission.</p>}
        </div>
      )}

      {data?.transactions?.length>0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <History className="h-3.5 w-3.5"/>Payment History
          </h4>
          <div className="space-y-2">
            {[...data.transactions].reverse().map(tx=>(
              <div key={tx._id} className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm hover:shadow transition-shadow">
                <div className="flex-1 flex items-center gap-3 flex-wrap">
                  <span className="font-bold text-emerald-600 text-base">{fmt(tx.amount)}</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {tx.paidAt&&<span className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">{fmtDt(tx.paidAt)}</span>}
                  </div>
                  <PaymentDetail tx={tx} accMap={accMap}/>
                  {tx.verificationStatus==='pending_counselor'&&<span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium">⏳ Awaiting Counselor</span>}
                  {tx.verificationStatus==='pending_accountant'&&<span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 font-medium">⏳ With Accountant</span>}
                  {tx.verificationStatus==='verified'&&<span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-medium">✓ Verified</span>}
                  {tx.verificationStatus==='rejected'&&<span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 font-medium">✗ Rejected{tx.verificationNote?`: ${tx.verificationNote}`:''}</span>}
                </div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  {tx.verificationStatus === 'verified' ? (
                    <span className="text-slate-300" title="Verified — cannot edit">🔒</span>
                  ) : (
                    <>
                      <button onClick={()=>setEditTx({...tx,paidAt:tx.paidAt?new Date(tx.paidAt).toISOString().split('T')[0]:''})} className="text-slate-300 hover:text-indigo-500 transition-colors p-1" title="Edit"><Pencil className="h-3.5 w-3.5"/></button>
                      <button onClick={()=>delTx(tx._id)} className="text-slate-300 hover:text-red-500 transition-colors p-1" title="Delete"><Trash2 className="h-3.5 w-3.5"/></button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={feeOpen} onOpenChange={setFeeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-slate-800">Fee Structure</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs font-semibold text-slate-600">Total Fee (₹) *</Label><Input type="number" value={ff.totalFee} onChange={e=>setFf(p=>({...p,totalFee:e.target.value}))} className="mt-1 border-slate-200 h-10"/></div>
            <div><Label className="text-xs font-semibold text-slate-600">Discount (₹)</Label><Input type="number" value={ff.discount} onChange={e=>setFf(p=>({...p,discount:e.target.value}))} className="mt-1 border-slate-200 h-10"/></div>
            {ff.totalFee&&<div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-sm font-semibold text-emerald-700">Net: {fmt(Number(ff.totalFee)-Number(ff.discount||0))}</div>}
            <div><Label className="text-xs font-semibold text-slate-600">Notes</Label><Textarea rows={2} value={ff.notes} onChange={e=>setFf(p=>({...p,notes:e.target.value}))} className="mt-1 border-slate-200 resize-none"/></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setFeeOpen(false)} className="border-slate-200">Cancel</Button><Button onClick={saveFee} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">{saving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={txOpen} onOpenChange={setTxOpen}>
  <DialogContent className="max-w-lg flex flex-col max-h-[90vh]">
    <DialogHeader><DialogTitle className="text-slate-800">Record Payment</DialogTitle></DialogHeader>
    <div className="overflow-y-auto flex-1 pr-3 pl-2">
      <PaymentFields form={tf} setForm={setTf} showAmount={true} showDate={true}/>
    </div>
          <DialogFooter><Button variant="outline" onClick={()=>setTxOpen(false)} className="border-slate-200">Cancel</Button><Button onClick={addTx} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">{saving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Record</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTx} onOpenChange={()=>setEditTx(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-slate-800">Update Payment Details</DialogTitle></DialogHeader>
          {editTx && <PaymentFields form={editTx} setForm={setEditTx} showAmount={false} showDate={true}/>}
          <DialogFooter><Button variant="outline" onClick={()=>setEditTx(null)} className="border-slate-200">Cancel</Button><Button onClick={updateTx} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">{saving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Update</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── DOCS SECTION ─────────────────────────────────────────────
function DocsSection({ studentId, isEnrolled }) {
  const [docs,setDocs]=useState([]); const [loading,setLoading]=useState(true);
  const [addOpen,setAddOpen]=useState(false); const [payDoc,setPayDoc]=useState(null);
  const [editPay,setEditPay]=useState(null);
  const [saving,setSaving]=useState(false);
  const [accMap,setAccMap]=useState({});
  const fileRef=useRef();
  const EMPTY_PF = {amount:'',mode:'',upiId:'',utrRef:'',bankName:'',accountHolder:'',accountNumber:'',ifscCode:'',note:'',paidAt:'',paidToAccount:'',paidToAccountLabel:'',paymentScreenshot:null};
  const [df,setDf]=useState({name:'',type:'',chargeFee:'',note:'',payAmount:''});
  const [dfPay,setDfPay]=useState({...EMPTY_PF});
  const [docFile,setDocFile]=useState(null);

  useEffect(() => {
    paymentAccountsApi.list().then(accs => {
      const map = {};
      accs.forEach(a => { map[String(a._id)] = a; });
      setAccMap(map);
    }).catch(() => {});
  }, []);
  const [pf,setPf]=useState({...EMPTY_PF});

  const load=useCallback(async()=>{ try{setLoading(true);setDocs(await docsApi.list({studentId, all:'1'}));} catch{} finally{setLoading(false);} },[studentId]);
  useEffect(()=>{load();},[load]);

  async function addDoc(){
    if(!df.name.trim()) return toast.error('Document name required');
    setSaving(true);
    try{
      const fd=new FormData();
      fd.append('studentId',studentId); fd.append('name',df.name);
      fd.append('type',df.type); fd.append('note',df.note);
      fd.append('chargeFee',df.chargeFee||0);
      if(df.payAmount&&Number(df.payAmount)>0){
        fd.append('paymentAmount',df.payAmount);
        fd.append('paymentMode',dfPay.mode||'UPI');
        fd.append('paymentUpiId',dfPay.upiId||'');
        fd.append('paymentUtrRef',dfPay.utrRef||'');
        fd.append('paymentBankName',dfPay.bankName||'');
        fd.append('paymentAccountHolder',dfPay.accountHolder||'');
        fd.append('paymentAccountNumber',dfPay.accountNumber||'');
        fd.append('paymentIfscCode',dfPay.ifscCode||'');
        fd.append('paymentDate',dfPay.paidAt||'');
        fd.append('paymentPaidToAccount',dfPay.paidToAccount||'');
        fd.append('paymentPaidToAccountLabel',dfPay.paidToAccountLabel||'');
      }
      if(docFile) fd.append('file',docFile);
      await docsApi.create(fd);
      toast.success('Document request submitted'); setAddOpen(false);
      setDf({name:'',type:'',chargeFee:'',note:'',payAmount:''}); setDfPay({...EMPTY_PF});
      setDocFile(null); if(fileRef.current) fileRef.current.value='';
      load();
    } catch(e){toast.error(e.message);} finally{setSaving(false);}
  }

  async function addDocPay(){
    if(!pf.amount||Number(pf.amount)<=0) return toast.error('Enter valid amount');
    if(!pf.mode) return toast.error('Select payment mode');
    if(!pf.utrRef.trim()) return toast.error('UTR number is required');
    if(pf.mode==='UPI' && !pf.upiId.trim()) return toast.error('UPI ID is required');
    if(pf.mode==='Bank Transfer' && !pf.bankName.trim()) return toast.error('Bank name is required');
    if(pf.mode==='Bank Transfer' && !pf.accountHolder.trim()) return toast.error('Account holder name is required');
    if(!pf.paymentScreenshot) return toast.error('Payment screenshot is required');
    setSaving(true);
    try{
      const fd = new FormData();
      fd.append('amount', String(Number(pf.amount)));
      fd.append('mode', pf.mode||'');
      fd.append('upiId', pf.upiId||'');
      fd.append('utrRef', pf.utrRef||'');
      fd.append('bankName', pf.bankName||'');
      fd.append('accountHolder', pf.accountHolder||'');
      fd.append('accountNumber', pf.accountNumber||'');
      fd.append('ifscCode', pf.ifscCode||'');
      fd.append('note', pf.note||'');
      fd.append('paidAt', pf.paidAt||'');
      fd.append('paidToAccount', pf.paidToAccount||'');
      fd.append('paidToAccountLabel', pf.paidToAccountLabel||'');
      if(pf.paymentScreenshot instanceof File) fd.append('paymentScreenshot', pf.paymentScreenshot);
      const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('crm_token');
      const res = await fetch(`${BASE}/documents/${payDoc._id}/payments`, {
        method:'POST', headers:{ Authorization:`Bearer ${token}` }, body:fd
      });
      if(!res.ok){ const e=await res.json(); throw new Error(e.message||'Failed'); }
      toast.success('Payment recorded'); setPayDoc(null); load();
    } catch(e){toast.error(e.message);} finally{setSaving(false);}
  }

  async function updateDocPay(){
    if(!editPay) return;
    setSaving(true);
    try{
      await docsApi.updatePayment(editPay.docId, editPay.payment._id, {
  mode: editPay.payment.mode,
  upiId: editPay.payment.upiId,
  utrRef: editPay.payment.utrRef,
  bankName: editPay.payment.bankName,
  accountHolder: editPay.payment.accountHolder,
  accountNumber: editPay.payment.accountNumber,
  ifscCode: editPay.payment.ifscCode,
  note: editPay.payment.note,
  paidAt: editPay.payment.paidAt,

  // IMPORTANT
  paidToAccount: editPay.payment.paidToAccount,
  paidToAccountLabel: editPay.payment.paidToAccountLabel,
});
      toast.success('Payment updated'); setEditPay(null); load();
    } catch(e){toast.error(e.message);} finally{setSaving(false);}
  }

  async function requestDispatch(docId){
    try{
      await docsApi.requestDispatch(docId);
      toast.success('Dispatch requested! Counselor has been notified.');
      load();
    } catch(e){toast.error(e.message);}
  }

 async function handleConfirmDelivery(docId) {
  try {
    const result = await docsApi.confirmDelivery(docId);
    console.log('Confirm delivery response:', result);
    toast.success('Courier receipt confirmed! Counselor has been notified.');
    load();
  } catch(e) { 
    console.error('Confirm delivery error:', e);
    toast.error(e.message); 
  }
}

  if(loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-300"/></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{docs.length} document{docs.length!==1?'s':''}</p>
        {isEnrolled&&(
          <Button size="sm" onClick={()=>setAddOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 h-8 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1.5"/>Request Document
          </Button>
        )}
      </div>
      {!isEnrolled&&(
        <div className="flex items-center gap-2.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="h-4 w-4 flex-shrink-0"/>
          Document requests available after enrollment.
        </div>
      )}

      {docs.length===0?(
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
          <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <FileText className="h-6 w-6 text-slate-400"/>
          </div>
          <p className="text-sm font-medium text-slate-600">No documents yet</p>
          <p className="text-xs text-slate-400 mt-1">Documents requested here will be tracked through the system</p>
        </div>
      )
      :docs.map(d=>(
        <div key={d._id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-semibold text-sm text-slate-800">{d.name}</span>
                {d.type&&<span className="text-xs bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-md font-medium">{d.type}</span>}
                {d.chargeFee > 0 && d.totalPaid >= d.chargeFee
                  ? <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">✓ Paid</span>
                  : d.status === 'Center_Notified' && d.chargeFee > 0
                    ? <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-300 font-medium">⚡ Pay Required</span>
                    : <SBadge status={d.status} map={DOC_STATUS}/>
                }
              </div>
              {d.note&&<p className="text-xs text-slate-400 italic mb-1.5">{d.note}</p>}
              <div className="flex flex-wrap gap-2 mb-1">
                {d.fileUrl&&<a href={`${MEDIA}${d.fileUrl}`} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"><Download className="h-3 w-3"/>View file</a>}
                {d.scannedUrl && ['Center_Notified','Payment_Submitted','Payment_Verified','Dispatched','Delivered'].includes(d.status) && (
  <a href={`${MEDIA}${d.scannedUrl}`} target="_blank" rel="noreferrer" className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1 font-medium">
    <Download className="h-3 w-3"/>Scanned copy
  </a>
)}
              </div>
              {d.courierInfo?.trackingNo && ['Dispatched','Delivered'].includes(d.status) && (
  <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 flex items-center gap-2 w-fit mt-1">
    🚚 <span className="font-medium">{d.courierInfo.company}</span> · <span className="font-mono">{d.courierInfo.trackingNo}</span> · {fmtDt(d.courierInfo.dispatchDate)}
  </div>
)}
              {(d.chargeFee>0||d.totalPaid>0)&&(
                <div className="flex gap-4 text-xs mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-fit">
                  {d.chargeFee>0&&<span className="text-slate-500">Charge: <span className="font-bold text-slate-700">{fmt(d.chargeFee)}</span></span>}
                  {d.totalPaid>0&&<span className="text-emerald-600">Paid: <span className="font-bold">{fmt(d.totalPaid)}</span></span>}
                  {d.chargeFee>0&&d.totalPaid<d.chargeFee&&<span className="text-amber-600">Due: <span className="font-bold">{fmt(d.chargeFee-d.totalPaid)}</span></span>}
                  {d.chargeFee>0&&d.totalPaid>=d.chargeFee&&<span className="text-emerald-600 font-semibold">Fully Paid ✓</span>}
                </div>
              )}
              {d.payments?.length>0&&(
                <div className="mt-3 space-y-1.5">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Payments</p>
                  {d.payments?.map(p => (
  <div
    key={p._id}
    className="flex items-start justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3"
  >
    <div className="flex-1">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-bold text-emerald-600 text-base">
          {fmt(p.amount)}
        </span>

        {p.paidAt && (
          <span className="text-xs text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
            {fmtDt(p.paidAt)}
          </span>
        )}

        {p.verificationStatus === 'pending_counselor' && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium">
            ⏳ Awaiting Counselor
          </span>
        )}

        {p.verificationStatus === 'pending_accountant' && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 font-medium">
            ⏳ With Accountant
          </span>
        )}

        {p.verificationStatus === 'verified' && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-medium">
            ✓ Verified
          </span>
        )}

        {p.verificationStatus === 'rejected' && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 font-medium">
            ✗ Rejected
          </span>
        )}
      </div>

      {/* PAYMENT DETAILS */}
      <PaymentDetail tx={p} accMap={accMap} />
    </div>

    {p.verificationStatus !== 'verified' && (
      <button
        onClick={() =>
          setEditPay({
            docId: d._id,
            payment: {
              ...p,
              paidAt: p.paidAt
                ? new Date(p.paidAt).toISOString().split('T')[0]
                : '',
            },
          })
        }
        className="text-slate-300 hover:text-indigo-500 transition-colors p-1"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    )}
  </div>
))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              {d.chargeFee > 0 && d.totalPaid < d.chargeFee && (
                <Button size="sm" onClick={()=>{setPayDoc(d);setPf({...EMPTY_PF});}} className="bg-amber-500 hover:bg-amber-600 text-white text-xs h-8">
                  <CreditCard className="h-3.5 w-3.5 mr-1"/>Pay {fmt(d.chargeFee - d.totalPaid)}
                </Button>
              )}
              {d.status === 'Center_Notified' && (d.chargeFee <= 0 || d.totalPaid >= d.chargeFee) && (
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs h-8" onClick={()=>requestDispatch(d._id)}>
                  <Send className="h-3.5 w-3.5 mr-1"/>Request Dispatch
                </Button>
              )}
              {d.status === 'Dispatched' && (
  <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-xs h-8" onClick={()=>handleConfirmDelivery(d._id)}>
    <CheckCircle2 className="h-3.5 w-3.5 mr-1"/>Confirm Receipt
  </Button>
)}
{d.status === 'Delivered' && (
  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1">
    <CheckCircle2 className="h-3 w-3"/>Received
  </span>
)}
            </div>
          </div>
        </div>
      ))}

      {/* Add Doc Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-slate-800">Request Document</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs font-semibold text-slate-600">Document Name *</Label><Input value={df.name} onChange={e=>setDf(p=>({...p,name:e.target.value}))} placeholder="e.g. Migration Certificate Sem1" className="mt-1 border-slate-200 h-10"/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs font-semibold text-slate-600">Type</Label><Select value={df.type} onValueChange={v=>setDf(p=>({...p,type:v}))}><SelectTrigger className="mt-1 border-slate-200 h-10"><SelectValue placeholder="Select…"/></SelectTrigger><SelectContent>{['Identity','Academic','Medical','Financial','Other'].map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs font-semibold text-slate-600">Charge (₹)</Label><Input type="number" value={df.chargeFee} onChange={e=>setDf(p=>({...p,chargeFee:e.target.value}))} className="mt-1 border-slate-200 h-10"/></div>
            </div>
            {/* <div><Label className="text-xs font-semibold text-slate-600">Note</Label><Input value={df.note} onChange={e=>setDf(p=>({...p,note:e.target.value}))} className="mt-1 border-slate-200 h-10"/></div> */}
            {/* <div><Label className="text-xs font-semibold text-slate-600">Upload File (optional)</Label><input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e=>setDocFile(e.target.files[0])} className="block w-full text-sm mt-1 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-slate-100 file:text-slate-600 file:font-medium"/></div> */}
            {/* <div className="border-t border-slate-200 pt-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Payment Details (optional)</p>
              <div className="space-y-2">
                <div><Label className="text-xs font-semibold text-slate-600">Amount Paid (₹)</Label><Input type="number" value={df.payAmount} onChange={e=>setDf(p=>({...p,payAmount:e.target.value}))} placeholder="Leave blank if not paid yet" className="mt-1 border-slate-200 h-10"/></div>
                {df.payAmount&&Number(df.payAmount)>0&&(
                  <PaymentFields form={dfPay} setForm={setDfPay} showAmount={false} showDate={true}/>
                )}
              </div>
            </div> */}
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setAddOpen(false)} className="border-slate-200">Cancel</Button><Button onClick={addDoc} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">{saving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Submit Request</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payDoc} onOpenChange={()=>setPayDoc(null)}>
  <DialogContent className="max-w-md flex flex-col max-h-[90vh]">
    <DialogHeader><DialogTitle className="text-slate-800">Pay for: {payDoc?.name}</DialogTitle></DialogHeader>
    <div className="overflow-y-auto flex-1 pr-2 pl-2">
      {payDoc&&<div className="flex gap-4 text-sm mb-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5"><span className="text-slate-600">Charge: <span className="font-bold text-slate-800">{fmt(payDoc.chargeFee)}</span></span><span className="text-emerald-600">Paid: <span className="font-bold">{fmt(payDoc.totalPaid)}</span></span><span className="text-amber-600">Due: <span className="font-bold">{fmt(payDoc.chargeFee-payDoc.totalPaid)}</span></span></div>}
      <PaymentFields form={pf} setForm={setPf} showAmount={true} showDate={false}/>
      {/* Payment Screenshot */}
      <div className="mt-3">
        <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Payment Screenshot *</Label>
        <input
          type="file"
          accept="image/*,.pdf"
          onChange={e => setPf(p => ({ ...p, paymentScreenshot: e.target.files[0] || null }))}
          className="block w-full text-sm mt-1 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-indigo-50 file:text-indigo-600 file:font-medium hover:file:bg-indigo-100 cursor-pointer"
        />
        {pf.paymentScreenshot && (
          <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
            ✓ {pf.paymentScreenshot.name}
          </p>
        )}
      </div>
    </div>
          <DialogFooter><Button variant="outline" onClick={()=>setPayDoc(null)} className="border-slate-200">Cancel</Button><Button onClick={addDocPay} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">{saving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Submit Payment</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editPay} onOpenChange={()=>setEditPay(null)}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle className="text-slate-800">
        Update Payment
      </DialogTitle>
    </DialogHeader>

    {editPay && (
      <div>
        <PaymentFields
          form={editPay.payment}
          setForm={(cb) =>
            setEditPay((prev) => ({
              ...prev,
              payment:
                typeof cb === 'function'
                  ? cb(prev.payment)
                  : cb,
            }))
          }
          showAmount={false}
          showDate={true}
        />
      </div>
    )}

    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => setEditPay(null)}
        className="border-slate-200"
      >
        Cancel
      </Button>

      <Button
        onClick={updateDocPay}
        disabled={saving}
        className="bg-indigo-600 hover:bg-indigo-700"
      >
        {saving && (
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        )}
        Update
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
    </div>
  );
}

// ── PAYMENTS SECTION ─────────────────────────────────────────
function PaymentsSection({ studentId }) {
  const [data,setData]=useState(null); const [docs,setDocs]=useState([]); const [loading,setLoading]=useState(true);
  const [accMap,setAccMap]=useState({});
  useEffect(()=>{
    (async()=>{ try{setLoading(true); const [p,d,accs]=await Promise.all([paymentsApi.get(studentId),docsApi.list({studentId}),paymentAccountsApi.list().catch(()=>[])]); setData(p);setDocs(d); const m={}; accs.forEach(a=>{m[String(a._id)]=a;}); setAccMap(m);} finally{setLoading(false);} })();
  },[studentId]);

  if(loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-300"/></div>;

  const all=[];
  data?.transactions?.forEach(t=>all.push({...t,source:'Fee'}));
  docs.forEach(d=>d.payments?.forEach(p=>all.push({...p,source:`Doc: ${d.name}`})));
  all.sort((a,b)=>new Date(b.paidAt||b.createdAt)-new Date(a.paidAt||a.createdAt));
  const total=all.reduce((s,p)=>s+(p.amount||0),0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <div>
          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Total Payments</p>
          <p className="text-xs text-slate-400 mt-0.5">{all.length} transaction{all.length!==1?'s':''}</p>
        </div>
        <span className="text-2xl font-bold text-emerald-700">{fmt(total)}</span>
      </div>
      {all.length===0?(
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
          <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <CreditCard className="h-6 w-6 text-slate-400"/>
          </div>
          <p className="text-sm font-medium text-slate-600">No payments yet</p>
        </div>
      )
      :all.map((p,i)=>(
        <div key={p._id||i} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-bold text-emerald-600 text-base">{fmt(p.amount)}</span>
              <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full font-medium">{p.source}</span>
            </div>
            <span className="text-xs text-slate-400 whitespace-nowrap bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">{fmtDt(p.paidAt||p.createdAt)}</span>
          </div>
          <PaymentDetail tx={p} accMap={accMap}/>
        </div>
      ))}
    </div>
  );
}

// ── STUDENT DETAIL ───────────────────────────────────────────
function StudentDetail({ student, onBack, onRefresh }) {
  const [s,setS]         = useState(student);
  const [editOpen,setEditOpen] = useState(false);
  const [editTab,setEditTab]   = useState('details');
  const [form,setForm]   = useState({});
  const [saving,setSaving] = useState(false);
  const [submitOpen,setSubmitOpen] = useState(false);

  const [feeData,setFeeData] = useState(null);
  const [feeSaving,setFeeSaving] = useState(false);
  const [feeForm,setFeeForm] = useState({totalFee:'',discount:'',notes:''});

  const [editDocs,setEditDocs] = useState([]);
  const [customDoc,setCustomDoc] = useState('');
  const [docsSaving,setDocsSaving] = useState(false);
  const fileRefs = useRef([]);
  const [universities, setUniversities] = useState([]);
  useEffect(() => {
    const centerId = student?.center?._id || student?.center;
    if (centerId) {
      centersApi.getOne(centerId)
        .then(center => {
          const allowed = center?.allowedUniversities || [];
          if (allowed.length > 0) setUniversities(allowed);
          else universitiesApi.getAll().then(setUniversities).catch(()=>{});
        })
        .catch(() => { universitiesApi.getAll().then(setUniversities).catch(()=>{}); });
    } else {
      universitiesApi.getAll().then(setUniversities).catch(()=>{});
    }
  }, [student?.center]);

  function startEdit(tab='details'){
    setForm({name:s.name,phone:s.phone||'',email:s.email||'',fatherName:s.fatherName||'',
      motherName:s.motherName||'',courseName:s.courseName||'',courseYear:s.courseYear||'',
      address:s.address||'',gender:s.gender||'',dob:s.dob?s.dob.split('T')[0]:'',
      aadharNumber:s.aadharNumber||'',age:s.age||'',
      tenth_percent:s.tenth_percent||'',tenth_year:s.tenth_year||'',tenth_board:s.tenth_board||'',
      twelfth_percent:s.twelfth_percent||'',twelfth_year:s.twelfth_year||'',twelfth_board:s.twelfth_board||'',
      universityId: s.university?._id || s.university || '',
    });
    paymentsApi.get(s._id).then(p=>{
      if(p) setFeeForm({totalFee:p.totalFee||'',discount:p.discount||'',notes:p.notes||''});
      setFeeData(p);
    }).catch(()=>{});
    const existing = s.submissionDocs||[];
    if (existing.length > 0) {
      const savedNames = existing.map(d=>d.name);
      const missing = DEFAULT_DOCS.filter(n=>!savedNames.includes(n));
      setEditDocs([
        ...existing.map(d=>({name:d.name,fileUrl:d.fileUrl||'',file:null,checked:true})),
        ...missing.map(n=>({name:n,fileUrl:'',file:null,checked:false})),
      ]);
    } else {
      setEditDocs(DEFAULT_DOCS.map(n=>({name:n,fileUrl:'',file:null,checked:true})));
    }
    setEditTab(tab);
    setEditOpen(true);
  }

  async function saveDetails(){
    setSaving(true);
    try{
      const u = await studentsApi.update(s._id, form);
      setS(u);
      toast.success('Details updated');
      onRefresh();
    }
    catch(e){toast.error(e.message);} finally{setSaving(false);}
  }

  async function saveFee(){
    if(!feeForm.totalFee) return toast.error('Total fee required');
    setFeeSaving(true);
    try{
      await paymentsApi.upsertFee(s._id,{totalFee:Number(feeForm.totalFee),discount:Number(feeForm.discount)||0,notes:feeForm.notes});
      toast.success('Fee updated');
    } catch(e){toast.error(e.message);} finally{setFeeSaving(false);}
  }

  async function saveDocs(){
    setDocsSaving(true);
    try{
      const BASE=import.meta.env.VITE_API_URL||'http://localhost:5000/api';
      const token=localStorage.getItem('crm_token');
      const fd=new FormData();
      const checked=editDocs.filter(d=>d.checked&&d.name.trim());
      fd.append('submissionDocs',JSON.stringify(checked.map(d=>({name:d.name,fileUrl:d.fileUrl||''}))));
      checked.forEach((d,i)=>{ if(d.file) fd.append(`submissionFile_${i}`,d.file); });
      fd.append('submissionDocCount', String(checked.length));
      const res=await fetch(`${BASE}/students/${s._id}`,{method:'PUT',headers:{Authorization:`Bearer ${token}`},body:fd});
      if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error||'Failed');}
      const updated=await res.json();
      setS(updated);
      toast.success('Documents saved!');
      onRefresh();
    } catch(e){toast.error(e.message);} finally{setDocsSaving(false);}
  }

  async function submitApp(){
    const uniId = s.university?._id || s.university || form.universityId || '';
    if (!uniId) {
      toast.error('Please select a university in Edit → Details before submitting');
      setSubmitOpen(false);
      return;
    }
    setSaving(true);
    try{
      await studentsApi.submit(s._id, { universityId: uniId });
      setS(p=>({...p,applicationStatus:'Submitted'}));
      toast.success('Application submitted to counselor!');
      setSubmitOpen(false); onRefresh();
    } catch(e){toast.error(e.message);} finally{setSaving(false);}
  }

  const canEdit=!s.coreLocked;
  const canSubmit=['Draft','Changes_Requested'].includes(s.applicationStatus);
  const st=APP_STATUS[s.applicationStatus]||{label:s.applicationStatus,color:'bg-slate-100 text-slate-600'};

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-500 hover:text-slate-800 hover:bg-slate-100 -ml-2">
          <ArrowLeft className="h-4 w-4 mr-1"/>Back
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl font-bold text-slate-800">{s.name}</h2>
            {s.coreLocked&&<span className="text-xs text-slate-400 flex items-center gap-1">🔒 Core locked</span>}
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${st.color}`}>{st.label}</span>
            {s.enrollmentNumber&&(
              <span className="text-xs text-emerald-700 font-bold font-mono bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                {s.enrollmentNumber}
              </span>
            )}
          </div>
          <div className="flex gap-4 text-xs text-slate-400 mt-0.5">
            {s.phone&&<span className="flex items-center gap-1"><Phone className="h-3 w-3"/>{s.phone}</span>}
            {s.email&&<span className="flex items-center gap-1"><Mail className="h-3 w-3"/>{s.email}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit&&<Button variant="outline" size="sm" onClick={()=>startEdit('details')} className="border-slate-200 text-slate-600 h-8 text-xs"><Edit2 className="h-3.5 w-3.5 mr-1.5"/>Edit</Button>}
          {canSubmit&&<Button size="sm" onClick={()=>setSubmitOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 h-8 text-xs"><Send className="h-3.5 w-3.5 mr-1.5"/>Submit</Button>}
        </div>
      </div>

      {s.applicationStatus==='Changes_Requested'&&s.changesRequested&&(
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-500"/><div><b className="font-semibold">Changes Requested:</b> {s.changesRequested}</div>
        </div>
      )}
      {s.applicationStatus==='Rejected'&&s.rejectionReason&&(
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700"><b className="font-semibold">Rejected:</b> {s.rejectionReason}</div>
      )}
      {s.applicationStatus==='University_Rejected'&&(
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-700">
          <b className="font-semibold">Rejected by University</b>{s.rejectionReason ? `: ${s.rejectionReason}` : ''}
        </div>
      )}
      {s.applicationStatus==='Rejected' && s.amountSettled && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
          <span className="text-lg">✅</span>
          <div>
            <b className="font-semibold">Amount Settled</b>
            <span className="text-xs text-emerald-600 ml-2">Refund/adjustment has been processed by accountant</span>
          </div>
        </div>
      )}

      {/* Student Info Card */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between border-b border-slate-200">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <User className="h-3.5 w-3.5"/>Personal Information
          </p>
          {canEdit&&<button onClick={()=>startEdit('details')} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"><Edit2 className="h-3 w-3"/>Edit</button>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-y border-t border-slate-100">
          {[
            ['Full Name',    s.name],
            ['Phone',        s.phone],
            ['Email',        s.email],
            ['Father Name',  s.fatherName],
            ['Mother Name',  s.motherName],
            ['Date of Birth',s.dob ? new Date(s.dob).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : null],
            ['Gender',       s.gender],
            ['Aadhaar',      s.aadharNumber],
            ['Address',      s.address],
          ].filter(([,v])=>v).map(([l,v])=>(
            <div key={l} className="px-4 py-3">
              <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">{l}</div>
              <div className="text-sm font-semibold text-slate-800 mt-0.5 break-words">{v}</div>
            </div>
          ))}
        </div>

        <div className="bg-slate-50 px-4 py-2.5 border-t border-b border-slate-200">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <GraduationCap className="h-3.5 w-3.5"/>Academic & Course Details
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-y border-t border-slate-100">
          {[
            ['Course',       s.courseName],
            ['Year / Batch', s.courseYear],
            ['University',   s.university?.name || s.universityName],
            ['10th %',       s.tenth_percent  ? `${s.tenth_percent}%`  : null],
            ['10th Year',    s.tenth_year     || null],
            ['10th Board',   s.tenth_board    || null],
            ['12th %',       s.twelfth_percent ? `${s.twelfth_percent}%` : null],
            ['12th Year',    s.twelfth_year   || null],
            ['12th Board',   s.twelfth_board  || null],
          ].filter(([,v])=>v).map(([l,v])=>(
            <div key={l} className="px-4 py-3">
              <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">{l}</div>
              <div className="text-sm font-semibold text-slate-800 mt-0.5 break-words">{v}</div>
            </div>
          ))}
        </div>

        {s.enrollmentNumber&&(
          <div className="border-t border-slate-200 px-4 py-3 bg-emerald-50 flex items-center justify-between">
            <div>
              <div className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Enrollment Number</div>
              <div className="text-lg font-mono font-bold text-emerald-700 mt-0.5">{s.enrollmentNumber}</div>
            </div>
            <CheckCircle2 className="h-8 w-8 text-emerald-300"/>
          </div>
        )}
      </div>

      {/* Submission docs */}
      {s.submissionDocs?.length>0&&(
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5"/>Submitted Documents ({s.submissionDocs.length})
            </p>
            {canEdit&&<button onClick={()=>startEdit('docs')} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"><Edit2 className="h-3 w-3"/>Edit</button>}
          </div>
          <div className="p-4 flex flex-wrap gap-2">
            {s.submissionDocs.map((d,i)=>(
              <span key={i} className="text-xs flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5 font-medium text-slate-700">
                <Paperclip className="h-3 w-3 text-slate-400"/>
                {d.fileUrl
                  ?<a href={`${MEDIA}${d.fileUrl}`} target="_blank" rel="noreferrer" className="text-indigo-600 underline flex items-center gap-1"><Download className="h-3 w-3"/>{d.name}</a>
                  :<span>{d.name}</span>
                }
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="fees">
        <TabsList className="w-full bg-slate-100 p-1 rounded-xl h-auto">
          <TabsTrigger value="fees" className="flex-1 rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm py-2">
            <IndianRupee className="h-3.5 w-3.5 mr-1.5"/>Fees
          </TabsTrigger>
          <TabsTrigger value="docs" className="flex-1 rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm py-2">
            <FileText className="h-3.5 w-3.5 mr-1.5"/>Documents
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex-1 rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm py-2">
            <CreditCard className="h-3.5 w-3.5 mr-1.5"/>Payments
          </TabsTrigger>
        </TabsList>
        <TabsContent value="fees" className="mt-4"><FeeSection studentId={s._id} appStatus={s.applicationStatus}/></TabsContent>
        <TabsContent value="docs" className="mt-4">
          {s.submissionDocs?.length>0&&(
            <div className="mb-4 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5"/>Submitted Documents ({s.submissionDocs.length})
                </p>
              </div>
              <div className="p-4 flex flex-wrap gap-2">
                {s.submissionDocs.map((d,i)=>(
                  <span key={i} className="text-xs flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full px-3 py-1.5 font-semibold">
                    <CheckCircle2 className="h-3 w-3"/>
                    {d.fileUrl
                      ? <a href={`${MEDIA}${d.fileUrl}`} target="_blank" rel="noreferrer" className="underline">{d.name}</a>
                      : <span>{d.name}</span>
                    }
                  </span>
                ))}
              </div>
            </div>
          )}
          <DocsSection studentId={s._id} isEnrolled={s.applicationStatus==='Enrolled'}/>
        </TabsContent>
        <TabsContent value="payments" className="mt-4"><PaymentsSection studentId={s._id}/></TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800"><Edit2 className="h-4 w-4"/>Edit Student</DialogTitle>
          </DialogHeader>

          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {[['details','Student Details',User],['fee','Fee',IndianRupee],['docs','Documents',FileText]].map(([key,label,Icon])=>(
              <button key={key} type="button" onClick={()=>setEditTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 text-sm py-2 rounded-lg font-semibold transition-all ${
                  editTab===key ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <Icon className="h-3.5 w-3.5"/>{label}
              </button>
            ))}
          </div>

          {editTab==='details'&&(
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Personal Information</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><Label className="text-xs font-semibold text-slate-600">Full Name *</Label><Input value={form.name||''} onChange={e=>setForm(p=>({...p,name:e.target.value.toUpperCase()}))} className="mt-1 border-slate-200 h-10"/></div>
                  <div><Label className="text-xs font-semibold text-slate-600">Father's Name</Label><Input value={form.fatherName||''} onChange={e=>setForm(p=>({...p,fatherName:e.target.value.toUpperCase()}))} className="mt-1 border-slate-200 h-10"/></div>
                  <div><Label className="text-xs font-semibold text-slate-600">Mother's Name</Label><Input value={form.motherName||''} onChange={e=>setForm(p=>({...p,motherName:e.target.value.toUpperCase()}))} className="mt-1 border-slate-200 h-10"/></div>
                  <div><Label className="text-xs font-semibold text-slate-600">Date of Birth</Label><Input type="date" value={form.dob?form.dob.split('T')[0]:''} onChange={e=>setForm(p=>({...p,dob:e.target.value}))} className="mt-1 border-slate-200 h-10"/></div>
                  <div><Label className="text-xs font-semibold text-slate-600">Age</Label><Input type="number" value={form.age||''} onChange={e=>setForm(p=>({...p,age:e.target.value}))} className="mt-1 border-slate-200 h-10"/></div>
                  <div><Label className="text-xs font-semibold text-slate-600">Gender</Label>
                    <Select value={form.gender||''} onValueChange={v=>setForm(p=>({...p,gender:v}))}>
                      <SelectTrigger className="mt-1 border-slate-200 h-10"><SelectValue placeholder="Select…"/></SelectTrigger>
                      <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs font-semibold text-slate-600">Phone</Label><Input value={form.phone||''} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} className="mt-1 border-slate-200 h-10"/></div>
                  <div><Label className="text-xs font-semibold text-slate-600">Email</Label><Input value={form.email||''} onChange={e=>setForm(p=>({...p,email:e.target.value}))} className="mt-1 border-slate-200 h-10"/></div>
                  <div><Label className="text-xs font-semibold text-slate-600">Aadhaar No.</Label><Input value={form.aadharNumber||''} onChange={e=>setForm(p=>({...p,aadharNumber:e.target.value.toUpperCase()}))} className="mt-1 border-slate-200 h-10 font-mono"/></div>
                  <div className="col-span-2"><Label className="text-xs font-semibold text-slate-600">Address</Label><Input value={form.address||''} onChange={e=>setForm(p=>({...p,address:e.target.value.toUpperCase()}))} className="mt-1 border-slate-200 h-10"/></div>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Academic Information</p>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label className="text-xs font-semibold text-slate-600">10th %</Label><Input value={form.tenth_percent||''} onChange={e=>setForm(p=>({...p,tenth_percent:e.target.value.toUpperCase()}))} className="mt-1 border-slate-200 h-10"/></div>
                  <div><Label className="text-xs font-semibold text-slate-600">10th Year</Label><Input value={form.tenth_year||''} onChange={e=>setForm(p=>({...p,tenth_year:e.target.value.toUpperCase()}))} className="mt-1 border-slate-200 h-10"/></div>
                  <div><Label className="text-xs font-semibold text-slate-600">10th Board</Label><Input value={form.tenth_board||''} onChange={e=>setForm(p=>({...p,tenth_board:e.target.value.toUpperCase()}))} className="mt-1 border-slate-200 h-10"/></div>
                  <div><Label className="text-xs font-semibold text-slate-600">12th %</Label><Input value={form.twelfth_percent||''} onChange={e=>setForm(p=>({...p,twelfth_percent:e.target.value.toUpperCase()}))} className="mt-1 border-slate-200 h-10"/></div>
                  <div><Label className="text-xs font-semibold text-slate-600">12th Year</Label><Input value={form.twelfth_year||''} onChange={e=>setForm(p=>({...p,twelfth_year:e.target.value.toUpperCase()}))} className="mt-1 border-slate-200 h-10"/></div>
                  <div><Label className="text-xs font-semibold text-slate-600">12th Board</Label><Input value={form.twelfth_board||''} onChange={e=>setForm(p=>({...p,twelfth_board:e.target.value.toUpperCase()}))} className="mt-1 border-slate-200 h-10"/></div>
                  <div className="col-span-2"><Label className="text-xs font-semibold text-slate-600">Course Name</Label><Input value={form.courseName||''} onChange={e=>setForm(p=>({...p,courseName:e.target.value.toUpperCase()}))} className="mt-1 border-slate-200 h-10"/></div>
                  <div><Label className="text-xs font-semibold text-slate-600">Session</Label><Input value={form.courseYear||''} onChange={e=>setForm(p=>({...p,courseYear:e.target.value.toUpperCase()}))} className="mt-1 border-slate-200 h-10"/></div>
                  <div className="col-span-3">
                    <Label className="text-xs font-semibold text-slate-600">University</Label>
                    <Select value={form.universityId||''} onValueChange={v=>setForm(p=>({...p,universityId:v}))}>
                      <SelectTrigger className="mt-1 border-slate-200 h-10"><SelectValue placeholder="Select university…"/></SelectTrigger>
                      <SelectContent>{universities.map(u=>(<SelectItem key={u._id} value={u._id}>{u.name}{u.shortName?` (${u.shortName})`:''}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={()=>setEditOpen(false)} className="border-slate-200">Cancel</Button>
                <Button onClick={saveDetails} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">{saving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Save Details</Button>
              </DialogFooter>
            </div>
          )}

          {editTab==='fee'&&(
            <div className="space-y-4">
              {(['Draft','Changes_Requested'].includes(s.applicationStatus))?(<>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-xs font-semibold text-slate-600">Total Fee (₹) *</Label><Input type="number" value={feeForm.totalFee} onChange={e=>setFeeForm(p=>({...p,totalFee:e.target.value}))} placeholder="e.g. 50000" className="text-lg font-bold mt-1 h-12 border-slate-200"/></div>
                  <div><Label className="text-xs font-semibold text-slate-600">Discount (₹)</Label><Input type="number" value={feeForm.discount} onChange={e=>setFeeForm(p=>({...p,discount:e.target.value}))} placeholder="0" className="text-lg font-bold mt-1 h-12 border-slate-200"/></div>
                </div>
                {feeForm.totalFee&&(
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-slate-50 rounded-lg py-2 border border-slate-200"><div className="text-xs text-slate-400">Total</div><div className="font-bold text-slate-700">{fmt(Number(feeForm.totalFee))}</div></div>
                    <div className="bg-amber-50 rounded-lg py-2 border border-amber-200"><div className="text-xs text-amber-500">Discount</div><div className="font-bold text-amber-600">- {fmt(Number(feeForm.discount||0))}</div></div>
                    <div className="bg-emerald-50 rounded-lg py-2 border border-emerald-200"><div className="text-xs text-emerald-600">Net</div><div className="font-bold text-emerald-700">{fmt(Number(feeForm.totalFee)-Number(feeForm.discount||0))}</div></div>
                  </div>
                )}
                <div><Label className="text-xs font-semibold text-slate-600">Notes</Label><Textarea rows={2} value={feeForm.notes} onChange={e=>setFeeForm(p=>({...p,notes:e.target.value}))} placeholder="Payment terms, installments…" className="mt-1 border-slate-200 resize-none"/></div>
                <DialogFooter>
                  <Button variant="outline" onClick={()=>setEditOpen(false)} className="border-slate-200">Cancel</Button>
                  <Button onClick={saveFee} disabled={feeSaving} className="bg-indigo-600 hover:bg-indigo-700">{feeSaving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Save Fee</Button>
                </DialogFooter>
              </>):(
                <div className="flex items-start gap-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5"/>
                  Fee structure is locked after submission. Contact Admin/Counselor to modify.
                </div>
              )}
            </div>
          )}

          {editTab==='docs'&&(
            <div className="space-y-3">
              <p className="text-xs text-slate-400">Tick documents that are available. Upload files if ready. Untick to remove.</p>
              <div className="border border-slate-200 rounded-xl divide-y overflow-hidden">
                {editDocs.map((doc,i)=>(
                  <div key={i} className={`flex items-center gap-3 px-4 py-3 transition-colors ${doc.checked?'bg-white':'bg-slate-50'}`}>
                    <input type="checkbox" checked={doc.checked}
                      onChange={()=>setEditDocs(p=>p.map((d,j)=>j===i?{...d,checked:!d.checked}:d))}
                      className="h-4 w-4 rounded accent-emerald-600 flex-shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium ${!doc.checked?'line-through text-slate-400':'text-slate-700'}`}>{doc.name}</span>
                      {doc.fileUrl&&<div className="text-xs mt-0.5"><a href={`${MEDIA}${doc.fileUrl}`} target="_blank" rel="noreferrer" className="text-indigo-600 underline flex items-center gap-1 w-fit"><Download className="h-3 w-3"/>View uploaded file</a></div>}
                    </div>
                    {doc.checked&&(
                      <input type="file" ref={el=>fileRefs.current[i]=el} accept=".pdf,.jpg,.jpeg,.png"
                        onChange={e=>setEditDocs(p=>p.map((d,j)=>j===i?{...d,file:e.target.files[0]}:d))}
                        className="text-xs w-28 file:text-xs file:bg-slate-100 file:border-0 file:rounded file:px-2 file:py-1 flex-shrink-0"/>
                    )}
                    <button onClick={()=>setEditDocs(p=>p.filter((_,j)=>j!==i))} className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
                      <Trash2 className="h-3.5 w-3.5"/>
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={customDoc} onChange={e=>setCustomDoc(e.target.value)}
                  placeholder="Add new document name…" className="flex-1 text-sm border-slate-200"
                  onKeyDown={e=>{if(e.key==='Enter'&&customDoc.trim()){setEditDocs(p=>[...p,{name:customDoc.trim(),fileUrl:'',file:null,checked:true}]);setCustomDoc('');}}}/>
                <Button size="sm" variant="outline" onClick={()=>{if(customDoc.trim()){setEditDocs(p=>[...p,{name:customDoc.trim(),fileUrl:'',file:null,checked:true}]);setCustomDoc('');}}}
                  className="border-slate-200 text-slate-600">
                  <Plus className="h-3.5 w-3.5 mr-1"/>Add
                </Button>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={()=>setEditOpen(false)} className="border-slate-200">Cancel</Button>
                <Button onClick={saveDocs} disabled={docsSaving} className="bg-indigo-600 hover:bg-indigo-700">{docsSaving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Save Documents</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Submit Dialog */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-slate-800"><Send className="h-4 w-4 text-indigo-600"/>Submit to Counselor</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">Review the details below before submitting for counselor review.</p>

          {!s.university && (
            <div className="border border-amber-300 rounded-xl p-4 text-sm text-amber-800 bg-amber-50 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-500"/>
              <div>
                <p className="font-semibold">University not selected</p>
                <p className="text-xs mt-0.5">Please go to <strong>Edit → Details</strong>, select a university, and save before submitting.</p>
              </div>
            </div>
          )}

          <div className="border border-slate-200 rounded-xl p-4 space-y-1.5 text-sm bg-slate-50">
            <p className="font-bold text-slate-800">{s.name}</p>
            {s.fatherName&&<p className="text-slate-500 text-xs">Father: {s.fatherName}</p>}
            {s.phone&&<p className="text-slate-500 text-xs">{s.phone}</p>}
            {s.courseName&&<p className="text-slate-500 text-xs">Course: {s.courseName} {s.courseYear}</p>}
            {s.university
              ? <p className="text-xs font-semibold text-emerald-700">🎓 {s.university?.name||s.university}</p>
              : <p className="text-xs text-amber-600">🎓 University: Not selected</p>
            }
            {(s.tenth_percent||s.twelfth_percent)&&<p className="text-slate-400 text-xs">{s.tenth_percent&&`10th: ${s.tenth_percent}%`} {s.twelfth_percent&&`· 12th: ${s.twelfth_percent}%`}</p>}
          </div>

          {s.submissionDocs?.length>0&&(
            <div className="border border-slate-200 rounded-xl p-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5"/>Documents ({s.submissionDocs.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {s.submissionDocs.map((d,i)=>(
                  <span key={i} className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full px-2.5 py-1 flex items-center gap-1 font-medium">
                    <CheckCircle2 className="h-3 w-3"/>{d.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="border border-blue-200 rounded-xl p-3.5 text-xs text-blue-700 bg-blue-50 space-y-1.5">
            <p className="font-bold text-blue-800">ℹ After submission:</p>
            <p>• Application will go to Counselor for review</p>
            <p>• You cannot edit student details until counselor responds</p>
            <p>• Fee payments can be added anytime from the Fees tab</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setSubmitOpen(false)} className="border-slate-200">Cancel</Button>
            <Button onClick={submitApp} disabled={saving || !(s.university?._id || s.university || form.universityId)} className="bg-indigo-600 hover:bg-indigo-700">
              {saving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}
              <Send className="h-4 w-4 mr-1.5"/>Confirm & Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── MAIN PAGE ────────────────────────────────────────────────
export default function CenterPortalPage() {
  const {user}=useAuth(); const centerId=user?.centerId;
  const [students,setStudents]=useState([]); const [centerInfo,setCenterInfo]=useState(null);
  const [defCounselor,setDef]=useState(null); const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState(''); const [selected,setSelected]=useState(null);
  const [addOpen,setAddOpen]=useState(false);

  // ── Change Own Password ──────────────────────────────────
  const [pwdOpen, setPwdOpen]         = useState(false);
  const [pwdSaving, setPwdSaving]     = useState(false);
  const [pwdForm, setPwdForm]         = useState({ current: '', newPwd: '', confirm: '' });

  async function handleChangePassword() {
    if (!pwdForm.current) return toast.error('Please enter your current password');
    if (pwdForm.newPwd.length < 6) return toast.error('New password must be at least 6 characters');
    if (pwdForm.newPwd !== pwdForm.confirm) return toast.error('Passwords do not match');
    try {
      setPwdSaving(true);
      await authApi.changeOwnPassword(pwdForm.current, pwdForm.newPwd);
      toast.success('Password changed successfully!');
      setPwdOpen(false);
      setPwdForm({ current: '', newPwd: '', confirm: '' });
    } catch(e) { toast.error(e.message || 'Failed to change password'); }
    finally { setPwdSaving(false); }
  }

  const loadAll=useCallback(async()=>{
    try{
      setLoading(true);
      const [studs,center,counselors]=await Promise.all([studentsApi.getAll(),centerId?centersApi.getOne(centerId):Promise.resolve(null),counselorsApi.getAll()]);
      setStudents(studs);setCenterInfo(center);
      const linked=counselors.find(c=>c.centers?.some(cx=>String(cx._id||cx)===String(centerId)));
      setDef(linked?._id||counselors[0]?._id);
    } catch{toast.error('Problem loading data');} finally{setLoading(false);}
  },[centerId]);
  useEffect(()=>{loadAll();},[loadAll]);

  const filtered=students.filter(s=>s.name?.toLowerCase().includes(search.toLowerCase())||s.phone?.includes(search)||s.email?.toLowerCase().includes(search.toLowerCase()));

  if(loading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mx-auto mb-2"/>
        <p className="text-sm text-slate-400">Loading portal…</p>
      </div>
    </div>
  );
  if(selected) return <StudentDetail student={selected} onBack={()=>setSelected(null)} onRefresh={loadAll}/>;

  const statusCounts=students.reduce((acc,s)=>{acc[s.applicationStatus]=(acc[s.applicationStatus]||0)+1;return acc;},{});

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{centerInfo?.name||'Center Portal'}</h1>
          {(centerInfo?.city||centerInfo?.state) && (
            <p className="text-sm text-slate-400 mt-0.5 flex items-center gap-1">
              <span className="text-slate-300">📍</span>
              {centerInfo.city}{centerInfo.state?`, ${centerInfo.state}`:''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={()=>setPwdOpen(true)} className="border-slate-200 text-slate-600 hover:bg-slate-50">
            <KeyRound className="h-4 w-4 mr-1.5"/>Change Password
          </Button>
          <Button onClick={()=>setAddOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-200">
            <Plus className="h-4 w-4 mr-1.5"/>Add Student
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:'Total Students', value: students.length, color:'text-slate-800', bg:'bg-white border-slate-200', dot:'' },
          { label:'Action Needed',  value: (statusCounts['Submitted']||0)+(statusCounts['Changes_Requested']||0), color:'text-amber-600', bg:'bg-amber-50 border-amber-200', dot:'bg-amber-400' },
          { label:'In Process',     value: (statusCounts['Counselor_Approved']||0)+(statusCounts['Accountant_Pending']||0)+(statusCounts['Accountant_Rejected']||0)+(statusCounts['Sent_To_University']||0)+(statusCounts['University_Rejected']||0), color:'text-slate-600', bg:'bg-slate-50 border-slate-200', dot:'bg-slate-400' },
          { label:'Enrolled',       value: statusCounts['Enrolled']||0, color:'text-emerald-600', bg:'bg-emerald-50 border-emerald-200', dot:'bg-emerald-400' },
          { label:'Rejected',       value: statusCounts['Rejected']||0, color:'text-red-500', bg:'bg-red-50 border-red-200', dot:'bg-red-400' },
        ].map(({ label, value, color, bg, dot })=>(
          <div key={label} className={`rounded-xl border p-4 ${bg}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-slate-400 font-medium mt-0.5">{label}</div>
              </div>
              {dot && <div className={`h-2 w-2 rounded-full ${dot} mt-1`}/>}
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"/>
        <Input className="pl-10 border-slate-200 bg-white h-10 text-sm placeholder:text-slate-400 focus:border-indigo-300 focus:ring-indigo-100"
          placeholder="Search by name, phone or email…" value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>

      {/* Student List */}
      {filtered.length===0?(
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl">
          <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="h-7 w-7 text-slate-400"/>
          </div>
          <p className="text-sm font-semibold text-slate-600">
            {students.length===0 ? 'No students yet' : 'No results found'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {students.length===0 ? 'Click Add Student to get started' : `No match for "${search}"`}
          </p>
          {students.length===0 && (
            <Button className="mt-4 bg-indigo-600 hover:bg-indigo-700" onClick={()=>setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5"/>Add First Student
            </Button>
          )}
        </div>
      ):(
        <div className="space-y-2">
          {filtered.map(s=>{
            const st=APP_STATUS[s.applicationStatus]||{label:s.applicationStatus,color:'bg-slate-100 text-slate-600'};
            const isChanges = s.applicationStatus === 'Changes_Requested';
            const isEnrolled = s.applicationStatus === 'Enrolled';
            return (
              <div key={s._id}
                className={`bg-white rounded-xl border cursor-pointer hover:shadow-md transition-all group ${
                  isChanges ? 'border-amber-300 hover:border-amber-400' :
                  isEnrolled ? 'border-emerald-200 hover:border-emerald-300' :
                  'border-slate-200 hover:border-indigo-300'
                }`}
                onClick={()=>setSelected(s)}>
                <div className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Avatar */}
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      isEnrolled ? 'bg-emerald-100 text-emerald-700' :
                      isChanges ? 'bg-amber-100 text-amber-700' :
                      'bg-indigo-100 text-indigo-700'
                    }`}>
                      {s.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm">{s.name}</span>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${st.color}`}>{st.label}</span>
                        {s.enrollmentNumber&&(
                          <span className="text-xs text-emerald-700 font-bold font-mono bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            {s.enrollmentNumber}
                          </span>
                        )}
                        {s.amountSettled&&(
                          <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            ✅ Amount Settled
                          </span>
                        )}
                      </div>
                      <div className="flex gap-3 mt-0.5 text-xs text-slate-400 flex-wrap">
                        {s.phone&&<span className="flex items-center gap-1"><Phone className="h-3 w-3"/>{s.phone}</span>}
                        {s.fatherName&&<span>Father: {s.fatherName}</span>}
                        {s.courseName&&<span className="font-medium text-slate-500">{s.courseName}</span>}
                        {s.tenth_percent&&<span>10th: {s.tenth_percent}%</span>}
                        {s.twelfth_percent&&<span>12th: {s.twelfth_percent}%</span>}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0"/>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Student Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-slate-800">
              <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <GraduationCap className="h-4 w-4 text-indigo-600"/>
              </div>
              Add New Student
            </DialogTitle>
          </DialogHeader>
          <AddStudentWizard
            onClose={()=>setAddOpen(false)}
            onSaved={loadAll}
            defCounselor={defCounselor}
            centerId={centerId}
          />
        </DialogContent>
      </Dialog>

      {/* ── Change Password Dialog ─────────────────────── */}
      <Dialog open={pwdOpen} onOpenChange={open=>{ if(!open){setPwdForm({current:'',newPwd:'',confirm:''});} setPwdOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <KeyRound className="h-4 w-4 text-indigo-600"/>
              </div>
              Change Password
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Current Password *</Label>
              <Input
                type="password"
                className="mt-1 h-10 border-slate-200 focus:border-indigo-400 focus:ring-indigo-100"
                placeholder="Enter your current password"
                value={pwdForm.current}
                onChange={e=>setPwdForm(p=>({...p,current:e.target.value}))}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">New Password *</Label>
              <Input
                type="password"
                className="mt-1 h-10 border-slate-200 focus:border-indigo-400 focus:ring-indigo-100"
                placeholder="Min 6 characters"
                value={pwdForm.newPwd}
                onChange={e=>setPwdForm(p=>({...p,newPwd:e.target.value}))}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Confirm New Password *</Label>
              <Input
                type="password"
                className="mt-1 h-10 border-slate-200 focus:border-indigo-400 focus:ring-indigo-100"
                placeholder="Re-enter new password"
                value={pwdForm.confirm}
                onChange={e=>setPwdForm(p=>({...p,confirm:e.target.value}))}
              />
              {pwdForm.confirm && pwdForm.newPwd !== pwdForm.confirm && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>{ setPwdOpen(false); setPwdForm({current:'',newPwd:'',confirm:''}); }} className="border-slate-200">
              Cancel
            </Button>
            <Button onClick={handleChangePassword} disabled={pwdSaving} className="bg-indigo-600 hover:bg-indigo-700">
              {pwdSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}
              Update Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
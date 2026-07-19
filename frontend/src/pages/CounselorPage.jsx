import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, XCircle, RotateCcw, Loader2, Send, Eye, Search,
  Building2, GraduationCap, FileText, ChevronRight, Users, Paperclip, RefreshCw, Download,
  IndianRupee, AlertTriangle, Trash2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { studentsApi, docsApi, centersApi, paymentsApi, universitiesApi, paymentAccountsApi } from '@/lib/api';
import { pageCache } from '@/lib/pageCache';
import { useAuth } from '@/context/AuthContext';
import { usePanelDismissals } from '@/lib/usePanelDismissals';

const MEDIA = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
const fmt = n => `₹${(Number(n)||0).toLocaleString('en-IN')}`;
const fmtDt = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';

const getStudentSubmittedAt = student => {
  const submittedEntry = [...(student?.statusHistory || [])].reverse().find(h => h.status === 'Submitted');
  return submittedEntry?.at || student?.submittedAt || student?.createdAt;
};

const getPaymentSubmittedAt = tx => tx?.createdAt || tx?.submittedAt || tx?.paidAt;

function CardRequestDate({ date, label = 'Submitted' }) {
  if (!date) return null;
  return (
    <div className="mt-3 flex justify-end text-xs font-medium text-slate-400">
      {label}: {fmtDt(date)}
    </div>
  );
}

function UtrDuplicateWarning({ tx }) {
  const matches = tx?.duplicateUtrMatches || [];
  if (!tx?.utrDuplicate || !matches.length) return null;
  const match = matches[0];
  return (
    <div className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
      <div className="font-bold">UTR matched with existing payment. Payment not valid.</div>
      <div className="mt-0.5">
        Matched student: <span className="font-semibold">{match.studentName}</span>
        {match.courseName ? ` · ${match.courseName}` : ''}
        {match.source ? ` · ${match.source}` : ''}
        {match.amount ? ` · ${fmt(match.amount)}` : ''}
      </div>
    </div>
  );
}

function PaymentInfo({ tx, className = '' }) {
  if (!tx) return null;
  const isUPI  = tx.mode === 'UPI';
  const isBank = tx.mode === 'Bank Transfer';
  return (
    <div className={`space-y-0.5 ${className}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold text-emerald-600">{fmt(tx.amount)}</span>
        {tx.mode && <span className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-md font-medium">{tx.mode}</span>}
        {tx.paidAt && <span className="text-xs text-slate-400 ml-auto">{fmtDt(tx.paidAt)}</span>}
      </div>
      {isUPI && tx.upiId    && <div className="text-xs text-slate-500">UPI ID: <span className="font-semibold text-slate-700">{tx.upiId}</span></div>}
      {tx.utrRef             && <div className="text-xs text-slate-500">UTR: <span className="font-mono font-semibold text-slate-700">{tx.utrRef}</span></div>}
      {isBank && tx.bankName && <div className="text-xs text-slate-500">Bank: <span className="font-semibold text-slate-700">{tx.bankName}</span></div>}
      {isBank && tx.accountHolder && <div className="text-xs text-slate-500">Account Holder: <span className="font-semibold text-slate-700">{tx.accountHolder}</span></div>}
      {isBank && tx.accountNumber && <div className="text-xs text-slate-500">Account No: <span className="font-mono font-semibold text-slate-700">{tx.accountNumber}</span></div>}
      {isBank && tx.ifscCode      && <div className="text-xs text-slate-500">IFSC: <span className="font-mono font-semibold text-slate-700">{tx.ifscCode}</span></div>}
      {tx.note && <div className="text-xs text-slate-400 italic">"{tx.note}"</div>}
      <UtrDuplicateWarning tx={tx}/>
      {tx.paidToAccountLabel && (
        <div className="mt-1 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5">
          <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider mr-1.5">Paid To</span>
          <span className="text-xs font-semibold text-indigo-800">{tx.paidToAccountLabel}</span>
        </div>
      )}
    </div>
  );
}

function FeePaymentPanel({ payment, status = 'pending_counselor', accMap = {} }) {
  const txs = (payment?.transactions || []).filter(tx => tx.type === 'Fee' && (!status || tx.verificationStatus === status));
  if (!txs.length) return null;
  return (
    <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-bold uppercase tracking-wider text-orange-700">Fee payment attached</p>
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs bg-white border border-orange-200 rounded-md px-2 py-0.5">Net: <b>{fmt(payment.netFee)}</b></span>
          <span className="text-xs bg-white border border-emerald-200 rounded-md px-2 py-0.5">Paid: <b className="text-emerald-700">{fmt(payment.paidAmount)}</b></span>
          {payment.dueAmount > 0 && <span className="text-xs bg-white border border-amber-200 rounded-md px-2 py-0.5">Due: <b className="text-amber-700">{fmt(payment.dueAmount)}</b></span>}
        </div>
      </div>
      {txs.map(tx => (
        <div key={tx._id} className="rounded-lg border border-orange-100 bg-white p-2.5">
          <PaymentInfo tx={tx}/>
          {tx.paymentScreenshot && (
            <a href={`${MEDIA}${tx.paymentScreenshot}`} target="_blank" rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-100"
              onClick={e => e.stopPropagation()}>
              <Download className="h-3 w-3"/>View Payment Screenshot
            </a>
          )}
          <PaidToAccountBox tx={tx} accMap={accMap}/>
        </div>
      ))}
    </div>
  );
}

const STATUS_COLORS = {
  Draft:              'bg-slate-100 text-slate-600 border border-slate-200',
  Submitted:          'bg-blue-50 text-blue-700 border border-blue-200',
  Changes_Requested:  'bg-amber-50 text-amber-700 border border-amber-300',
  Counselor_Approved: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  Rejected:           'bg-red-50 text-red-600 border border-red-200',
  Accountant_Pending: 'bg-orange-50 text-orange-700 border border-orange-200',
  Sent_To_University: 'bg-purple-50 text-purple-700 border border-purple-200',
  Enrolled:           'bg-emerald-50 text-emerald-700 border border-emerald-200',
  Accountant_Rejected:'bg-red-50 text-red-600 border border-red-200',
  University_Rejected: 'bg-orange-50 text-orange-700 border border-orange-300',
};
const DOC_COLORS = {
  Requested:          'bg-blue-50 text-blue-700 border border-blue-200',
  Changes_Requested:  'bg-amber-50 text-amber-700 border border-amber-300',
  Forwarded:          'bg-indigo-50 text-indigo-700 border border-indigo-200',
  Fee_Approved:       'bg-green-50 text-green-700 border border-green-200',
  Fee_Rejected:       'bg-red-50 text-red-600 border border-red-200',
  Sent_To_University: 'bg-purple-50 text-purple-700 border border-purple-200',
  University_Dispatched:'bg-violet-50 text-violet-700 border border-violet-200',
  Counselor_Received: 'bg-amber-50 text-amber-700 border border-amber-300',
  Center_Notified:    'bg-amber-50 text-amber-700 border border-amber-300',
  Payment_Submitted:  'bg-blue-50 text-blue-700 border border-blue-200',
  Payment_Verified:   'bg-green-50 text-green-700 border border-green-200',
  Dispatched:         'bg-teal-50 text-teal-700 border border-teal-200',
  Delivered:          'bg-emerald-50 text-emerald-700 border border-emerald-200',
};

// ── Reusable InfoRow ──────────────────────────────────────────
function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</div>
      <div className="font-semibold text-slate-800 mt-0.5 break-words text-sm">{value}</div>
    </div>
  );
}

// ── Student Modal ─────────────────────────────────────────────
function StudentModal({ student, onClose }) {
  const [payment,    setPayment]    = useState(null);
  const [docs,       setDocs]       = useState([]);
  const [fullStudent,setFullStudent]= useState(student);

  useEffect(() => {
    if (!student) return;
    studentsApi.getOne(student._id).then(s => { if(s) setFullStudent(s); }).catch(()=>{});
    paymentsApi.get(student._id, { checkDuplicates: true }).then(setPayment).catch(()=>{});
    docsApi.list({ studentId: student._id, all: '1' }).then(setDocs).catch(()=>{});
  }, [student?._id]);
  const s = fullStudent;

  if (!student) return null;
  const st = STATUS_COLORS[student.applicationStatus] || 'bg-slate-100 text-slate-600';

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 flex-wrap">
            <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-indigo-700">{student.name?.charAt(0)?.toUpperCase()}</span>
            </div>
            <span className="font-bold text-slate-800">{student.name}</span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${st}`}>{student.applicationStatus?.replace(/_/g,' ')}</span>
            {student.enrollmentNumber && (
              <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">{student.enrollmentNumber}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="info">
          <TabsList className="bg-slate-100 p-1 rounded-xl">
            <TabsTrigger value="info" className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm px-4">Info</TabsTrigger>
            <TabsTrigger value="docs" className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm px-4">Submitted Docs</TabsTrigger>
            <TabsTrigger value="fees" className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm px-4">Fees</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                ['Name',         s.name],
                ['Phone',        s.phone],
                ['Email',        s.email],
                ['Father Name',  s.fatherName],
                ['Mother Name',  s.motherName],
                ['DOB',          s.dob ? new Date(s.dob).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : null],
                ['Gender',       s.gender],
                ['Aadhaar',      s.aadharNumber],
                ['Address',      s.address],
                ['Course',       s.courseName],
                ['Session',   s.courseYear],
                ['10th %',       s.tenth_percent   ? `${s.tenth_percent}%`   : null],
                ['10th Year',    s.tenth_year      || null],
                ['10th Board',   s.tenth_board     || null],
                ['12th %',       s.twelfth_percent ? `${s.twelfth_percent}%` : null],
                ['12th Year',    s.twelfth_year    || null],
                ['12th Board',   s.twelfth_board   || null],
                ['University',   s.university?.name || s.universityName || null],
                ['Enrollment',   s.enrollmentNumber || null],
              ].filter(([,v])=>v).map(([l,v])=>(
                <InfoRow key={l} label={l} value={v}/>
              ))}
            </div>
            {s.submissionDocs?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Attached at submission</p>
                <div className="flex flex-wrap gap-1.5">
                  {s.submissionDocs.map((d,i)=>(
                    <span key={i} className="text-xs flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-3 py-1 font-medium text-slate-700">
                      <Paperclip className="h-3 w-3 text-slate-400"/>
                      {d.fileUrl?<a href={`${MEDIA}${d.fileUrl}`} target="_blank" rel="noreferrer" className="text-indigo-600 underline">{d.name}</a>:<span>{d.name}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {s.changesRequested && <div className="mt-3 text-xs bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-amber-700"><span className="font-bold">Changes requested:</span> {s.changesRequested}</div>}
            {s.rejectionReason  && <div className="mt-3 text-xs bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-red-700"><span className="font-bold">Rejected:</span> {s.rejectionReason}</div>}
          </TabsContent>

          <TabsContent value="docs" className="mt-3 space-y-4">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5"/> Submitted by Center ({s.submissionDocs?.length || 0})
              </p>
              {s.submissionDocs?.length > 0 ? (
                <div className="space-y-1.5">
                  {s.submissionDocs.map((d, i) => (
                    <div key={i} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip className="h-3.5 w-3.5 text-slate-400 shrink-0"/>
                        <span className="truncate font-medium text-slate-700">{d.name}</span>
                        {d.sizeKb > 0 && <span className="text-xs text-slate-400 shrink-0">{d.sizeKb}KB</span>}
                      </div>
                      {d.fileUrl
                        ? <a href={`${MEDIA}${d.fileUrl}`} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 underline shrink-0 ml-2 font-medium">View</a>
                        : <span className="text-xs text-slate-400 shrink-0 ml-2">No file</span>
                      }
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-400 italic">No documents submitted</p>}
            </div>

            {docs.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5"/> Document Requests ({docs.length})
                </p>
                <div className="space-y-1.5">
                  {docs.map(d=>(
                    <div key={d._id} className="flex justify-between items-start bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800">{d.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DOC_COLORS[d.status]||'bg-slate-100 text-slate-600'}`}>{d.status?.replace(/_/g,' ')}</span>
                        </div>
                        {(d.chargeFee>0||d.totalPaid>0)&&(
                          <div className="text-xs text-slate-500 mt-0.5">
                            Charge: <span className="font-semibold text-slate-700">{fmt(d.chargeFee)}</span> · Paid: <span className="font-semibold text-emerald-600">{fmt(d.totalPaid)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="fees" className="mt-3">
            {payment?(
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    ['Total',    fmt(payment.totalFee),   'text-slate-700',   'bg-slate-50 border-slate-200'],
                    ['Discount', fmt(payment.discount),   'text-amber-600',   'bg-amber-50 border-amber-200'],
                    ['Net',      fmt(payment.netFee),     'text-indigo-600',  'bg-indigo-50 border-indigo-200'],
                    ['Paid',     fmt(payment.paidAmount), 'text-emerald-600', 'bg-emerald-50 border-emerald-200'],
                  ].map(([l,v,vc,bg])=>(
                    <div key={l} className={`rounded-xl border p-3 text-center ${bg}`}>
                      <div className={`font-bold text-base ${vc}`}>{v}</div>
                      <div className="text-xs text-slate-400 font-medium mt-0.5">{l}</div>
                    </div>
                  ))}
                </div>
                {payment.transactions?.length>0&&(
                  <div className="space-y-1.5">
                    {[...payment.transactions].reverse().map(tx=>(
                      <div key={tx._id} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <PaymentInfo tx={tx}/>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ):<p className="text-sm text-slate-400 italic">No fee structure set</p>}
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-slate-200 text-slate-600">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Center Modal ──────────────────────────────────────────────
function CenterModal({ center, onClose }) {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!center) return;
    centersApi.getStudents(center._id).then(setStudents).catch(()=>{}).finally(()=>setLoading(false));
  }, [center?._id]);

  if (!center) return null;
  const statusCounts = students.reduce((acc,s)=>{ acc[s.applicationStatus]=(acc[s.applicationStatus]||0)+1; return acc; },{});

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-4 w-4 text-slate-500"/>
            </div>
            <div>
              <div className="font-bold text-slate-800">{center.name}</div>
              {(center.city||center.state) && <div className="text-xs text-slate-400 font-normal">{center.city}{center.state?`, ${center.state}`:''}</div>}
            </div>
          </DialogTitle>
        </DialogHeader>
        {loading?(
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-300"/></div>
        ):(
          <>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(statusCounts).map(([s,c])=>(
                <span key={s} className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${STATUS_COLORS[s]||'bg-slate-100 text-slate-600'}`}>
                  {s.replace(/_/g,' ')}: <b>{c}</b>
                </span>
              ))}
            </div>
            <div className="space-y-1.5 mt-2">
              {students.length===0?(
                <p className="text-sm text-slate-400 italic text-center py-6">No students in this center</p>
              ):students.map(s=>(
                <div key={s._id}
                  className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2.5 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                  onClick={()=>{onClose();navigate(`/students/${s._id}`);}}>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{s.name}</div>
                    <div className="text-xs text-slate-400">{s.courseName} {s.courseYear}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[s.applicationStatus]||'bg-slate-100 text-slate-600'}`}>{s.applicationStatus?.replace(/_/g,' ')}</span>
                    {s.enrollmentNumber&&<span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">{s.enrollmentNumber}</span>}
                    <ChevronRight className="h-4 w-4 text-slate-300"/>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-slate-200 text-slate-600">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Doc Modal ─────────────────────────────────────────────────
function DocModal({ doc, onClose, onForward, onForwardToCenter, onForwardPayment, accMap={} }) {
  if (!doc) return null;
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <FileText className="h-4 w-4 text-indigo-600"/>
            </div>
            <div>
              <div className="font-bold text-slate-800">{doc.name}</div>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${DOC_COLORS[doc.status]||'bg-slate-100 text-slate-600'}`}>{doc.status?.replace(/_/g,' ')}</span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm overflow-y-auto flex-1 pr-1">
          
          {doc.scannedUrl && (
            <div className="border border-teal-200 bg-teal-50 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
                  <Paperclip className="h-4 w-4 text-teal-600"/>
                </div>
                <div>
                  <p className="text-xs font-bold text-teal-700">Scanned Document</p>
                  <p className="text-xs text-teal-500">{doc.scannedName || 'Scan file'}</p>
                </div>
              </div>
              <a href={`${MEDIA}${doc.scannedUrl}`} target="_blank" rel="noreferrer"
                className="text-xs font-bold text-teal-700 underline shrink-0 hover:text-teal-900">
                View / Download
              </a>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <InfoRow label="Student" value={doc.student?.name}/>
            {doc.center?.name && <InfoRow label="Center" value={doc.center.name}/>}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              ['Charge',  fmt(doc.chargeFee),               'text-slate-700',  'bg-slate-50 border-slate-200'],
              ['Paid',    fmt(doc.totalPaid),                'text-emerald-600','bg-emerald-50 border-emerald-200'],
              ['Due',     fmt(doc.chargeFee-doc.totalPaid),  doc.chargeFee>doc.totalPaid?'text-amber-600':'text-emerald-600', doc.chargeFee>doc.totalPaid?'bg-amber-50 border-amber-200':'bg-emerald-50 border-emerald-200'],
            ].map(([l,v,vc,bg])=>(
              <div key={l} className={`rounded-xl border p-3 text-center ${bg}`}>
                <div className={`font-bold text-base ${vc}`}>{v}</div>
                <div className="text-xs text-slate-400 font-medium mt-0.5">{l}</div>
              </div>
            ))}
          </div>

          {doc.payments?.length>0&&(
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Payment History</p>
              <div className="space-y-1.5">
                {doc.payments.map(p=>(
                  <div key={p._id} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-bold text-emerald-600">{fmt(p.amount)}</span>
                      {p.mode && <span className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded font-medium">{p.mode}</span>}
                      {p.paidToAccountLabel && <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-medium">→ {p.paidToAccountLabel}</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.verified?'bg-emerald-100 text-emerald-700 border border-emerald-200':'bg-amber-100 text-amber-700 border border-amber-200'}`}>{p.verified?'Verified':'Pending'}</span>
                      <span className="text-xs text-slate-400 ml-auto">{fmtDt(p.paidAt)}</span>
                    </div>
                    <PaymentInfo tx={p}/>
                  </div>
                ))}
              </div>
            </div>
          )}

          {doc.statusHistory?.slice(-5).length > 0 && (
            <div className="border-t border-slate-100 pt-3 space-y-1.5">
              {doc.statusHistory.slice(-5).map((h,i)=>(
                <div key={i} className="text-xs flex gap-2 text-slate-500">
                  <span className="font-semibold text-slate-700">{h.status?.replace(/_/g,' ')}</span>
                  {h.note&&<span className="text-slate-400">· {h.note}</span>}
                  <span className="ml-auto text-slate-400">{fmtDt(h.at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose} className="border-slate-200 text-slate-600">Close</Button>
          {doc.status==='Requested'&&(
            <Button onClick={()=>{onForward(doc);onClose();}} className="bg-indigo-600 hover:bg-indigo-700">
              <Send className="h-4 w-4 mr-1.5"/>Forward to Accountant
            </Button>
          )}
          {doc.status==='Counselor_Received'&&(
            <Button onClick={()=>{onForwardToCenter(doc);onClose();}} className="bg-violet-600 hover:bg-violet-700">
              <Send className="h-4 w-4 mr-1.5"/>Forward to Center
            </Button>
          )}
          {doc.status==='Payment_Submitted'&&(
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={()=>{onForwardPayment(doc);onClose();}}>
              <Send className="h-4 w-4 mr-1.5"/>Forward to Accountant
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Student Card (Review/Reject tabs) ─────────────────────────
function StudentCard({ s, accent = 'border-blue-200', children, onClick, feePayment, accMap, requestDate, requestDateLabel }) {
  return (
    <div className={`bg-white rounded-xl border ${accent} shadow-sm hover:shadow transition-shadow`}>
      <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer" onClick={onClick}>
          <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-700 flex-shrink-0 mt-0.5">
            {s.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-800">{s.name}</div>
            <div className="text-xs text-slate-400 mt-0.5">{s.center?.name} · {s.courseName} {s.courseYear}</div>
            {s.university && <div className="text-xs text-purple-600 font-medium mt-0.5">🎓 {s.university?.name||s.university}</div>}
            {s.enrollmentNumber && (
  <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full w-fit block mt-0.5">
    {s.enrollmentNumber}
  </span>
)}
            {s.fatherName && <div className="text-xs text-slate-400">Father: {s.fatherName}</div>}
            {(s.tenth_percent||s.twelfth_percent)&&(
              <div className="text-xs text-slate-400">
                {s.tenth_percent&&`10th: ${s.tenth_percent}%`}{s.tenth_percent&&s.twelfth_percent?' · ':''}{s.twelfth_percent&&`12th: ${s.twelfth_percent}%`}
              </div>
            )}
            {s.submissionDocs?.length>0&&(
              <div className="flex flex-wrap gap-1 mt-1.5">
                {s.submissionDocs.map((d,i)=>(
                  <span key={i} className="text-xs flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 text-slate-600">
                    <Paperclip className="h-2.5 w-2.5 text-slate-400"/>
                    {d.fileUrl
                      ?<a href={`${MEDIA}${d.fileUrl}`} target="_blank" rel="noreferrer" className="text-indigo-600 underline" onClick={e=>e.stopPropagation()}>{d.name}</a>
                      :<span>{d.name}</span>
                    }
                  </span>
                ))}
              </div>
            )}
            <FeePaymentPanel payment={feePayment} status="pending_counselor" accMap={accMap}/>
          </div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
          {children}
        </div>
      </div>
      <CardRequestDate date={requestDate} label={requestDateLabel}/>
      </div>
    </div>
  );
}

// ── Doc Card ──────────────────────────────────────────────────
function DocCard({ d, accent, badge, badgeColor, onClick, children, paySummary, accMap }) {
  return (
    <div className={`bg-white rounded-xl border ${accent} shadow-sm hover:shadow transition-shadow cursor-pointer`} onClick={onClick}>
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
            <FileText className="h-4 w-4 text-slate-500"/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-slate-800">{d.name}</span>
              {badge && <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${badgeColor}`}>{badge}</span>}
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${d.requestType === 'Hard Copy' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-sky-50 text-sky-700 border-sky-200'}`}>{d.requestType || 'Soft Copy'}</span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
  <span>Student: <span className="font-medium text-slate-600">{d.student?.name}</span></span>
  {d.student?.enrollmentNumber && (
    <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-xs">
      {d.student.enrollmentNumber}
    </span>
  )}
</div>
            {d.chargeFee>0&&(
              <div className="text-xs mt-0.5">
                Charge: <span className="font-bold text-slate-700">{fmt(d.chargeFee)}</span>
                {d.totalPaid>0 && <> · Paid: <span className="font-bold text-emerald-600">{fmt(d.totalPaid)}</span></>}
              </div>
            )}
            {paySummary && (
              <div className="flex gap-2 flex-wrap mt-1">
                <span className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5">
                  Total Fee: <span className="font-bold text-slate-700">{fmt(paySummary.totalFee ?? paySummary.netFee)}</span>
                </span>
                <span className="text-xs bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5">
                  Paid: <span className="font-bold text-emerald-700">{fmt(paySummary.paidAmount)}</span>
                </span>
                {paySummary.dueAmount > 0 && (
                  <span className="text-xs bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">
                    Due: <span className="font-bold text-amber-700">{fmt(paySummary.dueAmount)}</span>
                  </span>
                )}
              </div>
            )}
            {d.scannedUrl && (
              <a href={`${MEDIA}${d.scannedUrl}`} target="_blank" rel="noreferrer"
                className="text-xs text-teal-600 underline flex items-center gap-1 mt-1 w-fit font-medium"
                onClick={e=>e.stopPropagation()}>
                <Paperclip className="h-3 w-3"/>View Scanned File
              </a>
            )}
            {d.payments?.length > 0 && (
              <div className="mt-1.5 space-y-1.5">
                {d.payments.map(p=>(
                  <div key={p._id} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-bold text-emerald-600 text-sm">{fmt(p.amount)}</span>
                      {p.mode && <span className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded font-medium">{p.mode}</span>}
                      {p.paidAt && <span className="text-xs text-slate-400 ml-auto">{fmtDt(p.paidAt)}</span>}
                    </div>
                    {p.mode==='UPI' && p.upiId && <div className="text-xs text-slate-500">UPI ID: <span className="font-mono font-semibold text-slate-700">{p.upiId}</span></div>}
                    {p.utrRef && <div className="text-xs text-slate-500">UTR: <span className="font-mono font-semibold text-slate-700">{p.utrRef}</span></div>}
                    {p.mode==='Bank Transfer' && p.bankName && <div className="text-xs text-slate-500">Bank: <span className="font-semibold text-slate-700">{p.bankName}</span></div>}
                    {p.mode==='Bank Transfer' && p.accountHolder && <div className="text-xs text-slate-500">Account Holder: <span className="font-semibold text-slate-700">{p.accountHolder}</span></div>}
                    {p.mode==='Bank Transfer' && p.accountNumber && <div className="text-xs text-slate-500">Account No: <span className="font-mono font-semibold text-slate-700">{p.accountNumber}</span></div>}
                    {p.mode==='Bank Transfer' && p.ifscCode && <div className="text-xs text-slate-500">IFSC: <span className="font-mono font-semibold text-slate-700">{p.ifscCode}</span></div>}
                    {p.note && <div className="text-xs text-slate-400 italic">"{p.note}"</div>}
                    {p.paymentScreenshot && (   // ← YE DAALO
  <div className="mt-1.5">
    <a href={`${MEDIA}${p.paymentScreenshot}`}
      target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-100 transition-colors">
      <Download className="h-3 w-3"/>View Payment Screenshot
    </a>
  </div>
)}
                    {(p.paidToAccountLabel || p.paidToAccount) && (
                      <PaidToAccountBox tx={p} accMap={accMap}/>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex-shrink-0">{children}</div>
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────
function SettlementRequestCard({ student: s, saving, onForward }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note,     setNote]     = useState('');

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardContent className="p-4 space-y-3">
        {/* Student info */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800">{s.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 border border-slate-300 font-medium">🚫 Cancelled</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium">⏳ Settlement Requested</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3">
              {s.center?.name && <span>{s.center.name}</span>}
              {s.courseName   && <span>{s.courseName}</span>}
              {s.phone        && <span>{s.phone}</span>}
            </div>
            {s.rejectionReason && (
              <div className="mt-1.5 text-xs bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600">
                <span className="font-semibold">Cancellation reason:</span> {s.rejectionReason}
              </div>
            )}
          </div>
        </div>

        {/* Forward action */}
        {!noteOpen ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setNoteOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 h-8 text-xs"
            >
              <Send className="h-3.5 w-3.5 mr-1.5"/>Forward to Accountant
            </Button>
          </div>
        ) : (
          <div className="space-y-2 bg-white border border-slate-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-slate-600">Add a note for the accountant (optional)</p>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Verified — please process refund of ₹15,000…"
              rows={2}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 resize-none"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setNoteOpen(false); setNote(''); }}
                className="h-8 text-xs border-slate-200"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={saving}
                onClick={() => onForward(s, note)}
                className="bg-indigo-600 hover:bg-indigo-700 h-8 text-xs"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin"/>}
                <Send className="h-3.5 w-3.5 mr-1.5"/>Confirm Forward
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon: Icon = FileText, message }) {
  return (
    <div className="text-center py-14 border-2 border-dashed border-slate-200 rounded-2xl">
      <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
        <Icon className="h-6 w-6 text-slate-400"/>
      </div>
      <p className="text-sm font-medium text-slate-500">{message}</p>
    </div>
  );
}

// ── Tab Hint ──────────────────────────────────────────────────
function TabHint({ children }) {
  return (
    <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-3">
      <div className="h-5 w-5 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-slate-600 text-xs font-bold">i</span>
      </div>
      <p className="text-xs text-slate-500">{children}</p>
    </div>
  );
}

// ── Paid To Account Detail Box ────────────────────────────────
function PaidToAccountBox({ tx, accMap }) {
  if (!tx?.paidToAccount && !tx?.paidToAccountLabel) return null;
  const acc = accMap?.[String(tx.paidToAccount)];
  const label = acc?.label || tx.paidToAccountLabel || '';
  const isUPI = acc?.mode === 'UPI';
  const isBank = acc?.mode === 'Bank Transfer';
  return (
    <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2.5 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Paid To</span>
        <span className="text-sm font-semibold text-indigo-800">{label}</span>
        {acc?.mode && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isUPI ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{acc.mode}</span>}
      </div>
      {acc && (
        <div className="space-y-0.5 text-xs text-indigo-700">
          {isUPI && acc.upiId   && <div>UPI ID: <span className="font-mono font-bold">{acc.upiId}</span></div>}
          {isUPI && acc.upiName && <div>Name: <span className="font-semibold">{acc.upiName}</span></div>}
          {isBank && acc.bankName      && <div>Bank: <span className="font-semibold">{acc.bankName}</span></div>}
          {isBank && acc.accountHolder && <div>Account Holder: <span className="font-semibold">{acc.accountHolder}</span></div>}
          {isBank && acc.accountNumber && <div>Account No: <span className="font-mono font-bold">{acc.accountNumber}</span></div>}
          {isBank && acc.ifscCode      && <div>IFSC: <span className="font-mono font-semibold">{acc.ifscCode}</span></div>}
          {isBank && acc.branch        && <div>Branch: <span className="font-semibold">{acc.branch}</span></div>}
        </div>
      )}
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────
export default function CounselorPage() {
  const { user, switchToCenter } = useAuth();
  const { dismiss, isDismissed } = usePanelDismissals(user, 'counselor');
  const navigate = useNavigate();
  const [allStudents, setAllStudents] = useState([]);
  const [docs, setDocs] = useState([]);
  const [centers, setCenters] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [feePayments, setFeePayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionOpen, setActionOpen] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [payAccounts, setPayAccounts] = useState({}); // id → account object
  const [settlementQueue, setSettlementQueue] = useState([]); // cancelled + settlementRequested

  const [studentModal, setStudentModal] = useState(null);
  const [centerModal, setCenterModal] = useState(null);
  const [docModal, setDocModal] = useState(null);
  const [docPayments, setDocPayments] = useState({});
  const [studentFeeMap, setStudentFeeMap] = useState({});
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [centerSwitchOpen, setCenterSwitchOpen] = useState(false);
  const [centerSwitchSearch, setCenterSwitchSearch] = useState('');

  const load = useCallback(async () => {
    // Stale-while-revalidate: show cached data instantly, then refresh in background
    const cached = pageCache.get('counselor-dashboard');
    if (cached) {
      setAllStudents(cached.allStudents); setDocs(cached.docs); setCenters(cached.centers);
      setUniversities(cached.universities); setPayAccounts(cached.payAccounts);
      setSettlementQueue(cached.settlementQueue); setDocPayments(cached.docPayments);
      setStudentFeeMap(cached.studentFeeMap); setFeePayments(cached.feePayments);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const [ss, d, c, unis, accs] = await Promise.all([
        studentsApi.getAll(),
        docsApi.list(),
        centersApi.getAll(),
        universitiesApi.getAll(),
        paymentAccountsApi.list().catch(()=>[]),
      ]);
      setAllStudents(ss); setDocs(d); setCenters(c); setUniversities(unis);
      // Settlement queue: Cancelled students where center has requested settlement but counselor hasn't forwarded yet
      // Check both the settlementRequested field AND statusHistory as a fallback
      // (in case Student.js model was not yet updated and the field wasn't saved)
      setSettlementQueue(ss.filter(s => {
        if (s.applicationStatus !== 'Cancelled') return false;
        if (s.amountSettled) return false;
        if (s.settlementForwardedToAccountant) return false;
        // Primary check: field on document
        if (s.settlementRequested) return true;
        // Fallback: check statusHistory for 'Settlement_Requested' entry
        return (s.statusHistory || []).some(h => h.status === 'Settlement_Requested');
      }));
      const accMap = {};
      accs.forEach(a => { accMap[String(a._id)] = a; });
      setPayAccounts(accMap);

      const uniqueStudentIds = [...new Set(d.map(doc => doc.student?._id).filter(Boolean))];
      const allStudentIds = [...new Set([...ss.map(s => s._id), ...uniqueStudentIds])];

      // ONE bulk request instead of N individual requests — fixes the timeout/slowness
      const allPayments = await paymentsApi.bulkGet(allStudentIds).catch(() => []);
      const paymentByStudent = {};
      allPayments.forEach(p => { paymentByStudent[String(p.student)] = p; });

      const payMap = {};
      uniqueStudentIds.forEach(sid => {
        const pay = paymentByStudent[String(sid)];
        if (pay) payMap[sid] = { totalFee: pay.totalFee||0, netFee: pay.netFee||0, paidAmount: pay.paidAmount||0, dueAmount: pay.dueAmount||0 };
      });
      setDocPayments(payMap);

      const pending = [];
      const feeMap = {};
      ss.forEach(student => {
        const pay = paymentByStudent[String(student._id)];
        if (pay) {
          feeMap[String(student._id)] = pay;
          (pay.transactions || []).forEach(tx => {
            if (tx.verificationStatus === 'pending_counselor') {
              pending.push({ student, payment: pay, tx });
            }
          });
        }
      });
      pending.sort((a, b) => new Date(b.tx.paidAt || b.tx.createdAt || 0) - new Date(a.tx.paidAt || a.tx.createdAt || 0));
      setStudentFeeMap(feeMap);
      setFeePayments(pending);

      // Cache everything for instant load next time this page mounts
      const settlementQ = ss.filter(s => {
        if (s.applicationStatus !== 'Cancelled') return false;
        if (s.amountSettled) return false;
        if (s.settlementForwardedToAccountant) return false;
        if (s.settlementRequested) return true;
        return (s.statusHistory || []).some(h => h.status === 'Settlement_Requested');
      });
      pageCache.set('counselor-dashboard', {
        allStudents: ss, docs: d, centers: c, universities: unis,
        payAccounts: accMap, settlementQueue: settlementQ,
        docPayments: payMap, studentFeeMap: feeMap, feePayments: pending,
      });
    } catch (e) { if (!cached) toast.error('Failed to load: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function doAction() {
    const { student, action } = actionOpen;
    if ((action==='reject'||action==='changes'||action==='sendToCenter'||action==='sendToCenterFinal') && !note.trim()) return toast.error('Note required');
    setSaving(true);
    try {
      if (action==='approve')             await studentsApi.approve(student._id);
      if (action==='reject')              await studentsApi.reject(student._id, note);
      if (action==='changes')             await studentsApi.requestChanges(student._id, note);
      if (action==='reforward')           await studentsApi.counselorReforward(student._id);
      if (action==='sendToCenter')        await studentsApi.counselorSendToCenter(student._id, note);
      if (action==='sendToCenterFinal')   await studentsApi.counselorSendToCenterFinal(student._id, note);
      toast.success('Done'); setActionOpen(null); setNote(''); load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function forwardDoc(d) {
    try { await docsApi.forward(d._id); toast.success('Forwarded to accountant'); load(); }
    catch(e) { toast.error(e.message); }
  }

  function toggleDocSelection(id) {
    setSelectedDocIds(prev => prev.includes(String(id)) ? prev.filter(x => x !== String(id)) : [...prev, String(id)]);
  }

  async function batchForwardDocs(list, action, successLabel) {
    const selected = list.filter(d => selectedDocIds.includes(String(d._id)));
    if (!selected.length) return toast.error('Select documents first');
    setSaving(true);
    try {
      for (const doc of selected) await action(doc);
      toast.success(`${selected.length} documents ${successLabel}`);
      setSelectedDocIds([]);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleForwardSettlement(student, note) {
    setSaving(true);
    try {
      await studentsApi.forwardSettlement(student._id, note);
      toast.success(`Settlement forwarded to accountant for ${student.name}`);
      load();
    } catch(e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function forwardDocToCenter(d) {
    try { await docsApi.forwardToCenter(d._id); toast.success('Forwarded to center'); load(); }
    catch(e) { toast.error(e.message); }
  }

  async function forwardPaymentToAccountant(d) {
    try { await docsApi.forwardPayment(d._id); toast.success('Payment forwarded to accountant'); load(); }
    catch(e) { toast.error(e.message); }
  }

  async function forwardFeePaymentToAccountant(studentId, txId) {
    try {
      await paymentsApi.counselorForwardPayment(studentId, txId);
      toast.success('Fee payment forwarded to accountant for verification');
      load();
    } catch(e) { toast.error(e.message); }
  }

  const [rejectFeeDialog, setRejectFeeDialog] = useState(null); // {studentId, txId, studentName, amount}
  const [rejectFeeNote, setRejectFeeNote]     = useState('');
  const [docChangeDialog, setDocChangeDialog] = useState(null);
  const [docChangeNote, setDocChangeNote] = useState('');

  async function rejectFeePayment() {
    if (!rejectFeeDialog) return;
    try {
      await paymentsApi.counselorRejectPayment(rejectFeeDialog.studentId, rejectFeeDialog.txId, rejectFeeNote);
      toast.success('Payment rejected — center notified to resubmit');
      setRejectFeeDialog(null); setRejectFeeNote(''); load();
    } catch(e) { toast.error(e.message); }
  }

  async function requestDocChanges() {
    if (!docChangeDialog) return;
    if (!docChangeNote.trim()) return toast.error('Note required');
    try {
      await docsApi.requestChanges(docChangeDialog._id, docChangeNote);
      toast.success('Sent back to center for changes');
      setDocChangeDialog(null);
      setDocChangeNote('');
      load();
    } catch (e) { toast.error(e.message); }
  }

  const pending           = allStudents.filter(s => s.applicationStatus === 'Submitted' && !isDismissed(`student:${s._id}:review`));
  const acctRejected      = allStudents.filter(s => s.applicationStatus === 'Accountant_Rejected' && !isDismissed(`student:${s._id}:acctreject`));
  const newDocs           = docs.filter(d => d.status === 'Requested' && !isDismissed(`doc:${d._id}:request`));
  const fromDisp          = docs.filter(d => d.status === 'Counselor_Received' && !isDismissed(`doc:${d._id}:dispatch`));
  const deliveryPending   = docs.filter(d => d.status === 'Dispatched' && !isDismissed(`doc:${d._id}:delivery`));
  const paymentPending    = docs.filter(d => d.status === 'Payment_Submitted' && !isDismissed(`doc:${d._id}:payment`));
  const visibleSettlementQueue = settlementQueue.filter(s => !isDismissed(`student:${s._id}:settlement`));
  const visibleFeePayments = feePayments.filter(({ student, tx }) => !isDismissed(`fee-payment:${student._id}:${tx._id}`));
  const switchCenters = centers.filter(c => {
    const text = `${c.name || ''} ${c.organisationName || ''} ${c.city || ''}`.toLowerCase();
    return !centerSwitchSearch.trim() || text.includes(centerSwitchSearch.toLowerCase());
  });
  const q = search.toLowerCase();
  const filtered = allStudents.filter(s =>
    !q ||
    s.name?.toLowerCase().includes(q) ||
    s.phone?.includes(search) ||
    s.enrollmentNumber?.toLowerCase().includes(q) ||
    s.center?.name?.toLowerCase().includes(q) ||
    s.courseName?.toLowerCase().includes(q)
  );

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mx-auto mb-2"/>
        <p className="text-sm text-slate-400">Loading dashboard…</p>
      </div>
    </div>
  );

  // Tab badge helper
  const tb = (label, count, color = '') => (
    <span className="flex items-center gap-1.5">
      {label}
      {count > 0 && (
        <span className={`text-xs font-bold rounded-full h-5 min-w-5 flex items-center justify-center px-1.5 ${color || 'bg-indigo-100 text-indigo-700'}`}>
          {count}
        </span>
      )}
    </span>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Counselor Dashboard</h1>
          <p className="text-xs text-slate-400 mt-0.5">Manage applications, documents and center activity</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={()=>setCenterSwitchOpen(true)}
            className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-1.5">
            <Building2 className="h-4 w-4"/>Switch Center
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}
            className="border-slate-200 text-slate-600 hover:bg-slate-50 gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}
            Refresh
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:'Pending Review',  value: pending.length,        color:'text-blue-600',   bg:'bg-blue-50 border-blue-200',    dot:'bg-blue-400'   },
          { label:'Acct Rejected',   value: acctRejected.length,   color:'text-red-600',    bg:'bg-red-50 border-red-200',      dot:'bg-red-400'    },
          { label:'Fee Payments',    value: visibleFeePayments.length,    color:'text-orange-600', bg:'bg-orange-50 border-orange-200',dot:'bg-orange-400' },
          { label:'From Dispatch',   value: fromDisp.length,       color:'text-violet-600', bg:'bg-violet-50 border-violet-200',dot:'bg-violet-400' },
          { label:'Delivery Pending',value: deliveryPending.length, color:'text-rose-600',   bg:'bg-rose-50 border-rose-200',    dot:'bg-rose-400'   },
        ].map(({ label, value, color, bg, dot }) => (
          <div key={label} className={`rounded-xl border p-4 ${bg}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-slate-500 font-medium mt-0.5">{label}</div>
              </div>
              <div className={`h-2 w-2 rounded-full ${dot} mt-1.5`}/>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="review">
        <TabsList className="flex flex-wrap gap-0.5 bg-slate-100 p-1 rounded-xl h-auto">
          {[
            { val:'review',    label:'Review',           count: pending.length,          dot:'bg-blue-500' },
            { val:'acctreject',label:'Acct Rejected',     count: acctRejected.length,     dot:'bg-red-500'  },
            { val:'docs',      label:'Doc Requests',      count: newDocs.length,          dot:'bg-indigo-500'},
            { val:'feepay',    label:'Fee Payments',      count: visibleFeePayments.length,      dot:'bg-orange-500'},
            { val:'payment',   label:'Doc Payments',      count: paymentPending.length,   dot:'bg-emerald-500'},
            { val:'dispatch',  label:'From Dispatch',     count: fromDisp.length,         dot:'bg-violet-500'},
            { val:'delipend',  label:'Delivery Pending',  count: deliveryPending.length,  dot:'bg-rose-500'},
            { val:'settlement',label:'Settlement',        count: visibleSettlementQueue.length,  dot:'bg-amber-500'},
            { val:'students',  label:'All Students',      count: allStudents.length,      dot:'' },
            { val:'centers',   label:'Centers',           count: centers.length,          dot:'' },
          ].map(({ val, label, count, dot }) => (
            <TabsTrigger key={val} value={val}
              className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm py-2 px-3 flex items-center gap-1.5">
              {label}
              {count > 0 && (
                <span className={`text-xs font-bold rounded-full h-4.5 min-w-[18px] flex items-center justify-center px-1 ${dot ? `${dot} text-white` : 'bg-slate-200 text-slate-600'}`} style={{fontSize:'10px'}}>
                  {count}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Review Tab ─────────────────────────────────── */}
        <TabsContent value="review" className="space-y-2 mt-4">
          {pending.length===0 ? <EmptyState icon={CheckCircle2} message="No applications pending review"/> :
          pending.map(s=>(
            <StudentCard key={s._id} s={s} accent="border-blue-200" onClick={()=>setStudentModal(s)} feePayment={studentFeeMap[String(s._id)]} accMap={payAccounts} requestDate={getStudentSubmittedAt(s)}>
              <Button size="sm" variant="ghost" onClick={()=>setStudentModal(s)} className="h-8 w-8 p-0 text-slate-400 hover:text-indigo-600">
                <Eye className="h-4 w-4"/>
              </Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs"
                onClick={()=>{setActionOpen({student:s,action:'approve'});setNote('');}}>
                Approve
              </Button>
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 h-8 text-xs"
                onClick={()=>{setActionOpen({student:s,action:'changes'});setNote('');}}>
                Changes
              </Button>
              <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 h-8 text-xs"
                onClick={()=>{setActionOpen({student:s,action:'reject'});setNote('');}}>
                Reject
              </Button>
              <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 h-8 text-xs"
                onClick={(e)=>{e.stopPropagation(); dismiss(`student:${s._id}:review`);}}>
                <Trash2 className="h-3.5 w-3.5 mr-1"/>Delete
              </Button>
            </StudentCard>
          ))}
        </TabsContent>

        {/* ── Acct Rejected Tab ──────────────────────────── */}
        <TabsContent value="acctreject" className="space-y-2 mt-4">
          <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3">
            <div className="h-5 w-5 rounded-full bg-red-200 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-red-700 text-xs font-bold">!</span>
            </div>
            <p className="text-xs text-red-700">The accountant has rejected these applications. Please decide whether to send back to center or re-forward to accountant.</p>
          </div>
          {acctRejected.length===0 ? <EmptyState icon={XCircle} message="No rejected applications"/> :
          acctRejected.map(s=>(
            <StudentCard key={s._id} s={s} accent="border-red-200" onClick={()=>setStudentModal(s)}>
              <Button size="sm" variant="ghost" onClick={()=>setStudentModal(s)} className="h-8 w-8 p-0 text-slate-400 hover:text-indigo-600">
                <Eye className="h-4 w-4"/>
              </Button>
              <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50 h-8 text-xs"
                onClick={()=>{setActionOpen({student:s,action:'reforward'});setNote('');}}>
                Re-forward
              </Button>
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 h-8 text-xs"
                onClick={()=>{setActionOpen({student:s,action:'sendToCenter'});setNote('');}}>
                Send to Center
              </Button>
              <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50 h-8 text-xs"
                onClick={()=>{setActionOpen({student:s,action:'sendToCenterFinal'});setNote(s.rejectionReason||'');}}>
                Cancel → Center
              </Button>
            </StudentCard>
          ))}
        </TabsContent>

        {/* ── Doc Requests Tab ───────────────────────────── */}
        <TabsContent value="docs" className="space-y-2 mt-4">
          <TabHint>New document requests from centers — forward to accountant for fee approval.</TabHint>
          {newDocs.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newDocs.length > 0 && newDocs.every(d => selectedDocIds.includes(String(d._id)))}
                  onChange={e => setSelectedDocIds(e.target.checked ? newDocs.map(d => String(d._id)) : [])}
                  className="h-4 w-4 accent-indigo-600"
                />
                Select all document requests
              </label>
              <Button size="sm" onClick={() => batchForwardDocs(newDocs, d => docsApi.forward(d._id), 'forwarded to accountant')} disabled={saving || !newDocs.some(d => selectedDocIds.includes(String(d._id)))}>
                <Send className="h-3.5 w-3.5 mr-1"/>Forward Selected
              </Button>
            </div>
          )}
          {newDocs.length===0 ? <EmptyState message="No new document requests"/> :
          newDocs.map(d=>(
            <DocCard key={d._id} d={d} paySummary={docPayments[d.student?._id]} accMap={payAccounts}
              accent="border-indigo-200"
              badge={d.status?.replace(/_/g,' ')}
              badgeColor={DOC_COLORS[d.status]||'bg-slate-100 text-slate-600'}
              onClick={()=>setDocModal(d)}>
              {d.status==='Requested'&&(
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedDocIds.includes(String(d._id))}
                    onChange={() => toggleDocSelection(d._id)}
                    className="h-4 w-4 accent-indigo-600"
                    aria-label={`Select ${d.name}`}
                  />
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-xs h-8"
                    onClick={e=>{e.stopPropagation();forwardDoc(d);}}>
                    <Send className="h-3.5 w-3.5 mr-1.5"/>Forward
                  </Button>
                  <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 text-xs h-8"
                    onClick={e=>{e.stopPropagation(); setDocChangeDialog(d); setDocChangeNote('');}}>
                    Changes
                  </Button>
                  <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 text-xs h-8"
                    onClick={e=>{e.stopPropagation(); dismiss(`doc:${d._id}:request`);}}>
                    <Trash2 className="h-3.5 w-3.5 mr-1"/>Delete
                  </Button>
                </div>
              )}
            </DocCard>
          ))}
        </TabsContent>

        {/* ── Fee Payments Tab ───────────────────────────── */}
        <TabsContent value="feepay" className="space-y-2 mt-4">
          <TabHint>Center has submitted fee payment — review and forward to accountant for verification.</TabHint>
          {visibleFeePayments.length===0 ? <EmptyState icon={IndianRupee} message="No fee payments pending review"/> :
          visibleFeePayments.map(({student, payment, tx})=>(
            <div key={tx._id} className="bg-white rounded-xl border border-orange-200 shadow-sm hover:shadow transition-shadow">
              <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer" onClick={()=>setStudentModal(student)}>
                  <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center text-sm font-bold text-orange-700 flex-shrink-0 mt-0.5">
                    {student.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Student info */}
                    <div>
                      <div className="font-semibold text-slate-800">{student.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{student.center?.name} · {student.courseName}</span>
                        {student.enrollmentNumber && (
                          <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-xs">
                            {student.enrollmentNumber}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Fee summary */}
                    <div className="flex gap-2 flex-wrap">
                      <span className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1">Net Fee: <span className="font-bold text-slate-700">{fmt(payment.netFee)}</span></span>
                      <span className="text-xs bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1">Paid: <span className="font-bold text-emerald-600">{fmt(payment.paidAmount)}</span></span>
                      {payment.dueAmount > 0 && <span className="text-xs bg-amber-50 border border-amber-200 rounded-md px-2 py-1">Due: <span className="font-bold text-amber-600">{fmt(payment.dueAmount)}</span></span>}
                    </div>

                    {/* Payment details box */}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-emerald-600 text-base">{fmt(tx.amount)}</span>
                        {tx.mode && <span className="text-xs bg-white border border-slate-300 text-slate-600 px-2 py-0.5 rounded-md font-medium">{tx.mode}</span>}
                        {tx.paidAt && <span className="text-xs text-slate-400 ml-auto">📅 {fmtDt(tx.paidAt)}</span>}
                      </div>
                      {tx.mode==='UPI' && tx.upiId && <div className="text-xs text-slate-500">UPI ID: <span className="font-mono font-semibold text-slate-700">{tx.upiId}</span></div>}
                      {tx.utrRef && <div className="text-xs text-slate-500">UTR: <span className="font-mono font-semibold text-slate-700">{tx.utrRef}</span></div>}
                      {tx.mode==='Bank Transfer' && tx.bankName && <div className="text-xs text-slate-500">Bank: <span className="font-semibold text-slate-700">{tx.bankName}</span></div>}
                      {tx.mode==='Bank Transfer' && tx.accountHolder && <div className="text-xs text-slate-500">Account Holder: <span className="font-semibold text-slate-700">{tx.accountHolder}</span></div>}
                      {tx.mode==='Bank Transfer' && tx.accountNumber && <div className="text-xs text-slate-500">Account No: <span className="font-mono font-semibold text-slate-700">{tx.accountNumber}</span></div>}
                      {tx.mode==='Bank Transfer' && tx.ifscCode && <div className="text-xs text-slate-500">IFSC: <span className="font-mono font-semibold text-slate-700">{tx.ifscCode}</span></div>}
                      {tx.note && <div className="text-xs text-slate-400 italic">Note: "{tx.note}"</div>}
                      {tx.paymentScreenshot && (
  <div className="mt-1.5">
    <a href={`${(import.meta.env.VITE_API_URL||'http://localhost:5000/api').replace('/api','')}${tx.paymentScreenshot}`}
      target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-100 transition-colors">
      <Download className="h-3 w-3"/>View Payment Screenshot
    </a>
  </div>
)}
                      <PaidToAccountBox tx={tx} accMap={payAccounts}/>
                      <UtrDuplicateWarning tx={tx}/>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 text-xs h-8"
                    onClick={()=>dismiss(`fee-payment:${student._id}:${tx._id}`)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1"/>Delete
                  </Button>
                  <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 text-xs h-8"
                    onClick={()=>{ setRejectFeeDialog({studentId:student._id, txId:tx._id, studentName:student.name, amount:tx.amount}); setRejectFeeNote(''); }}>
                    <XCircle className="h-3.5 w-3.5 mr-1"/>Reject
                  </Button>
                  <Button size="sm" className="bg-orange-500 hover:bg-orange-600 flex-shrink-0 text-xs h-8"
                    onClick={()=>forwardFeePaymentToAccountant(student._id, tx._id)}>
                    <Send className="h-3.5 w-3.5 mr-1.5"/>Forward
                  </Button>
                </div>
              </div>
              <CardRequestDate date={getPaymentSubmittedAt(tx)} label="Payment submitted"/>
              </div>
            </div>
          ))}
        </TabsContent>

        {/* ── Doc Payments Tab ───────────────────────────── */}
        <TabsContent value="payment" className="space-y-2 mt-4">
          <TabHint>Center has submitted payment — review and forward to accountant for verification.</TabHint>
          {paymentPending.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={paymentPending.length > 0 && paymentPending.every(d => selectedDocIds.includes(String(d._id)))}
                  onChange={e => setSelectedDocIds(e.target.checked ? paymentPending.map(d => String(d._id)) : [])}
                  className="h-4 w-4 accent-indigo-600"
                />
                Select all payment requests
              </label>
              <Button size="sm" onClick={() => batchForwardDocs(paymentPending, d => docsApi.forwardPayment(d._id), 'payment requests forwarded to accountant')} disabled={saving || !paymentPending.some(d => selectedDocIds.includes(String(d._id)))}>
                <Send className="h-3.5 w-3.5 mr-1"/>Forward Selected
              </Button>
            </div>
          )}
          {paymentPending.length===0 ? <EmptyState icon={IndianRupee} message="No payments pending review"/> :
          paymentPending.map(d=>(
            <DocCard key={d._id} d={d} paySummary={docPayments[d.student?._id]} accMap={payAccounts}
              accent="border-emerald-200"
              badge="Payment Submitted"
              badgeColor="bg-emerald-50 text-emerald-700 border border-emerald-200"
              onClick={()=>setDocModal(d)}>
              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedDocIds.includes(String(d._id))}
                  onChange={() => toggleDocSelection(d._id)}
                  className="h-4 w-4 accent-indigo-600"
                  aria-label={`Select ${d.name}`}
                />
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs h-8"
                  onClick={e=>{e.stopPropagation();forwardPaymentToAccountant(d);}}>
                  <Send className="h-3.5 w-3.5 mr-1.5"/>Forward
                </Button>
                <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 text-xs h-8"
                  onClick={e=>{e.stopPropagation(); dismiss(`doc:${d._id}:payment`);}}>
                  <Trash2 className="h-3.5 w-3.5 mr-1"/>Delete
                </Button>
              </div>
            </DocCard>
          ))}
        </TabsContent>

        {/* ── From Dispatch Tab ──────────────────────────── */}
        <TabsContent value="dispatch" className="space-y-2 mt-4">
          <TabHint>Scanned documents from Dispatch — review and forward to center.</TabHint>
          {fromDisp.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={fromDisp.length > 0 && fromDisp.every(d => selectedDocIds.includes(String(d._id)))}
                  onChange={e => setSelectedDocIds(e.target.checked ? fromDisp.map(d => String(d._id)) : [])}
                  className="h-4 w-4 accent-indigo-600"
                />
                Select all scanned documents
              </label>
              <Button size="sm" onClick={() => batchForwardDocs(fromDisp, d => docsApi.forwardToCenter(d._id), 'forwarded to center')} disabled={saving || !fromDisp.some(d => selectedDocIds.includes(String(d._id)))}>
                <Send className="h-3.5 w-3.5 mr-1"/>Forward Selected
              </Button>
            </div>
          )}
          {fromDisp.length===0 ? <EmptyState icon={Download} message="No documents from dispatch"/> :
          fromDisp.map(d=>(
            <DocCard key={d._id} d={d} paySummary={docPayments[d.student?._id]} accMap={payAccounts}
              accent="border-violet-200"
              badge="Scan Ready"
              badgeColor="bg-violet-50 text-violet-700 border border-violet-200"
              onClick={()=>setDocModal(d)}>
              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedDocIds.includes(String(d._id))}
                  onChange={() => toggleDocSelection(d._id)}
                  className="h-4 w-4 accent-indigo-600"
                  aria-label={`Select ${d.name}`}
                />
                <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-xs h-8"
                  onClick={e=>{e.stopPropagation();forwardDocToCenter(d);}}>
                  <Send className="h-3.5 w-3.5 mr-1.5"/>Forward to Center
                </Button>
                <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 text-xs h-8"
                  onClick={e=>{e.stopPropagation(); dismiss(`doc:${d._id}:dispatch`);}}>
                  <Trash2 className="h-3.5 w-3.5 mr-1"/>Delete
                </Button>
              </div>
            </DocCard>
          ))}
        </TabsContent>

        {/* ── Delivery Pending Tab ───────────────────────── */}
<TabsContent value="delipend" className="space-y-2 mt-4">
  <TabHint>Documents dispatched to center — awaiting center confirmation of receipt.</TabHint>
  {deliveryPending.length===0 ? <EmptyState icon={CheckCircle2} message="No pending deliveries"/> :
  deliveryPending.map(d=>(
    <DocCard key={d._id} d={d} paySummary={docPayments[d.student?._id]} accMap={payAccounts}
      accent="border-rose-200"
      badge="Delivery Pending"
      badgeColor="bg-rose-50 text-rose-700 border border-rose-200"
      onClick={()=>setDocModal(d)}>
      <div className="flex flex-col items-end gap-1">
        <span className="text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full flex items-center gap-1">
          📦 Awaiting Receipt
        </span>
        {d.courierInfo && (d.courierInfo.trackingNo || d.courierInfo.company || d.courierInfo.dispatchDate) && (
          <span className="text-xs text-slate-400 font-mono">
            {[d.courierInfo.company, d.courierInfo.trackingNo, d.courierInfo.dispatchDate ? new Date(d.courierInfo.dispatchDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : ''].filter(Boolean).join(' · ')}
          </span>
        )}
        <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 text-xs h-8"
          onClick={e=>{e.stopPropagation(); dismiss(`doc:${d._id}:delivery`);}}>
          <Trash2 className="h-3.5 w-3.5 mr-1"/>Delete
        </Button>
      </div>
    </DocCard>
  ))}
</TabsContent>

        {/* ── Settlement Requests Tab ────────────────────── */}
        <TabsContent value="settlement" className="space-y-3 mt-4">
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5"/>
            <p className="text-sm text-amber-700">
              Centers have requested settlement for these cancelled applications. Review each case and forward to accountant if the refund/adjustment should be processed.
            </p>
          </div>
          {visibleSettlementQueue.length === 0
            ? <EmptyState icon={CheckCircle2} message="No pending settlement requests"/>
            : visibleSettlementQueue.map(s => (
              <div key={s._id} className="space-y-2">
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => dismiss(`student:${s._id}:settlement`)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1"/>Delete
                  </Button>
                </div>
                <SettlementRequestCard
                  student={s}
                  saving={saving}
                  onForward={handleForwardSettlement}
                />
              </div>
            ))
          }
        </TabsContent>

        {/* ── All Students Tab ───────────────────────────── */}
        <TabsContent value="students" className="space-y-3 mt-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"/>
            <Input className="pl-10 border-slate-200 bg-white h-10 text-sm placeholder:text-slate-400"
              placeholder="Search by name, phone, enrollment, center, course…"
              value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          {filtered.length === 0 && search && (
            <p className="text-center text-sm text-slate-400 py-6">No students matching "{search}"</p>
          )}
          <div className="space-y-1.5">
            {filtered.map(s=>(
              <div key={s._id}
                className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all group"
                onClick={()=>navigate(`/students/${s._id}`)}>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 flex-shrink-0">
                    {s.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-slate-800">{s.name}</div>
                    <div className="text-xs text-slate-400">{s.center?.name} · {s.courseName||'—'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${STATUS_COLORS[s.applicationStatus]||'bg-slate-100 text-slate-600'}`}>{s.applicationStatus?.replace(/_/g,' ')}</span>
                  {s.enrollmentNumber&&(
                    <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      {s.enrollmentNumber}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors"/>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Centers Tab ────────────────────────────────── */}
        <TabsContent value="centers" className="space-y-2 mt-4">
          {centers.map(c=>(
            <div key={c._id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow transition-all cursor-pointer group"
              onClick={()=>setCenterModal(c)}>
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-5 w-5 text-slate-500"/>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">{c.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{c.city}{c.state?`, ${c.state}`:''}</div>
                    {c.assignedCounselor?.name && (
                      <div className="text-xs text-indigo-600 font-medium mt-0.5 flex items-center gap-1">
                        <Users className="h-3 w-3"/>Counselor: {c.assignedCounselor.name}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2.5 text-slate-400">
                  <div className="text-right">
                    <div className="text-base font-bold text-slate-700">
                      {allStudents.filter(s=>String(s.center?._id||s.center)===String(c._id)).length}
                    </div>
                    <div className="text-xs">students</div>
                  </div>
                  <ChevronRight className="h-4 w-4 group-hover:text-slate-600 transition-colors"/>
                </div>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      {/* Action Dialog */}
      <Dialog open={!!actionOpen} onOpenChange={()=>setActionOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-slate-800">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                actionOpen?.action==='approve'          ? 'bg-emerald-100' :
                actionOpen?.action==='reject'           ? 'bg-red-100' :
                actionOpen?.action==='reforward'        ? 'bg-blue-100' :
                actionOpen?.action==='sendToCenterFinal'? 'bg-red-100' :
                'bg-amber-100'
              }`}>
                {actionOpen?.action==='approve'          ? <CheckCircle2 className="h-4 w-4 text-emerald-600"/> :
                 actionOpen?.action==='reject'           ? <XCircle className="h-4 w-4 text-red-600"/> :
                 actionOpen?.action==='reforward'        ? <RotateCcw className="h-4 w-4 text-blue-600"/> :
                 actionOpen?.action==='sendToCenterFinal'? <XCircle className="h-4 w-4 text-red-600"/> :
                 <Send className="h-4 w-4 text-amber-600"/>}
              </div>
              <span>
                {actionOpen?.action==='approve'?'Approve':
                 actionOpen?.action==='reject'?'Reject':
                 actionOpen?.action==='reforward'?'Re-forward':
                 actionOpen?.action==='sendToCenter'?'Send to Center':
                 actionOpen?.action==='sendToCenterFinal'?'Cancel → Send to Center':
                 'Request Changes'}: {actionOpen?.student?.name}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            Center: <span className="font-semibold text-slate-700">{actionOpen?.student?.center?.name}</span>
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Note {(actionOpen?.action==='reject'||actionOpen?.action==='changes'||actionOpen?.action==='sendToCenter'||actionOpen?.action==='sendToCenterFinal')?'*':'(optional)'}
            </Label>
            <Textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} className="mt-1 border-slate-200 resize-none"/>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setActionOpen(null)} className="border-slate-200 text-slate-600">Cancel</Button>
            <Button className={
              actionOpen?.action==='approve'          ? 'bg-emerald-600 hover:bg-emerald-700' :
              actionOpen?.action==='reject'           ? 'bg-red-600 hover:bg-red-700' :
              actionOpen?.action==='reforward'        ? 'bg-blue-600 hover:bg-blue-700' :
              actionOpen?.action==='sendToCenterFinal'? 'bg-red-600 hover:bg-red-700' :
              'bg-amber-500 hover:bg-amber-600'
            } onClick={doAction} disabled={saving}>
              {saving&&<Loader2 className="h-4 w-4 mr-1.5 animate-spin"/>}Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modals */}
      {studentModal && <StudentModal student={studentModal} onClose={()=>setStudentModal(null)}/>}
      {centerModal  && <CenterModal  center={centerModal}   onClose={()=>setCenterModal(null)}/>}
      {docModal     && <DocModal doc={docModal} onClose={()=>setDocModal(null)} onForward={forwardDoc} onForwardToCenter={forwardDocToCenter} onForwardPayment={forwardPaymentToAccountant} accMap={payAccounts}/>}

      <Dialog open={!!docChangeDialog} onOpenChange={()=>{ setDocChangeDialog(null); setDocChangeNote(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Document Request Back</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {docChangeDialog?.name} {docChangeDialog?.student?.name ? `- ${docChangeDialog.student.name}` : ''}
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Changes Required *</Label>
              <Textarea
                className="mt-1 border-slate-200"
                rows={3}
                placeholder="Explain what the center needs to correct..."
                value={docChangeNote}
                onChange={e => setDocChangeNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>{ setDocChangeDialog(null); setDocChangeNote(''); }}>Cancel</Button>
            <Button className="bg-amber-500 hover:bg-amber-600" onClick={requestDocChanges} disabled={!docChangeNote.trim()}>
              Send Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={centerSwitchOpen} onOpenChange={setCenterSwitchOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-indigo-600"/>Switch to Center Dashboard
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"/>
              <Input
                className="pl-9"
                placeholder="Search center name..."
                value={centerSwitchSearch}
                onChange={e=>setCenterSwitchSearch(e.target.value)}
              />
            </div>
            <div className="max-h-80 overflow-y-auto space-y-2">
              {switchCenters.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
                  No center found
                </div>
              ) : switchCenters.map(center => (
                <button
                  key={center._id}
                  type="button"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-indigo-300 hover:bg-indigo-50"
                  onClick={() => {
                    switchToCenter(center);
                    setCenterSwitchOpen(false);
                    setCenterSwitchSearch('');
                    navigate('/center');
                  }}
                >
                  <div className="font-semibold text-slate-800">{center.name || center.organisationName}</div>
                  <div className="text-xs text-slate-500">
                    {[center.organisationName && center.organisationName !== center.name ? center.organisationName : '', center.city, center.state].filter(Boolean).join(' · ')}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Fee Payment Dialog */}
      <Dialog open={!!rejectFeeDialog} onOpenChange={()=>{ setRejectFeeDialog(null); setRejectFeeNote(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="h-5 w-5"/>Reject Fee Payment
            </DialogTitle>
          </DialogHeader>
          {rejectFeeDialog && (
            <div className="space-y-3">
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
                <span className="font-semibold text-slate-800">{rejectFeeDialog.studentName}</span>
                <span className="text-slate-500 ml-2">· ₹{Number(rejectFeeDialog.amount||0).toLocaleString('en-IN')}</span>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Reason for Rejection *</Label>
                <Textarea
                  className="mt-1 border-slate-200 focus:border-red-400"
                  rows={3}
                  placeholder="Tell center what's wrong and what to correct…"
                  value={rejectFeeNote}
                  onChange={e => setRejectFeeNote(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={()=>{ setRejectFeeDialog(null); setRejectFeeNote(''); }}>Cancel</Button>
            <Button variant="destructive" onClick={rejectFeePayment} disabled={!rejectFeeNote.trim()}>
              <XCircle className="h-4 w-4 mr-1.5"/>Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

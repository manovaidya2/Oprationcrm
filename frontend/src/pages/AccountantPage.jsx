import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, IndianRupee, CheckCircle2, XCircle, Clock, Eye,
  Paperclip, History, User, Calendar, Hash, Search, X, Send, Download, Trash2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { studentsApi, docsApi, paymentsApi, paymentAccountsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { usePanelDismissals } from '@/lib/usePanelDismissals';

const MEDIA = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
const fmt   = n => `₹${(Number(n)||0).toLocaleString('en-IN')}`;
const fmtDt = d => d ? new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
const fmtD  = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

const getStudentSubmittedAt = student => {
  const submittedEntry = [...(student?.statusHistory || [])].reverse().find(h => h.status === 'Submitted');
  return submittedEntry?.at || student?.submittedAt || student?.createdAt;
};

const getPaymentSubmittedAt = tx => tx?.createdAt || tx?.submittedAt || tx?.paidAt;

function CardRequestDate({ date, label = 'Submitted' }) {
  if (!date) return null;
  return (
    <div className="mt-3 flex justify-end text-xs font-medium text-muted-foreground">
      {label}: {fmtD(date)}
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

// Full payment detail display
function PaymentInfo({ tx, className = '' }) {
  if (!tx) return null;
  const isUPI  = tx.mode === 'UPI';
  const isBank = tx.mode === 'Bank Transfer';
  return (
    <div className={`space-y-0.5 ${className}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-emerald-700">{fmt(tx.amount)}</span>
        {tx.mode && <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">via {tx.mode}</span>}
        {tx.paidToAccountLabel && <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-medium">→ {tx.paidToAccountLabel}</span>}
        {tx.paidAt && <span className="text-xs text-muted-foreground">{fmtD(tx.paidAt)}</span>}
      </div>
      {isUPI && tx.upiId    && <div className="text-xs text-muted-foreground">UPI ID: <b>{tx.upiId}</b></div>}
      {tx.utrRef             && <div className="text-xs text-muted-foreground">UTR: <b className="font-mono">{tx.utrRef}</b></div>}
      {isBank && tx.bankName      && <div className="text-xs text-muted-foreground">Bank: <b>{tx.bankName}</b></div>}
      {isBank && tx.accountHolder  && <div className="text-xs text-muted-foreground">Account Holder: <b>{tx.accountHolder}</b></div>}
      {isBank && tx.accountNumber  && <div className="text-xs text-muted-foreground">Account No: <b>{tx.accountNumber}</b></div>}
      {isBank && tx.ifscCode       && <div className="text-xs text-muted-foreground">IFSC: <b>{tx.ifscCode}</b></div>}
      {tx.note && <div className="text-xs text-muted-foreground">Note: {tx.note}</div>}
      <UtrDuplicateWarning tx={tx}/>
      {tx.paidToAccountLabel && (
        <div className="mt-1 bg-indigo-50 border border-indigo-200 rounded px-2.5 py-1.5">
          <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider mr-1.5">Paid To</span>
          <span className="text-xs font-semibold text-indigo-800">{tx.paidToAccountLabel}</span>
        </div>
      )}
    </div>
  );
}

function FeePaymentPanel({ payment, status = 'pending_accountant', accMap = {} }) {
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

const STATUS_C = {
  Counselor_Approved:'bg-indigo-100 text-indigo-700',
  Accountant_Pending:'bg-amber-100 text-amber-700',
  Sent_To_University:'bg-purple-100 text-purple-700',
  University_Rejected:'bg-orange-100 text-orange-700',
  Enrolled:'bg-emerald-100 text-emerald-700',
};

// ── Student detail modal ─────────────────────────────────────
function StudentDetailModal({ student, onClose }) {
  const [fullStudent, setFullStudent] = useState(student);
  const [payment, setPayment] = useState(null);
  const [docs,    setDocs]    = useState([]);
  useEffect(() => {
    if (!student) return;
    // Fetch fresh to get submissionDocs + all populated fields
    studentsApi.getOne(student._id).then(s => { if (s) setFullStudent(s); }).catch(() => {});
    paymentsApi.get(student._id).then(setPayment).catch(() => {});
    docsApi.list({ studentId: student._id, all: '1' }).then(setDocs).catch(() => {});
  }, [student?._id]);

  const s = fullStudent;
  if (!student) return null;
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {student.name}
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_C[student.applicationStatus]||'bg-gray-100 text-gray-700'}`}>
              {student.applicationStatus?.replace(/_/g,' ')}
            </span>
            {student.enrollmentNumber && <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">{student.enrollmentNumber}</span>}
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="info">
          <TabsList><TabsTrigger value="info">Info</TabsTrigger><TabsTrigger value="fees">Fees & Payments</TabsTrigger><TabsTrigger value="docs">Documents</TabsTrigger></TabsList>
          <TabsContent value="info" className="mt-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
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
                ['University',   s.university?.name || s.universityName || null],
                ['10th %',       s.tenth_percent   ? `${s.tenth_percent}%`   : null],
                ['10th Year',    s.tenth_year      || null],
                ['10th Board',   s.tenth_board     || null],
                ['12th %',       s.twelfth_percent ? `${s.twelfth_percent}%` : null],
                ['12th Year',    s.twelfth_year    || null],
                ['12th Board',   s.twelfth_board   || null],
              ].filter(([,v])=>v).map(([l,v])=>(
                <div key={l} className="bg-muted/30 rounded px-3 py-1.5"><div className="text-xs text-muted-foreground">{l}</div><div className="font-medium mt-0.5 break-words">{v}</div></div>
              ))}
            </div>
            {s.submissionDocs?.length>0&&(
              <div className="mt-3 bg-muted/20 rounded-lg p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Submitted Documents:</p>
                <div className="flex flex-wrap gap-1.5">
                  {s.submissionDocs.map((d,i)=>(
                    <span key={i} className="text-xs flex items-center gap-1 bg-background border rounded px-2 py-0.5">
                      <Paperclip className="h-3 w-3 text-muted-foreground"/>
                      {d.fileUrl?<a href={`${MEDIA}${d.fileUrl}`} target="_blank" rel="noreferrer" className="text-blue-600 underline">{d.name}</a>:<span>{d.name}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
          <TabsContent value="fees" className="mt-3">
            {payment?(
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  {[['Total',fmt(payment.totalFee),''],['Discount',fmt(payment.discount),'text-amber-600'],['Net',fmt(payment.netFee),'text-blue-600'],['Paid',fmt(payment.paidAmount),'text-emerald-600']].map(([l,v,c])=>(
                    <div key={l} className="bg-muted/30 rounded px-2 py-2 text-center"><div className={`font-bold text-sm ${c}`}>{v}</div><div className="text-xs text-muted-foreground">{l}</div></div>
                  ))}
                </div>
                <div className={`rounded-lg px-3 py-2 text-sm flex justify-between ${payment.dueAmount>0?'bg-amber-50 border border-amber-200':'bg-emerald-50 border border-emerald-200'}`}>
                  <span>Balance Due:</span><span className={`font-bold ${payment.dueAmount>0?'text-amber-700':'text-emerald-700'}`}>{fmt(payment.dueAmount)}</span>
                </div>
                {payment.transactions?.length>0&&(
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Payment History:</p>
                    {[...payment.transactions].reverse().map(tx=>(
                      <div key={tx._id} className="text-xs flex gap-2 bg-muted/30 rounded px-2 py-1.5 items-center flex-wrap">
                        <span className="font-medium text-emerald-700">{fmt(tx.amount)}</span>
                        <PaymentInfo tx={tx} className="contents"/>
                        <span className="ml-auto">{fmtD(tx.paidAt)}</span>
                        {tx.verificationStatus==='verified'&&<span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ Verified</span>}
                        {tx.verificationStatus==='rejected'&&<span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">✗ Rejected</span>}
                        {tx.verificationStatus==='pending_accountant'&&<span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ):<p className="text-sm text-muted-foreground">No fee structure</p>}
          </TabsContent>
          <TabsContent value="docs" className="mt-3 space-y-4">
            {/* Submission Documents — files uploaded by Center */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5"/> Submitted by Center ({s.submissionDocs?.length || 0})
              </p>
              {s.submissionDocs?.length > 0 ? (
                <div className="space-y-1.5">
                  {s.submissionDocs.map((d, i) => (
                    <div key={i} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0"/>
                        <span className="truncate font-medium">{d.name}</span>
                        {d.sizeKb > 0 && <span className="text-xs text-muted-foreground shrink-0">{d.sizeKb}KB</span>}
                      </div>
                      {d.fileUrl
                        ? <a href={`${MEDIA}${d.fileUrl}`} target="_blank" rel="noreferrer"
                            className="text-xs text-blue-600 underline shrink-0 ml-2">View</a>
                        : <span className="text-xs text-muted-foreground shrink-0 ml-2">No file</span>
                      }
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No documents submitted</p>
              )}
            </div>
            {/* Document Requests */}
            {docs.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Document Requests ({docs.length})</p>
                <div className="space-y-1.5">
                  {docs.map(d=>(
                    <div key={d._id} className="border rounded-lg px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 mb-1"><span className="font-medium">{d.name}</span><span className="text-xs bg-muted px-1.5 py-0.5 rounded">{d.status?.replace(/_/g,' ')}</span></div>
                      {(d.chargeFee>0||d.totalPaid>0)&&<div className="text-xs">Charge: {fmt(d.chargeFee)} · Paid: <span className="text-emerald-600">{fmt(d.totalPaid)}</span></div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
          
        </Tabs>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Verified record detail modal ──────────────────────────────
function VerifiedRecordModal({ record, onClose }) {
  if (!record) return null;
  const isFee = record.type === 'fee_payment';
  const isAdm = record.type === 'admission';
  const isDoc = record.type === 'doc_fee';
  const isDocPay = record.type === 'doc_payment';

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600"/>
            {isFee && 'Fee Payment Verified'}
            {isAdm && 'Admission Forwarded'}
            {isDoc && 'Doc Fee Approved'}
            {isDocPay && 'Doc Payment Verified'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {/* Student / Entity info */}
          <div className="bg-muted/30 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-base">{record.studentName || record.entityName}</span>
              {record.enrollmentNumber && <span className="text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">{record.enrollmentNumber}</span>}
            </div>
            {record.centerName && <div className="text-muted-foreground">{record.centerName}</div>}
            {record.courseName && <div className="text-muted-foreground">{record.courseName}</div>}
          </div>

          {/* Payment details */}
          {(isFee || isDocPay) && (
            <div className="border rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment Details</p>
              <div className="grid grid-cols-2 gap-2">
                <div><div className="text-xs text-muted-foreground">Amount</div><div className="font-bold text-emerald-700">{fmt(record.amount)}</div></div>
                <div><div className="text-xs text-muted-foreground">Mode</div><div className="font-medium">{record.mode || '—'}</div></div>
                <div className="col-span-2"><PaymentInfo tx={record}/></div>
                <div><div className="text-xs text-muted-foreground">Payment Date</div><div className="font-medium">{fmtD(record.paidAt)}</div></div>
                {record.docName && <div><div className="text-xs text-muted-foreground">Document</div><div className="font-medium">{record.docName}</div></div>}
              </div>
            </div>
          )}

          {/* Admission details */}
          {isAdm && (
            <div className="border rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Admission Details</p>
              <div className="text-sm">Status moved to: <span className="font-medium text-purple-700">Sent to University</span></div>
              {record.note && <div className="text-sm text-muted-foreground">Note: {record.note}</div>}
            </div>
          )}

          {/* Verification audit */}
          <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5"/>Verification Audit
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3"/>Verified By</div>
                <div className="font-medium">{record.verifiedBy || 'Accountant'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3"/>Verified At</div>
                <div className="font-medium">{fmtDt(record.verifiedAt)}</div>
              </div>
            </div>
            {record.verificationNote && (
              <div><div className="text-xs text-muted-foreground">Note</div><div className="font-medium">{record.verificationNote}</div></div>
            )}
            <div>
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Hash className="h-3 w-3"/>Record ID</div>
              <div className="text-xs font-mono text-muted-foreground">{record.id}</div>
            </div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Paid To Account Detail Box ────────────────────────────────
function PaidToAccountBox({ tx, accMap }) {
  if (!tx?.paidToAccount && !tx?.paidToAccountLabel) return null;
  const acc = accMap?.[String(tx.paidToAccount)];
  const label = acc?.label || tx.paidToAccountLabel || '';
  const isUPI = (acc?.mode || tx.mode) === 'UPI';
  const isBank = (acc?.mode) === 'Bank Transfer';
  return (
    <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2.5 space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Paid To</span>
        <span className="text-sm font-semibold text-indigo-800">{label}</span>
        {acc?.mode && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isUPI ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{acc.mode}</span>}
      </div>
      {acc ? (
        <div className="space-y-0.5 text-xs text-indigo-700">
          {isUPI && acc.upiId    && <div>UPI ID: <span className="font-mono font-bold">{acc.upiId}</span></div>}
          {isUPI && acc.upiName  && <div>Name: <span className="font-semibold">{acc.upiName}</span></div>}
          {isBank && acc.bankName       && <div>Bank: <span className="font-semibold">{acc.bankName}</span></div>}
          {isBank && acc.accountHolder  && <div>Account Holder: <span className="font-semibold">{acc.accountHolder}</span></div>}
          {isBank && acc.accountNumber  && <div>Account No: <span className="font-mono font-bold">{acc.accountNumber}</span></div>}
          {isBank && acc.ifscCode       && <div>IFSC: <span className="font-mono font-semibold">{acc.ifscCode}</span></div>}
          {isBank && acc.branch         && <div>Branch: <span className="font-semibold">{acc.branch}</span></div>}
        </div>
      ) : (
        <div className="text-xs text-indigo-600">{label}</div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function AccountantPage() {
  const { user } = useAuth();
  const { dismiss, isDismissed } = usePanelDismissals(user, 'accountant');
  const [students,    setStudents]    = useState([]);
  const [uniRejected, setUniRejected] = useState([]);
  const [amountSettleQueue, setAmountSettleQueue] = useState([]);
  const [docs,        setDocs]        = useState([]);
  const [payDocs,     setPayDocs]     = useState([]);
  const [feePayments, setFeePayments] = useState([]);   // only pending
  const [allFeePayments, setAllFeePayments] = useState([]); // pending + verified + rejected
  const [allPayDocs, setAllPayDocs] = useState([]);     // all doc payments (any verification status)
  const [scanDocs,    setScanDocs]    = useState([]);
  const [history,     setHistory]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [studentPayMap, setStudentPayMap] = useState({});
  const [admissionFeeMap, setAdmissionFeeMap] = useState({});
  const [payAccounts, setPayAccounts] = useState({}); // id → account object
  const [dialog,      setDialog]      = useState(null);
  const [detailStudent, setDetailStudent] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [search, setSearch] = useState('');
  const [note,   setNote]   = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [allS, allD, accs] = await Promise.all([studentsApi.getAll(), docsApi.list({ all: '1' }), paymentAccountsApi.list().catch(()=>[])]);
      // Build id→account map for quick lookup
      const accMap = {};
      accs.forEach(a => { accMap[String(a._id)] = a; });
      setPayAccounts(accMap);

      setStudents(allS.filter(s => ['Counselor_Approved','Accountant_Pending'].includes(s.applicationStatus)));
      // Uni Rejected tab: both currently University_Rejected AND those forwarded to counselor (rejectedVia=university)
      setUniRejected(allS.filter(s =>
        s.applicationStatus === 'University_Rejected' ||
        (s.applicationStatus === 'Accountant_Rejected' && s.rejectedVia === 'university')
      ));
      // Amount Settle tab: Rejected students + Cancelled students forwarded by counselor to accountant
      setAmountSettleQueue(allS.filter(s => {
        if (s.applicationStatus === 'Rejected') return true;
        if (s.applicationStatus !== 'Cancelled') return false;
        // Primary check
        if (s.settlementForwardedToAccountant) return true;
        // Fallback: check statusHistory for 'Settlement_Forwarded' entry
        return (s.statusHistory || []).some(h => h.status === 'Settlement_Forwarded');
      }));
      setDocs(allD.filter(d => ['Forwarded','Fee_Pending'].includes(d.status)));
      setScanDocs(allD.filter(d => d.status === 'Accountant_Received'));
      setPayDocs(allD.filter(d => d.status === 'Payment_Submitted'));
      setAllPayDocs(allD.filter(d =>
        ['Payment_Submitted','Payment_Verified','Center_Notified','Fee_Rejected'].includes(d.status) &&
        d.payments?.length > 0
      ));

      // Build complete history from all sources
      const hist = [];

      // ACTION LABELS for student statusHistory entries
      const ACTION_CONFIG = {
        'Sent_To_University':  { label: 'Sent to University',        badge: 'bg-purple-100 text-purple-700',  icon: '🎓' },
        'University_Rejected': { label: 'Rejected by University',    badge: 'bg-orange-100 text-orange-700',  icon: '🏫' },
        'Accountant_Rejected': { label: 'Forwarded to Counselor',    badge: 'bg-red-100 text-red-700',        icon: '↩' },
        'Accountant_Pending':  { label: 'Kept Pending',              badge: 'bg-amber-100 text-amber-700',    icon: '⏳' },
        'Counselor_Approved':  { label: 'Received from Counselor',   badge: 'bg-indigo-100 text-indigo-700',  icon: '📥' },
        'Enrolled':            { label: 'Enrolled by University',    badge: 'bg-emerald-100 text-emerald-700',icon: '✅' },
        'Rejected':            { label: 'Rejected → Center',         badge: 'bg-red-100 text-red-700',        icon: '✗' },
        'Changes_Requested':   { label: 'Changes Requested → Center',badge: 'bg-amber-100 text-amber-700',    icon: '✏' },
        'Submitted':           { label: 'Submitted by Center',       badge: 'bg-blue-100 text-blue-700',      icon: '📤' },
      };
      // All statuses to show in accountant history
      const ACCOUNTANT_RELEVANT = new Set([
        'Sent_To_University', 'University_Rejected', 'Accountant_Rejected',
        'Accountant_Pending', 'Counselor_Approved',  'Enrolled',
        'Rejected', 'Changes_Requested',
      ]);

      // 1. Per-action entries from each student's statusHistory
      allS.forEach(s => {
        const entries = s.statusHistory || [];

        if (entries.length === 0) {
          // Fallback for students with no statusHistory — create one entry from current status
          if (ACCOUNTANT_RELEVANT.has(s.applicationStatus)) {
            hist.push({
              id: `${s._id}-fallback`,
              type: 'student_action',
              actionStatus: s.applicationStatus,
              actionConfig: ACTION_CONFIG[s.applicationStatus] || { label: s.applicationStatus.replace(/_/g,' '), badge: 'bg-slate-100 text-slate-700', icon: '•' },
              studentId: s._id,
              studentName: s.name,
              centerName: s.center?.name,
              courseName: s.courseName,
              universityName: s.university?.name || s.universityName,
              enrollmentNumber: s.enrollmentNumber,
              note: s.rejectionReason || s.changesRequested || '',
              doneBy: '—',
              doneByRole: '',
              at: s.updatedAt,
              _sortKey: new Date(s.updatedAt || 0),
            });
          }
          return;
        }

        entries.forEach((entry, idx) => {
          if (!ACCOUNTANT_RELEVANT.has(entry.status)) return;
          hist.push({
            id: `${s._id}-sh-${idx}`,
            type: 'student_action',
            actionStatus: entry.status,
            actionConfig: ACTION_CONFIG[entry.status] || { label: entry.status.replace(/_/g,' '), badge: 'bg-slate-100 text-slate-700', icon: '•' },
            studentId: s._id,
            studentName: s.name,
            centerName: s.center?.name,
            courseName: s.courseName,
            universityName: s.university?.name || s.universityName,
            enrollmentNumber: s.enrollmentNumber,
            note: entry.note || '',
            doneBy: entry.changedBy?.name || entry.role || '—',
            doneByRole: entry.role || '',
            at: entry.at,
            _sortKey: new Date(entry.at || 0),
          });
        });
      });

      // 2. Doc fees approved
      allD.filter(d => ['Fee_Approved','Sent_To_University','Dispatched','Delivered','Payment_Verified'].includes(d.status)).forEach(d => {
        const approvalEntry = (d.statusHistory||[]).slice().reverse().find(h => h.status === 'Fee_Approved');
        hist.push({
          id: d._id, type: 'doc_fee',
          entityName: d.name, studentName: d.student?.name, centerName: d.center?.name,
          chargeFee: d.chargeFee, totalPaid: d.totalPaid,
          docType: d.type,
          verifiedBy: approvalEntry?.changedBy?.name || 'Accountant',
          verifiedAt: approvalEntry?.at || d.updatedAt,
          verificationNote: approvalEntry?.note || '',
          status: d.status,
          _sortKey: new Date(approvalEntry?.at || d.updatedAt),
        });
      });

      // Doc payments verified
      allD.filter(d => d.status === 'Payment_Verified').forEach(d => {
        (d.payments||[]).filter(p => p.verified).forEach(p => {
          hist.push({
            id: `${d._id}-${p._id}`, type: 'doc_payment',
            entityName: d.name, studentName: d.student?.name, docName: d.name,
            amount: p.amount, mode: p.mode, utrRef: p.utrRef, upiId: p.upiId,
            bankName: p.bankName, accountHolder: p.accountHolder, accountNumber: p.accountNumber, ifscCode: p.ifscCode,
            paidAt: p.paidAt,
            verifiedBy: p.verifiedBy?.name || 'Accountant', verifiedAt: p.verifiedAt || d.updatedAt,
            verificationNote: '',
            _sortKey: new Date(p.verifiedAt || d.updatedAt),
          });
        });
      });

      // 3. Fee payments — ALL transactions (pending + verified + rejected)
      const pending = [];
      const allFeePayments = [];
      const admissionMap = {};
      await Promise.all(allS.map(async (student) => {
        try {
          const pay = await paymentsApi.get(student._id);
          if (pay) admissionMap[String(student._id)] = pay;
          if (!pay?.transactions?.length) return;
          const relevantTx = pay.transactions.filter(tx =>
            ['pending_accountant','verified','rejected'].includes(tx.verificationStatus)
          );
          if (relevantTx.length === 0) return;
          relevantTx.forEach(tx => {
            const entry = { student, payment: pay, tx };
            allFeePayments.push(entry);
            if (tx.verificationStatus === 'pending_accountant') {
              pending.push(entry);
            }
            if (['verified','rejected'].includes(tx.verificationStatus)) {
              hist.push({
                id: tx._id, type: 'fee_payment',
                studentName: student.name, centerName: student.center?.name, courseName: student.courseName,
                enrollmentNumber: student.enrollmentNumber,
                amount: tx.amount, mode: tx.mode, utrRef: tx.utrRef, upiId: tx.upiId,
                bankName: tx.bankName, accountHolder: tx.accountHolder, accountNumber: tx.accountNumber, ifscCode: tx.ifscCode,
                paidAt: tx.paidAt,
                verifiedBy: tx.verifiedBy?.name || 'Accountant',
                verifiedAt: tx.verifiedAt,
                verificationNote: tx.verificationNote,
                status: tx.verificationStatus,
                _sortKey: new Date(tx.verifiedAt || 0),
              });
            }
          });
        } catch {}
      }));

      pending.sort((a, b) => new Date(b.tx.paidAt || b.tx.createdAt || 0) - new Date(a.tx.paidAt || a.tx.createdAt || 0));
      setFeePayments(pending);
      setAllFeePayments(allFeePayments);
      setAdmissionFeeMap(admissionMap);

      // Build payment map for document cards.
      const allDocStudentIds = [...new Set(allD.map(d => d.student?._id).filter(Boolean))];
      const payMap = {};
      await Promise.all(allDocStudentIds.map(async (sid) => {
        try {
          const pay = await paymentsApi.get(sid);
          if (pay) payMap[sid] = { totalFee: pay.totalFee||0, netFee: pay.netFee||0, paidAmount: pay.paidAmount||0, dueAmount: pay.dueAmount||0 };
        } catch {}
      }));
      setStudentPayMap(payMap);


      hist.sort((a,b) => b._sortKey - a._sortKey);
      setHistory(hist);
    } catch { toast.error('Failed to load'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function doAdmAction(action) {
    setSaving(true);
    try { await studentsApi.accountantAction(dialog.item._id, action, note); toast.success('Done'); setDialog(null); setNote(''); load(); }
    catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function forwardToCounselor(student) {
    setSaving(true);
    try {
      await studentsApi.accountantForwardToCounselor(student._id, student.rejectionReason || '');
      toast.success('Forwarded to counselor'); load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function markAmountSettled(student) {
    setSaving(true);
    try {
      await studentsApi.amountSettle(student._id);
      toast.success(`Amount settled for ${student.name}`); load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function doDocAction(action) {
    setSaving(true);
    try { await docsApi.accountantAction(dialog.item._id, action, note); toast.success('Done'); setDialog(null); setNote(''); load(); }
    catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function doDocChanges() {
    if (!note.trim()) return toast.error('Note required');
    setSaving(true);
    try {
      await docsApi.requestChanges(dialog.item._id, note);
      toast.success('Sent back to center for changes');
      setDialog(null);
      setNote('');
      load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  function toggleDocSelection(id) {
    setSelectedDocIds(prev => prev.includes(String(id)) ? prev.filter(x => x !== String(id)) : [...prev, String(id)]);
  }

  async function batchDocApprove(list) {
    const selected = list.filter(d => selectedDocIds.includes(String(d._id)));
    if (!selected.length) return toast.error('Select documents first');
    setSaving(true);
    try {
      for (const doc of selected) await docsApi.accountantAction(doc._id, 'approve', '');
      toast.success(`${selected.length} documents approved`);
      setSelectedDocIds([]);
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function doPayVerify(approved) {
    setSaving(true);
    try { await docsApi.verifyPayment(dialog.item._id, approved, note); toast.success(approved?'Verified':'Rejected'); setDialog(null); setNote(''); load(); }
    catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function batchPayVerify(list) {
    const selected = list.filter(d => selectedDocIds.includes(String(d._id)));
    if (!selected.length) return toast.error('Select payments first');
    setSaving(true);
    try {
      for (const doc of selected) await docsApi.verifyPayment(doc._id, true, '');
      toast.success(`${selected.length} document payments verified`);
      setSelectedDocIds([]);
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function forwardScanToCounselor(docId) {
    try {
      await docsApi.accountantForwardScan(docId);
      toast.success('Scan forwarded to counselor');
      load();
    } catch(e) { toast.error(e.message); }
  }

  async function verifyFeePayment(studentId, txId, approved) {
    try {
      await paymentsApi.accountantVerifyPayment(studentId, txId, { approved, note });
      toast.success(approved ? 'Fee payment verified!' : 'Fee payment rejected');
      setDialog(null); setNote(''); load();
    } catch(e) { toast.error(e.message); }
  }

  // Search filter - matches student name, center, UTR, enrollment number
  const q = search.toLowerCase().trim();
  const matchS  = s  => !q || s.name?.toLowerCase().includes(q) || s.center?.name?.toLowerCase().includes(q) || s.enrollmentNumber?.toLowerCase().includes(q) || s.phone?.includes(q);
  const matchD  = d  => !q || d.student?.name?.toLowerCase().includes(q) || d.name?.toLowerCase().includes(q) || d.center?.name?.toLowerCase().includes(q);
  const matchFP = fp => !q || fp.student?.name?.toLowerCase().includes(q) || fp.tx?.utrRef?.toLowerCase().includes(q) || fp.student?.center?.name?.toLowerCase().includes(q);
  const matchH  = h  => !q || h.studentName?.toLowerCase().includes(q) || h.centerName?.toLowerCase().includes(q) || h.utrRef?.toLowerCase().includes(q) || h.entityName?.toLowerCase().includes(q) || h.enrollmentNumber?.toLowerCase().includes(q) || h.universityName?.toLowerCase().includes(q) || h.note?.toLowerCase().includes(q) || h.actionConfig?.label?.toLowerCase().includes(q);

  const filtStudents       = students.filter(s => !isDismissed(`student:${s._id}:admission`)).filter(matchS);
  const filtUniRejected    = uniRejected.filter(matchS);
  const filtAmountSettle   = amountSettleQueue.filter(matchS);
  const filtDocs           = docs.filter(d => !isDismissed(`doc:${d._id}:fee`)).filter(matchD);
  const filtPayDocs     = payDocs.filter(d => !isDismissed(`doc:${d._id}:payment`)).filter(matchD);
  const filtFeePayments    = feePayments.filter(({ student, tx }) => !isDismissed(`fee-payment:${student._id}:${tx._id}`)).filter(matchFP);
  const filtAllFeePayments = allFeePayments.filter(matchFP);
  const filtAllPayDocs     = allPayDocs.filter(matchD);
  const filtHistory     = history.filter(matchH);

  const pendingSettleCount = amountSettleQueue.filter(s => !s.amountSettled).length;
  const totalPending = students.length + uniRejected.length + pendingSettleCount + feePayments.length + docs.length + payDocs.length;

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold flex items-center gap-2"><IndianRupee className="h-5 w-5"/>Accountant Panel</h1>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
        <Input
          className="pl-9 pr-9"
          placeholder="Search by student name, center, UTR number, enrollment no…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4"/>
          </button>
        )}
      </div>
      {search && (
        <p className="text-xs text-muted-foreground">
          Showing results for "<b>{search}</b>" — {filtStudents.length + filtFeePayments.length + filtDocs.length + filtPayDocs.length + filtHistory.length} records found
        </p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['Pending Actions', totalPending, 'text-amber-600'],
          ['Fee Payments', feePayments.length, 'text-orange-600'],
          ['Doc Payments', payDocs.length, 'text-purple-600'],
          ['Verified Records', history.length, 'text-emerald-600'],
        ].map(([l,v,c]) => (
          <Card key={l}><CardContent className="pt-4 pb-3 text-center">
            <div className={`text-2xl font-bold ${c}`}>{v}</div>
            <div className="text-xs text-muted-foreground">{l}</div>
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="feepay">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-slate-100 p-1 rounded-xl">
          {[
            { val:'scans',       label:'Scan Review',    count: scanDocs.length,                                         dot:'bg-violet-500' },
            { val:'admissions',  label:'Admissions',     count: filtStudents.length,          dot:'bg-blue-500'   },
            { val:'unireject',   label:'Uni Rejected',   count: search ? filtUniRejected.length : uniRejected.length,    dot:'bg-orange-500' },
            { val:'amountsettle',label:'Amount Settle',  count: search ? filtAmountSettle.length : amountSettleQueue.length, dot:'bg-emerald-500', badge: pendingSettleCount },
            { val:'feepay',      label:'Fee Payments',   count: filtFeePayments.length,    dot:'bg-amber-500'  },
            { val:'docs',        label:'Doc Request',    count: filtDocs.length,                  dot:'bg-indigo-500' },
            { val:'payments',    label:'Doc Payments',   count: filtPayDocs.length,            dot:'bg-teal-500'   },
            { val:'history',     label:'History',        count: search ? filtHistory.length : history.length,            dot:''              },
          ].map(({ val, label, count, dot, badge }) => (
            <TabsTrigger key={val} value={val}
              className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm py-1.5 px-3 flex items-center gap-1.5">
              {val === 'history' && <History className="h-3.5 w-3.5"/>}
              {label}
              {count > 0 && (
                <span className={`text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 ${dot ? `${dot} text-white` : 'bg-slate-200 text-slate-600'}`}>
                  {badge !== undefined ? badge : count}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Uni Rejected Tab */}
        <TabsContent value="unireject" className="space-y-2 mt-3">
          <div className="flex items-start gap-2.5 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-2">
            <div className="h-5 w-5 rounded-full bg-orange-200 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-orange-700 text-xs font-bold">!</span>
            </div>
            <p className="text-sm text-orange-700">University-rejected applications. Pending ones need to be forwarded to counselor. Already-forwarded ones are shown for reference.</p>
          </div>
          {filtUniRejected.length === 0
            ? <div className="text-center py-10 text-muted-foreground">No university-rejected applications</div>
            : filtUniRejected.map(s => {
                const alreadyForwarded = s.applicationStatus === 'Accountant_Rejected' && s.rejectedVia === 'university';
                return (
                  <Card key={s._id} className={alreadyForwarded ? 'border-slate-200' : 'border-orange-200'}>
                    <CardContent className="p-4 flex items-start justify-between gap-3">
                      <div className="flex-1 cursor-pointer" onClick={() => setDetailStudent(s)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{s.name}</span>
                          {alreadyForwarded
                            ? <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">✓ Forwarded to Counselor</span>
                            : <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">🏫 Pending — Rejected by University</span>
                          }
                        </div>
                        <div className="text-sm text-muted-foreground mt-0.5">{s.center?.name} · {s.courseName} · {s.university?.name || s.universityName}</div>
                        {s.rejectionReason && (
                          <div className="mt-1.5 text-xs bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-red-700">
                            <span className="font-semibold">Reason:</span> {s.rejectionReason}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => setDetailStudent(s)}><Eye className="h-3.5 w-3.5"/></Button>
                        {!alreadyForwarded && (
                          <Button size="sm" className="bg-orange-500 hover:bg-orange-600" disabled={saving}
                            onClick={() => forwardToCounselor(s)}>
                            <Send className="h-3.5 w-3.5 mr-1"/>→ Counselor
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
          }
        </TabsContent>

        {/* Amount Settle Tab */}
        <TabsContent value="amountsettle" className="space-y-2 mt-3">
          <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-2">
            <div className="h-5 w-5 rounded-full bg-emerald-200 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-emerald-700 text-xs font-bold">₹</span>
            </div>
            <p className="text-sm text-emerald-700">Rejected applications from university path and cancelled applications where center has requested settlement. Mark amount as settled once refund/adjustment is processed.</p>
          </div>
          {filtAmountSettle.length === 0
            ? <div className="text-center py-10 text-muted-foreground">No rejected applications</div>
            : filtAmountSettle.map(s => (
              <Card key={s._id} className={s.amountSettled ? 'border-emerald-300 bg-emerald-50/30' : s.applicationStatus === 'Cancelled' ? 'border-slate-300 bg-slate-50' : 'border-red-200'}>
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div className="flex-1 cursor-pointer" onClick={() => setDetailStudent(s)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{s.name}</span>
                      {s.amountSettled
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300 font-semibold">✅ Amount Settled</span>
                        : s.applicationStatus === 'Cancelled'
                          ? <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 border border-slate-300">🚫 Cancelled — Forwarded by Counselor</span>
                          : <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">Rejected — Pending Settlement</span>
                      }
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">{s.center?.name} · {s.courseName} · {s.university?.name || s.universityName}</div>
                    {s.rejectionReason && (
                      <div className={`mt-1.5 text-xs rounded-lg px-3 py-2 ${s.applicationStatus === 'Cancelled' ? 'bg-slate-100 border border-slate-200 text-slate-600' : 'bg-red-50 border border-red-100 text-red-700'}`}>
                        <span className="font-semibold">{s.applicationStatus === 'Cancelled' ? 'Cancellation Reason:' : 'Rejection Reason:'}</span> {s.rejectionReason}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => setDetailStudent(s)}><Eye className="h-3.5 w-3.5"/></Button>
                    {!s.amountSettled && (
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={saving}
                        onClick={() => markAmountSettled(s)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1"/>Amount Settled ✓
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          }
        </TabsContent>

        {/* Admissions Tab */}
        {/* Scan Review Tab - scanned docs from dispatch */}
        <TabsContent value="scans" className="space-y-2 mt-3">
          <p className="text-sm text-muted-foreground">Scanned documents received from Dispatch — review and forward to Counselor.</p>
          {scanDocs.length===0
            ?<div className="text-center py-10 text-muted-foreground">No scanned documents pending review</div>
            :scanDocs.map(d=>(
              <Card key={d._id} className="border-violet-200">
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{d.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">Scan Received</span>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
  Student: {d.student?.name}
  {d.student?.enrollmentNumber && (
    <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
      {d.student.enrollmentNumber}
    </span>
  )}
</div>
                    {d.scannedUrl&&(
                      <a href={`${(import.meta.env.VITE_API_URL||'http://localhost:5000/api').replace('/api','')}${d.scannedUrl}`}
                        target="_blank" rel="noreferrer"
                        className="text-xs text-blue-600 underline flex items-center gap-1 mt-1 w-fit">
                        <Eye className="h-3 w-3"/>View Scanned Copy
                      </a>
                    )}
                    {d.statusHistory?.slice(-3).map((h,i)=>(
                      <div key={i} className="text-xs text-muted-foreground mt-0.5">{h.status?.replace(/_/g,' ')} · {h.note}</div>
                    ))}
                  </div>
                  <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={()=>forwardScanToCounselor(d._id)}>
                    <Send className="h-3.5 w-3.5 mr-1"/>Forward to Counselor
                  </Button>
                </CardContent>
              </Card>
            ))
          }
        </TabsContent>

        <TabsContent value="admissions" className="space-y-2 mt-3">
          {filtStudents.length===0 ? <div className="text-center py-10 text-muted-foreground">{search ? `No admissions matching "${search}"` : 'No pending admissions'}</div>
          : filtStudents.map(s => (
            <Card key={s._id}>
              <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 cursor-pointer" onClick={() => setDetailStudent(s)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{s.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_C[s.applicationStatus]||'bg-gray-100 text-gray-700'}`}>{s.applicationStatus?.replace(/_/g,' ')}</span>
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">{s.center?.name} · {s.courseName}{s.enrollmentNumber && <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{s.enrollmentNumber}</span>}</div>
                  {s.university?.name && <div className="text-xs text-purple-600">🎓 {s.university.name}</div>}
                  {s.submissionDocs?.length > 0 && <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Paperclip className="h-3 w-3"/>{s.submissionDocs.length} docs attached</div>}
                  <FeePaymentPanel payment={admissionFeeMap[String(s._id)]} status="pending_accountant" accMap={payAccounts}/>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setDetailStudent(s)}><Eye className="h-3.5 w-3.5"/></Button>
                  <Button size="sm" variant="outline" onClick={() => dismiss(`student:${s._id}:admission`)} className="text-red-600 hover:text-red-700">
                    <Trash2 className="h-3.5 w-3.5 mr-1"/>Delete
                  </Button>
                  <Button size="sm" onClick={() => { setDialog({type:'adm',item:s}); setNote(''); }}>Review</Button>
                </div>
              </div>
              <CardRequestDate date={getStudentSubmittedAt(s)}/>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Fee Payments Tab */}
        <TabsContent value="feepay" className="space-y-2 mt-3">
          <p className="text-sm text-muted-foreground">Counselor verified fee payments — verify or reject below.</p>
          {filtFeePayments.length===0 ? <div className="text-center py-10 text-muted-foreground">{search ? `No fee payments matching "${search}"` : 'No fee payments pending verification'}</div>
          : filtFeePayments.map(({student, payment, tx}) => (
            <Card key={tx._id} className="border-orange-200">
              <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 cursor-pointer space-y-2" onClick={() => setDetailStudent(student)}>

                  {/* Student info */}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{student.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Fee Payment</span>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                      <span>{student.center?.name} · {student.courseName}</span>
                      {student.enrollmentNumber && <span className="text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">{student.enrollmentNumber}</span>}
                    </div>
                  </div>

                  {/* Fee summary */}
                  <div className="flex gap-2 flex-wrap">
                    <span className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1">Net: <b>{fmt(payment.netFee)}</b></span>
                    <span className="text-xs bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1">Total Paid: <b className="text-emerald-600">{fmt(payment.paidAmount)}</b></span>
                    {payment.dueAmount > 0 && <span className="text-xs bg-amber-50 border border-amber-200 rounded-md px-2 py-1">Due: <b className="text-amber-600">{fmt(payment.dueAmount)}</b></span>}
                  </div>

                  {/* Payment details box */}
                  <div className="bg-muted/40 border border-border rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-emerald-600 text-base">{fmt(tx.amount)}</span>
                      {tx.mode && <span className="text-xs bg-background border border-border text-muted-foreground px-2 py-0.5 rounded-md font-medium">{tx.mode}</span>}
                      {tx.paidAt && <span className="text-xs text-muted-foreground ml-auto">📅 {fmtD(tx.paidAt)}</span>}
                    </div>
                    {tx.mode==='UPI' && tx.upiId && <div className="text-xs text-muted-foreground">UPI ID: <span className="font-mono font-semibold text-foreground">{tx.upiId}</span></div>}
                    {tx.utrRef && <div className="text-xs text-muted-foreground">UTR: <span className="font-mono font-semibold text-foreground">{tx.utrRef}</span></div>}
                    {tx.mode==='Bank Transfer' && tx.bankName && <div className="text-xs text-muted-foreground">Bank: <span className="font-semibold text-foreground">{tx.bankName}</span></div>}
                    {tx.mode==='Bank Transfer' && tx.accountHolder && <div className="text-xs text-muted-foreground">Account Holder: <span className="font-semibold text-foreground">{tx.accountHolder}</span></div>}
                    {tx.mode==='Bank Transfer' && tx.accountNumber && <div className="text-xs text-muted-foreground">Account No: <span className="font-mono font-semibold text-foreground">{tx.accountNumber}</span></div>}
                    {tx.mode==='Bank Transfer' && tx.ifscCode && <div className="text-xs text-muted-foreground">IFSC: <span className="font-mono font-semibold text-foreground">{tx.ifscCode}</span></div>}
                    {tx.note && <div className="text-xs text-muted-foreground italic">Note: "{tx.note}"</div>}
                    {tx.paymentScreenshot && (   // ← YE DAALO
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
                <div className="flex gap-2 flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={() => dismiss(`fee-payment:${student._id}:${tx._id}`)} className="text-red-600 hover:text-red-700">
                    <Trash2 className="h-3.5 w-3.5 mr-1"/>Delete
                  </Button>
                  <Button size="sm" variant="destructive"
                    onClick={() => setDialog({type:'feeReject', studentId:student._id, txId:tx._id, student, tx})}>
                    Reject
                  </Button>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700"
                    onClick={() => verifyFeePayment(student._id, tx._id, true)}>
                    Verify ✓
                  </Button>
                </div>
              </div>
              <CardRequestDate date={getPaymentSubmittedAt(tx)} label="Payment submitted"/>
              </CardContent>
            </Card>
          ))}

          {/* ── Permanent list: ALL fee payment students ───── */}
          {allFeePayments.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-border"/>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
                  All Fee Payment Students ({allFeePayments.length})
                </span>
                <div className="h-px flex-1 bg-border"/>
              </div>
              <div className="space-y-2">
                {allFeePayments.map(({ student, payment, tx }, idx) => {
                  const isPending  = tx.verificationStatus === 'pending_accountant';
                  const isVerified = tx.verificationStatus === 'verified';
                  const isRejected = tx.verificationStatus === 'rejected';
                  return (
                    <div
                      key={`alllist-${tx._id}`}
                      className={`rounded-xl border transition-colors ${
                        isPending  ? 'bg-amber-50  border-amber-200'  :
                        isVerified ? 'bg-emerald-50 border-emerald-200' :
                                     'bg-red-50    border-red-200'
                      }`}
                    >
                      {/* Header row */}
                      <div
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                        onClick={() => setDetailStudent(student)}
                      >
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm ${
                          isPending  ? 'bg-amber-200  text-amber-800'  :
                          isVerified ? 'bg-emerald-200 text-emerald-800' :
                                       'bg-red-200    text-red-800'
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800 text-sm">{student.name}</span>
                            {student.enrollmentNumber && (
                              <span className="text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                {student.enrollmentNumber}
                              </span>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              isPending  ? 'bg-amber-200  text-amber-800'  :
                              isVerified ? 'bg-emerald-200 text-emerald-800' :
                                           'bg-red-200    text-red-800'
                            }`}>
                              {isPending ? '⏳ Pending' : isVerified ? '✓ Verified' : '✗ Rejected'}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">
                            {student.center?.name}{student.courseName ? ` · ${student.courseName}` : ''}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-bold text-emerald-700">{fmt(tx.amount)}</div>
                          <div className="text-xs text-muted-foreground">{tx.mode || '—'}</div>
                        </div>
                      </div>

                      {/* Payment details */}
                      <div className="px-4 pb-3">
                        <div className="bg-white/70 border border-white rounded-lg px-3 py-2 space-y-1.5">
                          {/* Mode + date */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {tx.mode && <span className="text-xs bg-muted border border-border px-1.5 py-0.5 rounded font-medium">via {tx.mode}</span>}
                            {tx.paidAt && <span className="text-xs text-muted-foreground">📅 {fmtD(tx.paidAt)}</span>}
                          </div>
                          {tx.mode === 'UPI' && tx.upiId && (
                            <div className="text-xs text-muted-foreground">UPI ID: <span className="font-mono font-semibold text-foreground">{tx.upiId}</span></div>
                          )}
                          {tx.utrRef && (
                            <div className="text-xs text-muted-foreground">UTR: <span className="font-mono font-semibold text-foreground">{tx.utrRef}</span></div>
                          )}
                          {tx.mode === 'Bank Transfer' && tx.bankName && (
                            <div className="text-xs text-muted-foreground">Bank: <span className="font-semibold text-foreground">{tx.bankName}</span></div>
                          )}
                          {tx.mode === 'Bank Transfer' && tx.accountHolder && (
                            <div className="text-xs text-muted-foreground">A/C Holder: <span className="font-semibold text-foreground">{tx.accountHolder}</span></div>
                          )}
                          {tx.mode === 'Bank Transfer' && tx.accountNumber && (
                            <div className="text-xs text-muted-foreground">A/C No: <span className="font-mono font-semibold text-foreground">{tx.accountNumber}</span></div>
                          )}
                          {tx.mode === 'Bank Transfer' && tx.ifscCode && (
                            <div className="text-xs text-muted-foreground">IFSC: <span className="font-mono font-semibold text-foreground">{tx.ifscCode}</span></div>
                          )}
                          {tx.note && (
                            <div className="text-xs text-muted-foreground italic">Note: "{tx.note}"</div>
                          )}
                          {/* Verified/Rejected by info */}
                          {(isVerified || isRejected) && tx.verifiedAt && (
                            <div className={`text-xs mt-1 ${isVerified ? 'text-emerald-700' : 'text-red-700'}`}>
                              {isVerified ? '✓ Verified' : '✗ Rejected'} by {tx.verifiedBy?.name || 'Accountant'} · {fmtD(tx.verifiedAt)}
                              {tx.verificationNote && <span className="ml-1 italic">— "{tx.verificationNote}"</span>}
                            </div>
                          )}
                          {/* Screenshot */}
                          {tx.paymentScreenshot && (
                            <a
                              href={`${(import.meta.env.VITE_API_URL||'http://localhost:5000/api').replace('/api','')}${tx.paymentScreenshot}`}
                              target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-100 transition-colors mt-0.5"
                            >
                              <Download className="h-3 w-3"/>View Payment Screenshot
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Doc Fees Tab */}
        <TabsContent value="docs" className="space-y-2 mt-3">
          {filtDocs.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={filtDocs.length > 0 && filtDocs.every(d => selectedDocIds.includes(String(d._id)))}
                  onChange={e => setSelectedDocIds(e.target.checked ? filtDocs.map(d => String(d._id)) : [])}
                  className="h-4 w-4 accent-indigo-600"
                />
                Select all visible doc fee checks
              </label>
              <Button size="sm" onClick={() => batchDocApprove(filtDocs)} disabled={saving || !filtDocs.some(d => selectedDocIds.includes(String(d._id)))}>
                Approve Selected
              </Button>
            </div>
          )}
          {filtDocs.length===0 ? <div className="text-center py-10 text-muted-foreground">{search ? `No doc fees matching "${search}"` : 'No doc fee checks'}</div>
          : filtDocs.map(d => (
            <Card key={d._id}>
              <CardContent className="p-4 flex justify-between items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedDocIds.includes(String(d._id))}
                      onChange={() => toggleDocSelection(d._id)}
                      className="h-4 w-4 accent-indigo-600"
                      aria-label={`Select ${d.name}`}
                    />
                    <span className="font-medium">{d.name}</span>
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{d.status?.replace(/_/g,' ')}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${d.requestType === 'Hard Copy' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-sky-50 text-sky-700 border-sky-200'}`}>{d.requestType || 'Soft Copy'}</span>
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
  Student: {d.student?.name}
  {d.student?.enrollmentNumber && (
    <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
      {d.student.enrollmentNumber}
    </span>
  )}
</div>
                  <div className="text-xs mt-0.5">
                    Charge: <b>{fmt(d.chargeFee)}</b> ·
                    Paid: <span className="text-emerald-600"><b>{fmt(d.totalPaid)}</b></span> ·
                    Due: <span className="text-amber-600"><b>{fmt(d.chargeFee-d.totalPaid)}</b></span>
                  </div>

                  {studentPayMap[d.student?._id] && (
                    <div className="flex gap-2 flex-wrap mt-1.5">
                      <span className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5">
                        Total Fee: <span className="font-bold text-slate-700">{fmt(studentPayMap[d.student._id].totalFee ?? studentPayMap[d.student._id].netFee)}</span>
                      </span>
                      <span className="text-xs bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5">
                        Paid: <span className="font-bold text-emerald-700">{fmt(studentPayMap[d.student._id].paidAmount)}</span>
                      </span>
                      {studentPayMap[d.student._id].dueAmount > 0 && (
                        <span className="text-xs bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">
                          Due: <span className="font-bold text-amber-700">{fmt(studentPayMap[d.student._id].dueAmount)}</span>
                        </span>
                      )}
                    </div>
                  )}


                  {d.payments?.length>0 && d.payments.map(p => (
                    <div key={p._id} className="mt-1 space-y-1">
                      <PaymentInfo tx={p}/>
                      {p.paymentScreenshot && (
                        <a href={`${(import.meta.env.VITE_API_URL||'http://localhost:5000/api').replace('/api','')}${p.paymentScreenshot}`}
                          target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-100 transition-colors">
                          <Download className="h-3 w-3"/>View Payment Screenshot
                        </a>
                      )}
                    </div>
                  ))}
                  
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => dismiss(`doc:${d._id}:fee`)} className="text-red-600 hover:text-red-700">
                    <Trash2 className="h-3.5 w-3.5 mr-1"/>Delete
                  </Button>
                  <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={() => { setDialog({type:'docChanges', item:d}); setNote(''); }}>
                    Send Back
                  </Button>
                  <Button size="sm" onClick={() => { setDialog({type:'doc',item:d}); setNote(''); }}>Review</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Doc Payments Tab */}
        <TabsContent value="payments" className="space-y-2 mt-3">
          {filtPayDocs.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={filtPayDocs.length > 0 && filtPayDocs.every(d => selectedDocIds.includes(String(d._id)))}
                  onChange={e => setSelectedDocIds(e.target.checked ? filtPayDocs.map(d => String(d._id)) : [])}
                  className="h-4 w-4 accent-indigo-600"
                />
                Select all visible payments
              </label>
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => batchPayVerify(filtPayDocs)} disabled={saving || !filtPayDocs.some(d => selectedDocIds.includes(String(d._id)))}>
                Verify Selected
              </Button>
            </div>
          )}
          {filtPayDocs.length===0 ? <div className="text-center py-10 text-muted-foreground">{search ? `No payments matching "${search}"` : 'No payments to verify'}</div>
          : filtPayDocs.map(d => (
            <Card key={d._id}>
              <CardContent className="p-4 flex justify-between items-start gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedDocIds.includes(String(d._id))}
                      onChange={() => toggleDocSelection(d._id)}
                      className="h-4 w-4 accent-indigo-600"
                      aria-label={`Select ${d.name}`}
                    />
                    <span className="font-medium">{d.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Payment Submitted</span>
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
  Student: {d.student?.name}
  {d.student?.enrollmentNumber && (
    <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
      {d.student.enrollmentNumber}
    </span>
  )}
</div>
                  {d.payments?.map(p => (
                    <div key={p._id} className="text-xs mt-1 space-y-0.5 border border-slate-100 rounded-lg p-2 bg-slate-50/50">
                      <PaymentInfo tx={p}/>
                      {p.paymentScreenshot && (
                        <div className="mt-1.5">
                          <a href={`${(import.meta.env.VITE_API_URL||'http://localhost:5000/api').replace('/api','')}${p.paymentScreenshot}`}
                            target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-100 transition-colors">
                            <Download className="h-3 w-3"/>View Payment Screenshot
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                  {studentPayMap[d.student?._id] && (
                    <div className="flex gap-2 flex-wrap mt-1.5">
                      <span className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5">
                        Total Fee: <span className="font-bold text-slate-700">{fmt(studentPayMap[d.student._id].totalFee ?? studentPayMap[d.student._id].netFee)}</span>
                      </span>
                      <span className="text-xs bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5">
                        Paid: <span className="font-bold text-emerald-700">{fmt(studentPayMap[d.student._id].paidAmount)}</span>
                      </span>
                      {studentPayMap[d.student._id].dueAmount > 0 && (
                        <span className="text-xs bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">
                          Due: <span className="font-bold text-amber-700">{fmt(studentPayMap[d.student._id].dueAmount)}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => dismiss(`doc:${d._id}:payment`)} className="text-red-600 hover:text-red-700">
                    <Trash2 className="h-3.5 w-3.5 mr-1"/>Delete
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setDialog({type:'pay',item:d,approved:false}); setNote(''); }}>Reject</Button>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => { setDialog({type:'pay',item:d,approved:true}); setNote(''); }}>Verify</Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* ── Permanent list: ALL doc payment students ─────── */}
          {allPayDocs.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-border"/>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
                  All Doc Payment Students ({allPayDocs.length})
                </span>
                <div className="h-px flex-1 bg-border"/>
              </div>
              <div className="space-y-2">
                {allPayDocs.map((d, idx) => {
                  const isPending  = d.status === 'Payment_Submitted';
                  const isVerified = d.status === 'Payment_Verified';
                  const isRejected = d.status === 'Center_Notified' || d.status === 'Fee_Rejected';
                  const lastPay    = d.payments?.slice(-1)[0];
                  return (
                    <div
                      key={`doclist-${d._id}`}
                      className={`rounded-xl border transition-colors ${
                        isPending  ? 'bg-blue-50   border-blue-200'   :
                        isVerified ? 'bg-emerald-50 border-emerald-200' :
                        isRejected ? 'bg-red-50    border-red-200'    :
                                     'bg-slate-50  border-slate-200'
                      }`}
                    >
                      {/* Header row */}
                      <div
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                        onClick={() => setDetailStudent(d.student)}
                      >
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm ${
                          isPending  ? 'bg-blue-200   text-blue-800'   :
                          isVerified ? 'bg-emerald-200 text-emerald-800' :
                          isRejected ? 'bg-red-200    text-red-800'    :
                                       'bg-slate-200  text-slate-700'
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800 text-sm">{d.student?.name || '—'}</span>
                            {d.student?.enrollmentNumber && (
                              <span className="text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                {d.student.enrollmentNumber}
                              </span>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              isPending  ? 'bg-blue-200   text-blue-800'   :
                              isVerified ? 'bg-emerald-200 text-emerald-800' :
                              isRejected ? 'bg-red-200    text-red-800'    :
                                           'bg-slate-200  text-slate-700'
                            }`}>
                              {isPending ? '⏳ Pending' : isVerified ? '✓ Verified' : isRejected ? '✗ Rejected' : d.status?.replace(/_/g,' ')}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">
                            {d.name}{d.center?.name ? ` · ${d.center.name}` : ''}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-bold text-emerald-700">{fmt(lastPay?.amount)}</div>
                          <div className="text-xs text-muted-foreground">{lastPay?.mode || '—'}</div>
                        </div>
                      </div>

                      {/* Payment details for each payment */}
                      {d.payments?.length > 0 && (
                        <div className="px-4 pb-3 space-y-2">
                          {d.payments.map((p, pi) => (
                            <div key={p._id || pi} className="bg-white/70 border border-white rounded-lg px-3 py-2 space-y-1.5">
                              {/* Amount + mode + date */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-emerald-700 text-sm">{fmt(p.amount)}</span>
                                {p.mode && <span className="text-xs bg-muted border border-border px-1.5 py-0.5 rounded font-medium">via {p.mode}</span>}
                                {p.paidAt && <span className="text-xs text-muted-foreground">📅 {fmtD(p.paidAt)}</span>}
                              </div>
                              {/* UPI details */}
                              {p.mode === 'UPI' && p.upiId && (
                                <div className="text-xs text-muted-foreground">UPI ID: <span className="font-mono font-semibold text-foreground">{p.upiId}</span></div>
                              )}
                              {p.utrRef && (
                                <div className="text-xs text-muted-foreground">UTR: <span className="font-mono font-semibold text-foreground">{p.utrRef}</span></div>
                              )}
                              {/* Bank details */}
                              {p.mode === 'Bank Transfer' && p.bankName && (
                                <div className="text-xs text-muted-foreground">Bank: <span className="font-semibold text-foreground">{p.bankName}</span></div>
                              )}
                              {p.mode === 'Bank Transfer' && p.accountHolder && (
                                <div className="text-xs text-muted-foreground">A/C Holder: <span className="font-semibold text-foreground">{p.accountHolder}</span></div>
                              )}
                              {p.mode === 'Bank Transfer' && p.accountNumber && (
                                <div className="text-xs text-muted-foreground">A/C No: <span className="font-mono font-semibold text-foreground">{p.accountNumber}</span></div>
                              )}
                              {p.mode === 'Bank Transfer' && p.ifscCode && (
                                <div className="text-xs text-muted-foreground">IFSC: <span className="font-mono font-semibold text-foreground">{p.ifscCode}</span></div>
                              )}
                              {p.note && (
                                <div className="text-xs text-muted-foreground italic">Note: "{p.note}"</div>
                              )}
                              {/* Screenshot */}
                              {p.paymentScreenshot && (
                                <a
                                  href={`${(import.meta.env.VITE_API_URL||'http://localhost:5000/api').replace('/api','')}${p.paymentScreenshot}`}
                                  target="_blank" rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-100 transition-colors mt-0.5"
                                >
                                  <Download className="h-3 w-3"/>View Payment Screenshot
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-2 mt-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-muted-foreground">Complete audit trail of all actions — every incoming and outgoing event per student.</p>
            <span className="text-xs text-muted-foreground">{history.length} records</span>
          </div>
          {filtHistory.length===0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <History className="h-10 w-10 mx-auto mb-3 text-muted-foreground"/>
              {search ? `No history matching "${search}"` : 'No records yet'}
            </div>
          ) : filtHistory.map((rec, i) => (
            <div key={rec.id||i}
              className={`border rounded-lg px-4 py-3 bg-card text-sm cursor-pointer hover:border-primary/40 transition-colors ${
                rec.type === 'student_action' && rec.actionStatus === 'University_Rejected' ? 'border-orange-200 bg-orange-50/30' :
                rec.type === 'student_action' && rec.actionStatus === 'Accountant_Rejected' ? 'border-red-100' :
                rec.type === 'student_action' && rec.actionStatus === 'Sent_To_University'  ? 'border-purple-100' :
                ''
              }`}
              onClick={() => setSelectedRecord(rec)}>

              {/* Row 1: Student name + action badge + date */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                  <span className="font-semibold">{rec.studentName || rec.entityName}</span>
                  {rec.enrollmentNumber && (
                    <span className="text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">{rec.enrollmentNumber}</span>
                  )}

                  {/* Student action badges */}
                  {rec.type === 'student_action' && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rec.actionConfig.badge}`}>
                      {rec.actionConfig.icon} {rec.actionConfig.label}
                    </span>
                  )}

                  {/* Doc / payment badges */}
                  {rec.type==='fee_payment' && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rec.status==='verified'?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-700'}`}>
                      {rec.status==='verified'?'✓ Fee Verified':'✗ Fee Rejected'}
                    </span>
                  )}
                  {rec.type==='doc_fee'     && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Doc Fee Approved</span>}
                  {rec.type==='doc_payment' && <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">Doc Payment Verified</span>}
                </div>
                <div className="text-right flex-shrink-0 flex items-center gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">{fmtD(rec.at || rec.verifiedAt)}</div>
                    <div className="text-xs text-muted-foreground text-right">
                      {rec.type === 'student_action' ? rec.doneBy : rec.verifiedBy}
                    </div>
                  </div>
                  <Eye className="h-4 w-4 text-muted-foreground"/>
                </div>
              </div>

              {/* Row 2: Center + Course + University */}
              <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                {rec.centerName     && <span className="flex items-center gap-1">🏢 {rec.centerName}</span>}
                {rec.courseName     && <span>📚 {rec.courseName}</span>}
                {rec.universityName && <span>🎓 {rec.universityName}</span>}
              </div>

              {/* Note / rejection reason / enrollment */}
              {rec.type === 'student_action' && rec.note && rec.actionStatus !== 'Counselor_Approved' && (
                <div className={`mt-1.5 text-xs rounded px-2.5 py-1.5 ${
                  rec.actionStatus === 'University_Rejected' || rec.actionStatus === 'Accountant_Rejected' || rec.actionStatus === 'Rejected'
                    ? 'bg-red-50 border border-red-100 text-red-700'
                    : rec.actionStatus === 'Enrolled'
                    ? 'bg-emerald-50 border border-emerald-100 text-emerald-700'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {rec.actionStatus === 'University_Rejected' || rec.actionStatus === 'Rejected'
                    ? <span className="font-semibold">Reason: </span>
                    : rec.actionStatus === 'Enrolled'
                    ? <span className="font-semibold">Enrollment No: </span>
                    : <span className="font-semibold">Note: </span>
                  }
                  {rec.actionStatus === 'Enrolled'
                    ? rec.note.replace('Enrollment number: ', '')
                    : rec.note
                  }
                </div>
              )}

              {/* Document name (for doc types) */}
              {(rec.type==='doc_fee' || rec.type==='doc_payment') && rec.entityName && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                  <Paperclip className="h-3 w-3 text-muted-foreground"/>
                  <span className="font-medium text-foreground">{rec.entityName}</span>
                  {rec.type==='doc_fee' && rec.status && (
                    <span className="text-muted-foreground">— {rec.status.replace(/_/g,' ')}</span>
                  )}
                </div>
              )}

              {/* Payment details inline */}
              {(rec.type==='fee_payment' || rec.type==='doc_payment') && rec.amount > 0 && (
                <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-bold text-emerald-700">{fmt(rec.amount)}</span>
                  {rec.mode && <span className="bg-muted px-1.5 py-0.5 rounded font-medium">via {rec.mode}</span>}
                  {rec.mode==='UPI' && rec.upiId && <span className="text-muted-foreground">UPI: <span className="font-mono font-medium text-foreground">{rec.upiId}</span></span>}
                  {rec.mode==='UPI' && rec.utrRef && <span className="text-muted-foreground">UTR: <span className="font-mono font-medium text-foreground">{rec.utrRef}</span></span>}
                  {rec.mode==='Bank Transfer' && rec.bankName && <span className="text-muted-foreground">Bank: <span className="font-medium text-foreground">{rec.bankName}</span></span>}
                  {rec.mode==='Bank Transfer' && rec.accountNumber && <span className="text-muted-foreground">A/C: <span className="font-mono font-medium text-foreground">{rec.accountNumber}</span></span>}
                  {rec.paidAt && <span className="text-muted-foreground">on {fmtD(rec.paidAt)}</span>}
                </div>
              )}

              {/* Doc fee charge info */}
              {rec.type==='doc_fee' && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Charge: <span className="font-medium text-foreground">{fmt(rec.chargeFee || 0)}</span>
                  {rec.verificationNote && <span className="ml-2">Note: {rec.verificationNote}</span>}
                </div>
              )}

              {rec.type==='fee_payment' && rec.verificationNote && (
                <div className="mt-1 text-xs text-muted-foreground italic">Note: {rec.verificationNote}</div>
              )}
            </div>
          ))}
        </TabsContent>
      </Tabs>

      {/* Action Dialog */}
      <Dialog open={!!dialog} onOpenChange={() => setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.type==='adm'     && `Review Admission: ${dialog.item?.name}`}
              {dialog?.type==='doc'     && `Review Doc Fee: ${dialog.item?.name}`}
              {dialog?.type==='docChanges' && `Send Back Document Request: ${dialog.item?.name}`}
              {dialog?.type==='pay'     && `${dialog?.approved?'Verify':'Reject'} Payment: ${dialog.item?.name}`}
              {dialog?.type==='feeReject' && `Reject Fee Payment — ${dialog?.student?.name} · ${fmt(dialog?.tx?.amount)}`}
            </DialogTitle>
          </DialogHeader>
          {dialog?.type==='adm' && (
            <div className="text-sm text-muted-foreground">Center: {dialog.item?.center?.name} · {dialog.item?.courseName}</div>
          )}
          {dialog?.type==='doc' && (
            <div className="text-sm">Charge: <b>{fmt(dialog.item?.chargeFee)}</b> · Paid: <span className="text-emerald-600"><b>{fmt(dialog.item?.totalPaid)}</b></span></div>
          )}
          {dialog?.type==='docChanges' && (
            <div className="text-sm text-muted-foreground">Student: {dialog.item?.student?.name || 'Student'} - Center will be able to edit and resubmit this document request.</div>
          )}
          {dialog?.type==='feeReject' && (
            <div className="text-sm space-y-1">
              <div>Amount: <b className="text-emerald-700">{fmt(dialog.tx?.amount)}</b> · Mode: {dialog.tx?.mode||'—'}</div>
              <PaymentInfo tx={dialog.tx}/>
            </div>
          )}
          <div><Label>Note{dialog?.type==='docChanges' ? ' *' : ''}</Label><Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder={dialog?.type==='docChanges' ? 'Explain what the center needs to correct...' : 'Optional reason...'}/></div>
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            {dialog?.type==='adm' && <>
              <Button variant="destructive" onClick={() => doAdmAction('reject')} disabled={saving} title="Reject — notification goes to Counselor">
                <XCircle className="h-4 w-4 mr-1"/>Reject → Counselor
              </Button>
              <Button variant="outline" className="border-amber-400 text-amber-700" onClick={() => doAdmAction('pending')} disabled={saving}><Clock className="h-4 w-4 mr-1"/>Keep Pending</Button>
              <Button className="bg-green-600 hover:bg-green-700" onClick={() => doAdmAction('approve')} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}<CheckCircle2 className="h-4 w-4 mr-1"/>Approve → University
              </Button>
            </>}
            {dialog?.type==='doc' && <>
              <Button variant="destructive" onClick={() => doDocAction('reject')} disabled={saving} title="Reject — notification goes to Counselor">
                <XCircle className="h-4 w-4 mr-1"/>Reject → Counselor
              </Button>
              <Button variant="outline" className="border-amber-400 text-amber-700" onClick={() => doDocAction('pending')} disabled={saving}><Clock className="h-4 w-4 mr-1"/>Keep Pending</Button>
              <Button className="bg-green-600 hover:bg-green-700" onClick={() => doDocAction('approve')} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}<CheckCircle2 className="h-4 w-4 mr-1"/>Approve → University
              </Button>
            </>}
            {dialog?.type==='docChanges' && (
              <Button className="bg-amber-500 hover:bg-amber-600" onClick={doDocChanges} disabled={saving || !note.trim()}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Send Back to Center
              </Button>
            )}
            {dialog?.type==='pay' && (
              <Button className={dialog.approved?'bg-green-600 hover:bg-green-700':'bg-red-600 hover:bg-red-700'}
                onClick={() => doPayVerify(dialog.approved)} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}
                {dialog.approved ? 'Confirm Verify' : 'Confirm Reject'}
              </Button>
            )}
            {dialog?.type==='feeReject' && (
              <Button variant="destructive" onClick={() => verifyFeePayment(dialog.studentId, dialog.txId, false)} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Confirm Reject
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modals */}
      {detailStudent  && <StudentDetailModal student={detailStudent} onClose={() => setDetailStudent(null)}/>}
      {selectedRecord && <VerifiedRecordModal record={selectedRecord} onClose={() => setSelectedRecord(null)}/>}
    </div>
  );
}

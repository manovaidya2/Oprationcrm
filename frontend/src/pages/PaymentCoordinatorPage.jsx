import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, CheckCircle2, ChevronDown, Clock3, FileText, History, Loader2, Phone, Search, Send, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { docsApi, paymentsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const fmt = n => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const fmtDt = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const today = () => new Date().toISOString().split('T')[0];
const todayFrom = d => d ? new Date(d).toISOString().split('T')[0] : '';

const BUCKETS = {
  all: { label: 'All', icon: CalendarClock },
  overdue: { label: 'Overdue', icon: TriangleAlert },
  week: { label: 'This Week', icon: Clock3 },
  upcoming: { label: 'Upcoming', icon: CalendarClock },
  paid: { label: 'Paid', icon: CheckCircle2 },
};

const STATUS_CLASS = {
  Pending: 'bg-slate-50 text-slate-600 border-slate-200',
  Partially_Paid: 'bg-amber-50 text-amber-700 border-amber-200',
  Overdue: 'bg-red-50 text-red-700 border-red-200',
  Paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const EMPTY_PAY = { amount: '', mode: 'UPI', utrRef: '', upiId: '', bankName: '', accountHolder: '', paidAt: today(), note: '', paymentScreenshot: null };
const EMPTY_DOC_FOLLOWUP = { contactWith: 'Center', outcome: 'Called center', expectedPaymentDate: '', note: '' };

function groupRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = String(row.studentId);
    if (!map.has(key)) {
      map.set(key, { ...row, installments: [], transactions: row.transactions || [] });
    }
    const item = map.get(key);
    item.installments.push(row);
    item.transactions = row.transactions || item.transactions || [];
  }
  return [...map.values()].map(item => {
    const rank = { overdue: 0, week: 1, upcoming: 2, paid: 3 };
    item.installments.sort((a, b) => new Date(a.paymentDate) - new Date(b.paymentDate));
    item.bucket = item.installments.reduce((best, r) => rank[r.bucket] < rank[best] ? r.bucket : best, item.installments[0]?.bucket || 'upcoming');
    return item;
  });
}

export default function PaymentCoordinatorPage() {
  const [rows, setRows] = useState([]);
  const [docRows, setDocRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('installments');
  const [bucket, setBucket] = useState('all');
  const [docBucket, setDocBucket] = useState('needs_call');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState('');
  const [payTarget, setPayTarget] = useState(null);
  const [payForm, setPayForm] = useState({ ...EMPTY_PAY });
  const [docFollowTarget, setDocFollowTarget] = useState(null);
  const [docFollowForm, setDocFollowForm] = useState({ ...EMPTY_DOC_FOLLOWUP });
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const [installments, docs] = await Promise.all([
        paymentsApi.installmentTimeline(),
        docsApi.paymentFollowups(),
      ]);
      setRows(installments);
      setDocRows(docs);
    } catch (e) {
      toast.error(e.message || 'Failed to load payment coordinator timeline');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => rows.reduce((acc, row) => {
    acc.all += 1;
    acc[row.bucket] = (acc[row.bucket] || 0) + 1;
    return acc;
  }, { all: 0, overdue: 0, week: 0, upcoming: 0, paid: 0 }), [rows]);

  const docCounts = useMemo(() => docRows.reduce((acc, row) => {
    acc.all += 1;
    acc[row.bucket] = (acc[row.bucket] || 0) + 1;
    return acc;
  }, { all: 0, needs_call: 0, submitted: 0, ready_dispatch: 0, dispatched: 0, tracking: 0, delivered: 0 }), [docRows]);
  const activeDocCount = docCounts.needs_call + docCounts.submitted + docCounts.ready_dispatch + docCounts.dispatched;

  const students = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupRows(rows.filter(row => {
      if (bucket !== 'all' && row.bucket !== bucket) return false;
      if (!q) return true;
      return [row.studentName, row.centerName, row.courseName, row.enrollmentNumber, row.phone, row.counselorName, row.universityName]
        .some(v => String(v || '').toLowerCase().includes(q));
    }));
  }, [rows, bucket, search]);

  const docPaymentRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docRows.filter(row => {
      if (docBucket !== 'all' && row.bucket !== docBucket) return false;
      if (!q) return true;
      return [row.studentName, row.centerName, row.documentName, row.enrollmentNumber, row.phone, row.courseName, row.counselorName]
        .some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [docRows, docBucket, search]);

  function openPay(student, row) {
    const inst = row.installment || {};
    setPayTarget({ student, row });
    setPayForm({ ...EMPTY_PAY, amount: String(Math.max(0, (inst.amount || 0) - (inst.paidAmount || 0)) || inst.amount || '') });
  }

  async function submitPaid() {
    if (!payTarget) return;
    if (!payForm.amount || Number(payForm.amount) <= 0) return toast.error('Enter valid paid amount');
    if (!payForm.utrRef.trim()) return toast.error('UTR / reference required');
    const fd = new FormData();
    ['amount', 'mode', 'utrRef', 'upiId', 'bankName', 'accountHolder', 'paidAt', 'note'].forEach(k => fd.append(k, payForm[k] || ''));
    if (payForm.paymentScreenshot) fd.append('paymentScreenshot', payForm.paymentScreenshot);
    setSaving(true);
    try {
      await paymentsApi.markInstallmentPaid(payTarget.row.paymentId, payTarget.row.installment._id, fd);
      toast.success('Installment payment recorded');
      setPayTarget(null);
      setPayForm({ ...EMPTY_PAY });
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  function openDocFollow(row) {
    const defaultContact = ['ready_dispatch', 'dispatched'].includes(row.bucket) ? 'Dispatch' : 'Center';
    setDocFollowTarget(row);
    setDocFollowForm({
      ...EMPTY_DOC_FOLLOWUP,
      contactWith: defaultContact,
      outcome: defaultContact === 'Dispatch' ? 'Called dispatch' : 'Called center',
      expectedPaymentDate: row.nextFollowupDate ? todayFrom(row.nextFollowupDate) : '',
    });
  }

  async function submitDocFollowup() {
    if (!docFollowTarget) return;
    if (!docFollowForm.note.trim() && !docFollowForm.expectedPaymentDate && !docFollowForm.outcome.trim()) {
      return toast.error('Add call note, outcome, or expected payment date');
    }
    setSaving(true);
    try {
      await docsApi.markPaymentFollowup(docFollowTarget.documentId, docFollowForm);
      toast.success('Document payment follow-up saved');
      setDocFollowTarget(null);
      setDocFollowForm({ ...EMPTY_DOC_FOLLOWUP });
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><CalendarClock className="h-5 w-5" /> Payment Coordinator</h1>
          <p className="text-sm text-muted-foreground">Student fee installments and document payment follow-up tracking.</p>
        </div>
        <Button variant="outline" onClick={load}>Refresh</Button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/20 p-1">
        <Button type="button" variant={view === 'installments' ? 'default' : 'ghost'} onClick={() => setView('installments')} className="gap-2">
          <CalendarClock className="h-4 w-4" /> Installments
        </Button>
        <Button type="button" variant={view === 'documents' ? 'default' : 'ghost'} onClick={() => setView('documents')} className="gap-2">
          <FileText className="h-4 w-4" /> Document Payments
          <span className="rounded-full bg-background/80 px-2 text-xs text-foreground">{activeDocCount}</span>
        </Button>
      </div>

      {view === 'documents' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-5">
            {[
              ['Need Call', docCounts.needs_call, 'border-red-200 bg-red-50 text-red-700'],
              ['Payment Submitted', docCounts.submitted, 'border-amber-200 bg-amber-50 text-amber-700'],
              ['Ready / Dispatch Pending', docCounts.ready_dispatch, 'border-blue-200 bg-blue-50 text-blue-700'],
              ['Dispatched / Not Received', docCounts.dispatched, 'border-purple-200 bg-purple-50 text-purple-700'],
              ['Received by Center', docCounts.delivered, 'border-emerald-200 bg-emerald-50 text-emerald-700'],
            ].map(([label, value, tone]) => (
              <div key={label} className={cn('rounded-lg border p-3', tone)}>
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-xs font-semibold uppercase tracking-wide">{label}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={docBucket} onValueChange={setDocBucket}>
              <TabsList className="flex h-auto flex-wrap">
                {[
                  ['all', 'All', docCounts.all],
                  ['needs_call', 'Need Call', docCounts.needs_call],
                  ['submitted', 'Payment Submitted', docCounts.submitted],
                  ['ready_dispatch', 'Ready Dispatch', docCounts.ready_dispatch],
                  ['dispatched', 'Awaiting Center', docCounts.dispatched],
                  ['tracking', 'Tracking', docCounts.tracking],
                  ['delivered', 'Received by Center', docCounts.delivered],
                ].map(([key, label, count]) => (
                  <TabsTrigger key={key} value={key}>{label}<span className="rounded-full bg-background px-1.5 text-[10px]">{count || 0}</span></TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="relative ml-auto min-w-[260px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} className="pl-9" placeholder="Search student, center, document..." />
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border bg-card">
            {docPaymentRows.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">No document payment follow-up records found</div>
            ) : (
              <div className="divide-y">
                {docPaymentRows.map(row => {
                  const needsCall = row.bucket === 'needs_call';
                  return (
                    <div key={row.documentId} className="grid gap-3 p-4 lg:grid-cols-[1.2fr_.9fr_.8fr_auto] lg:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={`/students/${row.studentId}`} className="font-semibold text-foreground hover:text-primary">{row.studentName}</Link>
                          {row.enrollmentNumber && <Badge variant="outline" className="font-mono">{row.enrollmentNumber}</Badge>}
                          <Badge variant="outline" className={cn('border', needsCall ? 'border-red-200 bg-red-50 text-red-700' : row.bucket === 'submitted' ? 'border-amber-200 bg-amber-50 text-amber-700' : row.bucket === 'ready_dispatch' ? 'border-blue-200 bg-blue-50 text-blue-700' : row.bucket === 'dispatched' ? 'border-purple-200 bg-purple-50 text-purple-700' : row.bucket === 'delivered' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-700')}>
                            {String(row.status || '').replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">{row.documentName} · {row.centerName || 'Center'}</div>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {row.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{row.phone}</span>}
                          {row.courseName && <span>{row.courseName} {row.courseYear || ''}</span>}
                          {row.scanReceivedAt && <span>Scan to center: {fmtDt(row.scanReceivedAt)}</span>}
                          {row.paymentVerifiedAt && <span>Payment verified: {fmtDt(row.paymentVerifiedAt)}</span>}
                          {row.dispatchedAt && <span>Dispatched: {fmtDt(row.dispatchedAt)}</span>}
                          {row.deliveredAt && <span>Center received: {fmtDt(row.deliveredAt)}</span>}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div><div className="text-xs text-muted-foreground">Charge</div><div className="font-semibold">{fmt(row.chargeFee)}</div></div>
                        <div><div className="text-xs text-muted-foreground">Paid</div><div className="font-semibold text-emerald-700">{fmt(row.totalPaid)}</div></div>
                        <div><div className="text-xs text-muted-foreground">Due</div><div className="font-semibold text-amber-700">{fmt(row.dueAmount)}</div></div>
                      </div>
                      <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                        <div className="text-xs text-muted-foreground">Last follow-up</div>
                        <div className="font-medium">{row.lastFollowup ? fmtDt(row.lastFollowup.contactedAt) : 'Not called yet'}</div>
                        {row.lastFollowup?.contactWith && (
                          <div className="mt-0.5 text-xs font-semibold text-indigo-700">Talked to: {row.lastFollowup.contactWith}</div>
                        )}
                        {row.lastFollowup?.outcome && (
                          <div className="mt-0.5 text-xs font-semibold text-slate-700">{row.lastFollowup.outcome}</div>
                        )}
                        {row.nextFollowupDate && <div className="text-xs text-blue-700">Expected: {fmtDt(row.nextFollowupDate)}</div>}
                        {row.lastFollowup?.note && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.lastFollowup.note}</div>}
                      </div>
                      <Button size="sm" onClick={() => openDocFollow(row)} className="gap-1">
                        <History className="h-3.5 w-3.5" /> Mark Call
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Overdue', counts.overdue, 'border-red-200 bg-red-50 text-red-700'],
          ['This Week', counts.week, 'border-amber-200 bg-amber-50 text-amber-700'],
          ['Upcoming', counts.upcoming, 'border-blue-200 bg-blue-50 text-blue-700'],
          ['Paid', counts.paid, 'border-emerald-200 bg-emerald-50 text-emerald-700'],
        ].map(([label, value, tone]) => (
          <div key={label} className={cn('rounded-lg border p-3', tone)}>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs font-semibold uppercase tracking-wide">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={bucket} onValueChange={setBucket}>
          <TabsList className="flex h-auto flex-wrap">
            {Object.entries(BUCKETS).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return <TabsTrigger key={key} value={key} className="gap-1.5"><Icon className="h-3.5 w-3.5" /> {cfg.label}<span className="rounded-full bg-background px-1.5 text-[10px]">{counts[key] || 0}</span></TabsTrigger>;
            })}
          </TabsList>
        </Tabs>
        <div className="relative ml-auto min-w-[260px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} className="pl-9" placeholder="Search student, center, phone..." />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {students.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No installment records found</div>
        ) : (
          <div className="divide-y">
            {students.map(student => {
              const open = openId === String(student.studentId);
              const totalDue = student.installments.reduce((s, r) => s + Math.max(0, (r.installment?.amount || 0) - (r.installment?.paidAmount || 0)), 0);
              return (
                <div key={student.studentId}>
                  <button type="button" onClick={() => setOpenId(open ? '' : String(student.studentId))} className="grid w-full gap-3 p-4 text-left hover:bg-muted/30 lg:grid-cols-[1.3fr_.8fr_.8fr_auto] lg:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/students/${student.studentId}`} onClick={e => e.stopPropagation()} className="font-semibold text-foreground hover:text-primary">{student.studentName}</Link>
                        {student.enrollmentNumber && <Badge variant="outline" className="font-mono">{student.enrollmentNumber}</Badge>}
                        <Badge className={cn('border', STATUS_CLASS[student.bucket === 'paid' ? 'Paid' : student.bucket === 'overdue' ? 'Overdue' : 'Pending'])} variant="outline">{student.installments.length} installments</Badge>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">{student.centerName || 'Center'} · {student.courseName || 'Course'} {student.courseYear || ''}</div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">{student.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{student.phone}</span>}{student.email && <span>{student.email}</span>}</div>
                    </div>
                    <div><div className="text-xs text-muted-foreground">Paid</div><div className="font-semibold text-emerald-700">{fmt(student.paidAmount)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Balance</div><div className="font-semibold text-amber-700">{fmt(totalDue)}</div></div>
                    <ChevronDown className={cn('h-5 w-5 justify-self-end transition-transform', open && 'rotate-180')} />
                  </button>

                  {open && (
                    <div className="space-y-4 border-t bg-muted/10 p-4">
                      <div className="grid gap-3">
                        {student.installments.map(row => {
                          const inst = row.installment || {};
                          const due = Math.max(0, (inst.amount || 0) - (inst.paidAmount || 0));
                          const paid = row.bucket === 'paid';
                          const overdue = row.bucket === 'overdue';
                          return (
                            <div key={inst._id} className="grid gap-3 rounded-lg border bg-card p-3 lg:grid-cols-[.8fr_1fr_.9fr_.8fr_auto] lg:items-center">
                              <div><div className="text-xs text-muted-foreground">Installment</div><div className="font-semibold">#{inst.installmentNumber}</div>{inst.reasonOrRequirement && <div className="text-xs text-muted-foreground">{inst.reasonOrRequirement}</div>}</div>
                              <div className={cn('rounded-md border px-3 py-2 text-sm', overdue ? 'border-red-200 bg-red-50 text-red-700' : paid ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50')}><div className="text-xs font-medium opacity-80">Payment Date</div><div className="font-semibold">{fmtDt(row.paymentDate)}</div>{!paid && <div className="text-xs">{row.daysLeft < 0 ? `${Math.abs(row.daysLeft)} days overdue` : `${row.daysLeft} days left`}</div>}</div>
                              <div className="grid grid-cols-3 gap-2 text-sm"><div><div className="text-xs text-muted-foreground">Fee</div><div className="font-semibold">{fmt(inst.amount)}</div></div><div><div className="text-xs text-muted-foreground">Paid</div><div className="font-semibold text-emerald-700">{fmt(inst.paidAmount)}</div></div><div><div className="text-xs text-muted-foreground">Due</div><div className="font-semibold text-amber-700">{fmt(due)}</div></div></div>
                              <Badge className={cn('w-fit border', STATUS_CLASS[inst.status] || STATUS_CLASS.Pending)} variant="outline">{String(inst.status || 'Pending').replace(/_/g, ' ')}</Badge>
                              {!paid && <Button size="sm" onClick={() => openPay(student, row)}><Send className="mr-1 h-3.5 w-3.5" />Mark Paid</Button>}
                            </div>
                          );
                        })}
                      </div>

                      <div className="rounded-lg border bg-card p-3">
                        <div className="mb-2 text-sm font-semibold">Payment History</div>
                        {(student.transactions || []).length === 0 ? <div className="text-sm text-muted-foreground">No payment recorded yet</div> : (
                          <div className="space-y-2">
                            {[...student.transactions].reverse().map(tx => (
                              <div key={tx._id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
                                <div><span className="font-semibold text-emerald-700">{fmt(tx.amount)}</span><span className="ml-2 text-muted-foreground">{tx.mode || 'Payment'} · {tx.utrRef || 'No ref'}</span>{tx.note && <div className="text-xs text-muted-foreground">{tx.note}</div>}</div>
                                <div className="text-xs text-muted-foreground">{fmtDt(tx.paidAt || tx.createdAt)}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
        </>
      )}

      <Dialog open={Boolean(payTarget)} onOpenChange={v => { if (!v) setPayTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Record Installment Payment</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount *</Label><Input type="number" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} /></div>
              <div><Label>Paid Date</Label><Input type="date" value={payForm.paidAt} onChange={e => setPayForm(p => ({ ...p, paidAt: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Mode</Label><select value={payForm.mode} onChange={e => setPayForm(p => ({ ...p, mode: e.target.value }))} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"><option>UPI</option><option>Bank Transfer</option></select></div>
              <div><Label>UTR / Reference *</Label><Input value={payForm.utrRef} onChange={e => setPayForm(p => ({ ...p, utrRef: e.target.value }))} /></div>
            </div>
            {payForm.mode === 'UPI' ? <div><Label>UPI ID</Label><Input value={payForm.upiId} onChange={e => setPayForm(p => ({ ...p, upiId: e.target.value }))} /></div> : (
              <div className="grid grid-cols-2 gap-3"><div><Label>Bank Name</Label><Input value={payForm.bankName} onChange={e => setPayForm(p => ({ ...p, bankName: e.target.value }))} /></div><div><Label>Account Holder</Label><Input value={payForm.accountHolder} onChange={e => setPayForm(p => ({ ...p, accountHolder: e.target.value }))} /></div></div>
            )}
            <div><Label>Payment Screenshot</Label><Input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={e => setPayForm(p => ({ ...p, paymentScreenshot: e.target.files?.[0] || null }))} /></div>
            <div><Label>Note</Label><Textarea rows={2} value={payForm.note} onChange={e => setPayForm(p => ({ ...p, note: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPayTarget(null)}>Cancel</Button><Button onClick={submitPaid} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save Payment</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(docFollowTarget)} onOpenChange={v => { if (!v) setDocFollowTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Document Payment Follow-up</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div className="font-semibold">{docFollowTarget?.studentName}</div>
              <div className="text-muted-foreground">{docFollowTarget?.documentName} · Due {fmt(docFollowTarget?.dueAmount)}</div>
              {docFollowTarget?.centerName && <div className="text-xs text-muted-foreground">Center: {docFollowTarget.centerName}</div>}
              {docFollowTarget?.phone && <div className="text-xs text-muted-foreground">Phone: {docFollowTarget.phone}</div>}
            </div>
            <div>
              <Label>Contacted party</Label>
              <select
                value={docFollowForm.contactWith}
                onChange={e => setDocFollowForm(p => ({
                  ...p,
                  contactWith: e.target.value,
                  outcome: e.target.value === 'Dispatch' ? 'Called dispatch' : 'Called center',
                }))}
                className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="Center">Center</option>
                <option value="Dispatch">Dispatch Department</option>
              </select>
            </div>
            <div>
              <Label>Call outcome</Label>
              <select
                value={docFollowForm.outcome}
                onChange={e => setDocFollowForm(p => ({ ...p, outcome: e.target.value }))}
                className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {docFollowForm.contactWith === 'Dispatch' ? (
                  <>
                    <option>Called dispatch</option>
                    <option>Dispatch will send courier</option>
                    <option>Dispatch already sent</option>
                    <option>No response</option>
                    <option>Need admin help</option>
                  </>
                ) : (
                  <>
                    <option>Called center</option>
                    <option>Center promised payment</option>
                    <option>No response</option>
                    <option>Wrong number</option>
                    <option>Payment already done</option>
                    <option>Need counselor help</option>
                  </>
                )}
              </select>
            </div>
            <div>
              <Label>Expected payment date</Label>
              <Input type="date" value={docFollowForm.expectedPaymentDate} onChange={e => setDocFollowForm(p => ({ ...p, expectedPaymentDate: e.target.value }))} />
            </div>
            <div>
              <Label>Note</Label>
              <Textarea rows={3} value={docFollowForm.note} onChange={e => setDocFollowForm(p => ({ ...p, note: e.target.value }))} placeholder="Add the discussion summary and next action..." />
            </div>
            {docFollowTarget?.followups?.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border p-2">
                <div className="mb-1 text-xs font-semibold text-muted-foreground">Previous follow-ups</div>
                {[...docFollowTarget.followups].reverse().map(f => (
                  <div key={f._id || f.contactedAt} className="rounded-md bg-muted/30 px-2 py-1.5 text-xs">
                    <div className="font-medium">{fmtDt(f.contactedAt)} - {f.contactWith ? `${f.contactWith} - ` : ''}{f.outcome || 'Follow-up'}</div>
                    {f.expectedPaymentDate && <div className="text-blue-700">Expected: {fmtDt(f.expectedPaymentDate)}</div>}
                    {f.note && <div className="text-muted-foreground">{f.note}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocFollowTarget(null)}>Cancel</Button>
            <Button onClick={submitDocFollowup} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save Follow-up</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

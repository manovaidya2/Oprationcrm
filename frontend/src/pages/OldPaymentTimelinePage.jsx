import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, CheckCircle2, ChevronDown, Clock3, Download, Loader2, Phone, Search, Send, Trash2, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { paymentsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { usePanelDismissals } from '@/lib/usePanelDismissals';
import { toast } from 'sonner';

const fmt = n => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const fmtDt = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const today = () => new Date().toISOString().split('T')[0];
const todayFrom = d => d ? new Date(d).toISOString().split('T')[0] : '';
const MEDIA = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
const blankRow = (n = 1) => ({ installmentNumber: n, paymentDate: '', amount: '', reasonOrRequirement: '' });
const EMPTY_PAY = { amount: '', mode: 'UPI', utrRef: '', upiId: '', bankName: '', accountHolder: '', paidAt: today(), note: '', paymentScreenshot: null };

const BUCKETS = {
  all: { label: 'All', icon: CalendarClock },
  needs_timeline: { label: 'Need Timeline', icon: TriangleAlert },
  overdue: { label: 'Overdue', icon: TriangleAlert },
  week: { label: 'Need Call', icon: Clock3 },
  upcoming: { label: 'Upcoming', icon: CalendarClock },
  paid: { label: 'Paid', icon: CheckCircle2 },
};

const STATUS_CLASS = {
  Pending: 'bg-slate-50 text-slate-600 border-slate-200',
  Partially_Paid: 'bg-amber-50 text-amber-700 border-amber-200',
  Overdue: 'bg-red-50 text-red-700 border-red-200',
  Paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function cleanRows(rows = []) {
  return rows
    .map((row, idx) => ({
      _id: row._id || '',
      installmentNumber: Number(row.installmentNumber || 0) || idx + 1,
      paymentDate: row.paymentDate || '',
      amount: Number(row.amount || 0) || 0,
      reasonOrRequirement: String(row.reasonOrRequirement || '').trim(),
    }))
    .filter(row => row.installmentNumber > 0 && (row.paymentDate || row.amount > 0 || row.reasonOrRequirement));
}

function groupRows(rows) {
  const map = new Map();
  rows.forEach(row => {
    const key = String(row.studentId);
    if (!map.has(key)) map.set(key, { ...row, timelines: [], transactions: row.transactions || [] });
    const item = map.get(key);
    item.timelines.push(row);
    item.transactions = row.transactions || item.transactions || [];
  });
  const rank = { needs_timeline: 0, overdue: 1, week: 2, upcoming: 3, paid: 4 };
  return [...map.values()].map(item => {
    item.timelines.sort((a, b) => new Date(a.paymentDate || '9999-12-31') - new Date(b.paymentDate || '9999-12-31'));
    item.bucket = item.timelines.reduce((best, row) => rank[row.bucket] < rank[best] ? row.bucket : best, item.timelines[0]?.bucket || 'upcoming');
    return item;
  });
}

function PaymentProofList({ payments }) {
  const list = Array.isArray(payments) ? payments : [];
  if (!list.length) return <div className="text-sm text-muted-foreground">No payment recorded yet</div>;
  return (
    <div className="space-y-2">
      {[...list].reverse().map(tx => (
        <div key={tx._id || `${tx.amount}-${tx.paidAt || tx.createdAt}`} className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-emerald-700">{fmt(tx.amount)}</span>
              <span className="ml-2 text-muted-foreground">{tx.mode || 'Payment'}{tx.utrRef ? ` - ${tx.utrRef}` : ' - No ref'}</span>
            </div>
            <div className="text-xs text-muted-foreground">{fmtDt(tx.paidAt || tx.createdAt)}</div>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {tx.upiId && <span>UPI: {tx.upiId}</span>}
            {tx.bankName && <span>Bank: {tx.bankName}</span>}
            {tx.accountHolder && <span>Account holder: {tx.accountHolder}</span>}
            {tx.paidToAccountLabel && <span>Paid to: {tx.paidToAccountLabel}</span>}
            {tx.recordedBy?.name && <span>Added by: {tx.recordedBy.name} ({tx.recordedBy.role})</span>}
            {tx.verificationStatus && <span>Status: {String(tx.verificationStatus).replace(/_/g, ' ')}</span>}
          </div>
          {tx.note && <div className="mt-1 text-xs text-muted-foreground">{tx.note}</div>}
          {tx.paymentScreenshot && (
            <a href={`${MEDIA}${tx.paymentScreenshot}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 underline">
              <Download className="h-3 w-3" /> View payment screenshot
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

export default function OldPaymentTimelinePage() {
  const { user } = useAuth();
  const { dismiss, isDismissed } = usePanelDismissals(user, 'old-payment-timeline');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bucket, setBucket] = useState('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState('');
  const [dialogTarget, setDialogTarget] = useState(null);
  const [timelineRows, setTimelineRows] = useState([blankRow(1)]);
  const [payTarget, setPayTarget] = useState(null);
  const [payForm, setPayForm] = useState({ ...EMPTY_PAY });
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setRows(await paymentsApi.dueTimeline());
    } catch (e) {
      toast.error(e.message || 'Failed to load old student records');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => rows.reduce((acc, row) => {
    acc.all += 1;
    acc[row.bucket] = (acc[row.bucket] || 0) + 1;
    return acc;
  }, { all: 0, needs_timeline: 0, overdue: 0, week: 0, upcoming: 0, paid: 0 }), [rows]);

  const students = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupRows(rows.filter(row => {
      if (isDismissed(`old-timeline:${row.studentId}`) || isDismissed(`old-timeline-row:${row.installment?._id}`)) return false;
      if (bucket !== 'all' && row.bucket !== bucket) return false;
      if (!q) return true;
      return [row.studentName, row.centerName, row.courseName, row.enrollmentNumber, row.phone, row.email]
        .some(v => String(v || '').toLowerCase().includes(q));
    }));
  }, [rows, bucket, search, isDismissed]);

  function openTimeline(student) {
    const existing = student.timelines
      .filter(row => !row.needsTimeline)
      .map((row, idx) => ({
        _id: row.installment?._id || row._id || '',
        installmentNumber: row.installment?.installmentNumber || idx + 1,
        paymentDate: todayFrom(row.paymentDate || row.installment?.paymentDate),
        amount: row.installment?.amount || '',
        reasonOrRequirement: row.installment?.reasonOrRequirement || '',
      }));
    setDialogTarget(student);
    setTimelineRows(existing.length ? existing : [{ ...blankRow(1), amount: student.dueAmount || '' }]);
  }

  function openPay(student, row) {
    const inst = row.installment || {};
    setPayTarget({ student, row });
    setPayForm({ ...EMPTY_PAY, amount: String(Math.max(0, (inst.amount || 0) - (inst.paidAmount || 0)) || inst.amount || '') });
  }

  function updateRow(index, field, value) {
    setTimelineRows(prev => prev.map((row, idx) => idx === index ? { ...row, [field]: value } : row));
  }

  function addRow() {
    setTimelineRows(prev => {
      const expected = Number(dialogTarget?.dueAmount || 0);
      const used = cleanRows(prev).reduce((sum, row) => sum + (Number(row.amount || 0) || 0), 0);
      return [...prev, { ...blankRow((Number(prev.at(-1)?.installmentNumber) || prev.length || 0) + 1), amount: Math.max(0, expected - used) || '' }];
    });
  }

  function removeRow(index) {
    setTimelineRows(prev => prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== index));
  }

  async function saveTimeline() {
    const cleaned = cleanRows(timelineRows);
    const expected = Number(dialogTarget?.dueAmount || 0);
    const total = cleaned.reduce((sum, row) => sum + (Number(row.amount || 0) || 0), 0);
    if (!cleaned.length) return toast.error('Add at least one timeline row');
    if (cleaned.some(row => !row.paymentDate)) return toast.error('Payment date is required for every timeline row');
    if (total !== expected) return toast.error(`Timeline total must match pending balance. Pending balance is ${fmt(expected)}, timeline total is ${fmt(total)}.`);
    setSaving(true);
    try {
      await paymentsApi.updatePaymentTimeline(dialogTarget.paymentId, { timeline: cleaned });
      toast.success('Payment timeline saved');
      setDialogTarget(null);
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitPaid() {
    if (!payTarget) return;
    if (!payForm.amount || Number(payForm.amount) <= 0) return toast.error('Enter valid paid amount');
    if (!payForm.utrRef.trim()) return toast.error('UTR / reference required');
    const keepOpenStudentId = String(payTarget.student?.studentId || '');
    const fd = new FormData();
    ['amount', 'mode', 'utrRef', 'upiId', 'bankName', 'accountHolder', 'paidAt', 'note'].forEach(k => fd.append(k, payForm[k] || ''));
    if (payForm.paymentScreenshot) fd.append('paymentScreenshot', payForm.paymentScreenshot);
    setSaving(true);
    try {
      await paymentsApi.markInstallmentPaid(payTarget.row.paymentId, payTarget.row.installment._id, fd);
      toast.success('Payment recorded');
      setPayTarget(null);
      setPayForm({ ...EMPTY_PAY });
      await load();
      setBucket('all');
      setOpenId(keepOpenStudentId);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><CalendarClock className="h-5 w-5" /> Old Student Records</h1>
          <p className="text-sm text-muted-foreground">Create and manage payment timelines for students with pending balances and no original installment plan.</p>
        </div>
        <Button variant="outline" onClick={load}>Refresh</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        {[
          ['Need Timeline', counts.needs_timeline, 'border-red-200 bg-red-50 text-red-700'],
          ['Overdue', counts.overdue, 'border-orange-200 bg-orange-50 text-orange-700'],
          ['Need Call', counts.week, 'border-amber-200 bg-amber-50 text-amber-700'],
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
        <div className="relative ml-auto min-w-[280px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} className="pl-9" placeholder="Search student, center, phone..." />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {students.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No old student payment records found</div>
        ) : (
          <div className="divide-y">
            {students.map(student => {
              const open = openId === String(student.studentId);
              const pendingTimeline = student.timelines.reduce((sum, row) => sum + Math.max(0, (row.installment?.amount || 0) - (row.installment?.paidAmount || 0)), 0);
              const hasTimeline = student.timelines.some(row => !row.needsTimeline);
              const pendingVerification = (student.transactions || [])
                .filter(tx => ['pending_counselor', 'pending_accountant'].includes(tx.verificationStatus || ''))
                .reduce((sum, tx) => sum + (Number(tx.amount || 0) || 0), 0);
              return (
                <div key={student.studentId}>
                  <button type="button" onClick={() => setOpenId(open ? '' : String(student.studentId))} className="grid w-full gap-3 p-4 text-left hover:bg-muted/30 xl:grid-cols-[1.35fr_1.35fr_auto] xl:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/students/${student.studentId}`} onClick={e => e.stopPropagation()} className="font-semibold hover:text-primary">{student.studentName}</Link>
                        {student.enrollmentNumber && <Badge variant="outline" className="font-mono">{student.enrollmentNumber}</Badge>}
                        <Badge variant="outline">{hasTimeline ? `${student.timelines.length} timeline rows` : 'Need timeline'}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">{student.centerName || 'Center'} · {student.courseName || 'Course'} {student.courseYear || ''}</div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">{student.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{student.phone}</span>}{student.email && <span>{student.email}</span>}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <div className="text-[11px] text-muted-foreground">Total Fee</div>
                        <div className="font-semibold">{fmt(student.totalFee)}</div>
                      </div>
                      <div className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5">
                        <div className="text-[11px] text-muted-foreground">Net Fee</div>
                        <div className="font-semibold text-blue-700">{fmt(student.netFee)}</div>
                      </div>
                      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5">
                        <div className="text-[11px] text-muted-foreground">Verified Paid</div>
                        <div className="font-semibold text-emerald-700">{fmt(student.paidAmount)}</div>
                      </div>
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5">
                        <div className="text-[11px] text-muted-foreground">Outstanding</div>
                        <div className="font-semibold text-amber-700">{fmt(student.dueAmount)}</div>
                      </div>
                      <div className="rounded-md border border-purple-200 bg-purple-50 px-2 py-1.5">
                        <div className="text-[11px] text-muted-foreground">Timeline Due</div>
                        <div className="font-semibold text-purple-700">{fmt(pendingTimeline)}</div>
                      </div>
                      {pendingVerification > 0 && (
                        <div className="rounded-md border border-orange-200 bg-orange-50 px-2 py-1.5 md:col-span-5">
                          <div className="text-[11px] text-muted-foreground">Payment Verification Pending</div>
                          <div className="font-semibold text-orange-700">{fmt(pendingVerification)}</div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button type="button" size="sm" variant={hasTimeline ? 'outline' : 'default'} onClick={e => { e.stopPropagation(); openTimeline(student); }}>
                        {hasTimeline ? 'Edit Timeline' : 'Add Timeline'}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-600 hover:text-red-700"
                        onClick={e => { e.stopPropagation(); dismiss(`old-timeline:${student.studentId}`); }}
                        title="Delete from my panel"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <ChevronDown className={cn('h-5 w-5 transition-transform', open && 'rotate-180')} />
                    </div>
                  </button>

                  {open && (
                    <div className="space-y-3 border-t bg-muted/10 p-4">
                      {student.timelines.map(row => {
                        const inst = row.installment || {};
                        const due = Math.max(0, (inst.amount || 0) - (inst.paidAmount || 0));
                        const paid = row.bucket === 'paid';
                        const overdue = row.bucket === 'overdue';
                        const paidTx = row.paidTransaction || inst.paidTransaction || null;
                        const pendingTx = row.pendingTransaction || inst.pendingTransaction || null;
                        return (
                          <div key={inst._id} className="grid gap-3 rounded-lg border bg-card p-3 lg:grid-cols-[.8fr_1fr_.9fr_.8fr_auto] lg:items-center">
                            <div><div className="text-xs text-muted-foreground">Timeline</div><div className="font-semibold">{row.needsTimeline ? 'Not set' : `#${inst.installmentNumber}`}</div>{inst.reasonOrRequirement && <div className="text-xs text-muted-foreground">{inst.reasonOrRequirement}</div>}</div>
                            <div className={cn('rounded-md border px-3 py-2 text-sm', overdue ? 'border-red-200 bg-red-50 text-red-700' : paid ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50')}>
                              <div className="text-xs font-medium opacity-80">Scheduled Payment Date</div>
                              <div className="font-semibold">{fmtDt(row.paymentDate)}</div>
                              {!row.needsTimeline && !paid && <div className="text-xs">{row.daysLeft < 0 ? `${Math.abs(row.daysLeft)} days overdue` : `${row.daysLeft} days left`}</div>}
                              {paid && <div className="text-xs font-semibold text-emerald-700">Paid on: {fmtDt(row.actualPaidAt || inst.actualPaidAt || inst.paidAt)}</div>}
                              {paid && paidTx && (
                                <div className="mt-1 text-xs text-emerald-800">
                                  {fmt(paidTx.amount)} {paidTx.mode || 'Payment'}{paidTx.utrRef ? ` - ${paidTx.utrRef}` : ''}
                                </div>
                              )}
                              {!paid && pendingTx && (
                                <div className="mt-1 text-xs font-semibold text-amber-700">
                                  Verification pending: {fmt(pendingTx.amount)} {pendingTx.mode || 'Payment'}{pendingTx.utrRef ? ` - ${pendingTx.utrRef}` : ''}
                                </div>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-sm"><div><div className="text-xs text-muted-foreground">Amount</div><div className="font-semibold">{fmt(inst.amount)}</div></div><div><div className="text-xs text-muted-foreground">Paid</div><div className="font-semibold text-emerald-700">{fmt(inst.paidAmount)}</div></div><div><div className="text-xs text-muted-foreground">Due</div><div className="font-semibold text-amber-700">{fmt(due)}</div></div></div>
                            <Badge className={cn('w-fit border', pendingTx ? 'border-amber-200 bg-amber-50 text-amber-700' : STATUS_CLASS[inst.status] || STATUS_CLASS.Pending)} variant="outline">{pendingTx ? 'Verification Pending' : String(inst.status || 'Pending').replace(/_/g, ' ')}</Badge>
                            {!row.needsTimeline && !paid && !pendingTx && <Button size="sm" onClick={() => openPay(student, row)}><Send className="mr-1 h-3.5 w-3.5" />Mark Paid</Button>}
                          </div>
                        );
                      })}
                      <div className="rounded-lg border bg-card p-3">
                        <div className="mb-2 text-sm font-semibold">Payment Details</div>
                        <PaymentProofList payments={student.transactions || []} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={Boolean(dialogTarget)} onOpenChange={v => { if (!v) setDialogTarget(null); }}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Old Student Payment Timeline</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm sm:grid-cols-4">
              <div><div className="text-xs text-muted-foreground">Student</div><div className="font-semibold">{dialogTarget?.studentName}</div></div>
              <div><div className="text-xs text-muted-foreground">Center</div><div className="font-semibold">{dialogTarget?.centerName || 'Center'}</div></div>
              <div><div className="text-xs text-muted-foreground">Paid</div><div className="font-semibold text-emerald-700">{fmt(dialogTarget?.paidAmount)}</div></div>
              <div><div className="text-xs text-muted-foreground">Pending Balance</div><div className="font-semibold text-amber-700">{fmt(dialogTarget?.dueAmount)}</div></div>
            </div>
            {timelineRows.map((row, idx) => (
              <div key={idx} className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[90px_1fr_1fr_1.4fr_auto] sm:items-end">
                <div><Label className="text-xs">No.</Label><Input type="number" min="1" value={row.installmentNumber || ''} onChange={e => updateRow(idx, 'installmentNumber', e.target.value)} /></div>
                <div><Label className="text-xs">Payment Date</Label><Input type="date" value={row.paymentDate || ''} onChange={e => updateRow(idx, 'paymentDate', e.target.value)} /></div>
                <div><Label className="text-xs">Amount</Label><Input type="number" min="0" value={row.amount || ''} onChange={e => updateRow(idx, 'amount', e.target.value)} /></div>
                <div><Label className="text-xs">Reason / Requirement</Label><Input value={row.reasonOrRequirement || ''} onChange={e => updateRow(idx, 'reasonOrRequirement', e.target.value)} placeholder="Call note or payment condition" /></div>
                <Button type="button" variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => removeRow(idx)} disabled={timelineRows.length <= 1}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
              <div>Timeline Total: <b>{fmt(cleanRows(timelineRows).reduce((sum, row) => sum + (Number(row.amount || 0) || 0), 0))}</b><span className="ml-2 text-muted-foreground">Pending balance must match {fmt(dialogTarget?.dueAmount)}</span></div>
              <Button type="button" variant="outline" onClick={addRow}>Add Row</Button>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogTarget(null)}>Cancel</Button><Button onClick={saveTimeline} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save Timeline</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(payTarget)} onOpenChange={v => { if (!v) setPayTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Record Old Student Payment</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
              <div className="font-semibold">{payTarget?.student?.studentName}</div>
              <div className="text-xs text-muted-foreground">{payTarget?.student?.centerName || 'Center'} · Pending {fmt(payTarget?.student?.dueAmount)}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount *</Label><Input type="number" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} /></div>
              <div><Label>Paid Date</Label><Input type="date" value={payForm.paidAt} onChange={e => setPayForm(p => ({ ...p, paidAt: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Mode</Label><select value={payForm.mode} onChange={e => setPayForm(p => ({ ...p, mode: e.target.value }))} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"><option>UPI</option><option>Bank Transfer</option></select></div>
              <div><Label>UTR / Reference *</Label><Input value={payForm.utrRef} onChange={e => setPayForm(p => ({ ...p, utrRef: e.target.value }))} /></div>
            </div>
            {payForm.mode === 'UPI' ? (
              <div><Label>UPI ID</Label><Input value={payForm.upiId} onChange={e => setPayForm(p => ({ ...p, upiId: e.target.value }))} /></div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Bank Name</Label><Input value={payForm.bankName} onChange={e => setPayForm(p => ({ ...p, bankName: e.target.value }))} /></div>
                <div><Label>Account Holder</Label><Input value={payForm.accountHolder} onChange={e => setPayForm(p => ({ ...p, accountHolder: e.target.value }))} /></div>
              </div>
            )}
            <div><Label>Payment Screenshot</Label><Input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={e => setPayForm(p => ({ ...p, paymentScreenshot: e.target.files?.[0] || null }))} /></div>
            <div><Label>Note</Label><Input value={payForm.note} onChange={e => setPayForm(p => ({ ...p, note: e.target.value }))} placeholder="Optional note" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPayTarget(null)}>Cancel</Button><Button onClick={submitPaid} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save Payment</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { AlertTriangle, CheckCircle2, Download, Eye, FileText, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MEDIA } from '@/lib/api';
import { requestSection } from '@/lib/documentOptions';
import { byLine, counselorApproval, docPaid } from '@/lib/docRequests';

const fmt = n => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const fmtDt = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

// Where the request stands, as a pill
const STAGES = {
  Requested:         ['New request',           'border-indigo-200 bg-indigo-50 text-indigo-700'],
  Forwarded:         ['Approved by counselor', 'border-indigo-200 bg-indigo-50 text-indigo-700'],
  Fee_Pending:       ['Kept pending',          'border-amber-200 bg-amber-50 text-amber-700'],
  Payment_Submitted: ['Payment submitted',     'border-emerald-200 bg-emerald-50 text-emerald-700'],
};

function MoneyStat({ label, value, tone = 'text-slate-800' }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`truncate text-sm font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function DocPaymentRow({ p, accMap }) {
  const paidTo = accMap?.[String(p.paidToAccount)]?.label || p.paidToAccountLabel;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-bold tabular-nums text-emerald-700">{fmt(p.amount)}</span>
        {p.mode && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">{p.mode}</span>}
        {p.utrRef && <span className="text-slate-500">UTR <span className="font-mono font-semibold text-slate-700">{p.utrRef}</span></span>}
        {p.paidAt && <span className="text-slate-500">{fmtDt(p.paidAt)}</span>}
        {paidTo && <span className="font-medium text-indigo-700">→ {paidTo}</span>}
        {p.paymentScreenshot && (
          <a href={`${MEDIA}${p.paymentScreenshot}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline">
            <Download className="h-3 w-3"/>Screenshot
          </a>
        )}
        <span className={`ml-auto rounded-full border px-2 py-0.5 font-semibold ${p.verified ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
          {p.verified ? 'Verified' : 'Not verified'}
        </span>
      </div>
      {(p.mode === 'UPI' && p.upiId) && <div className="mt-1 text-slate-500">UPI ID <span className="font-semibold text-slate-700">{p.upiId}</span></div>}
      {(p.mode === 'Bank Transfer' && (p.bankName || p.accountHolder)) && (
        <div className="mt-1 text-slate-500">{[p.bankName, p.accountHolder, p.accountNumber, p.ifscCode].filter(Boolean).join(' · ')}</div>
      )}
      {(p.recordedBy?.name || p.note) && (
        <div className="mt-1 text-[11px] text-slate-400">
          {p.recordedBy?.name && <>Added by <span className="font-semibold text-slate-600">{byLine(p.recordedBy)}</span></>}
          {p.recordedBy?.name && p.note && ' · '}
          {p.note && <span className="italic">“{p.note}”</span>}
        </div>
      )}
    </div>
  );
}

// One document request with everything needed to act on it: what was asked, for whom, by whom, the
// document fee and its payments, and for a marksheet the student's course fee. The panel passes its own
// action buttons as children.
//   selectable/selected/onToggle - bulk selection     onOpen - the request's history (optional)
//   onOpenStudent - the student's full details
export function DocRequestCard({ d, accMap, selectable, selected, onToggle, onOpen, onOpenStudent, children }) {
  const isMarksheet = requestSection(d) === 'Marksheet';
  const urgent = !isMarksheet && !!d.urgent;
  const DocIcon = isMarksheet ? GraduationCap : FileText;
  const [stageLabel, stageTone] = STAGES[d.status] || [d.status?.replace(/_/g, ' ') || '', 'border-slate-200 bg-slate-50 text-slate-600'];
  const withPayment = d.status !== 'Payment_Submitted' && d.payments?.length > 0;
  const charge = Number(d.chargeFee) || 0;
  const received = docPaid(d);
  const notVerified = (d.payments || []).filter(p => !p.verified).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balance = Math.max(0, charge - received);
  const pct = charge > 0 ? Math.min(100, Math.round((received / charge) * 100)) : 0;
  const course = d.courseFeeSummary;
  const courseTotal = course ? (course.netFee || course.totalFee || 0) : 0;
  const approval = counselorApproval(d);
  return (
    <div className={`rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md ${urgent ? 'border-l-4 border-l-red-500' : ''} ${selected ? 'border-indigo-400 ring-1 ring-indigo-200' : urgent ? 'border-red-200' : 'border-slate-200'}`}>
      <div className="flex gap-3 p-4">
        {selectable && (
          <input type="checkbox" checked={!!selected} onChange={onToggle} aria-label={`Select ${d.name}`} className="mt-3 h-4 w-4 shrink-0 accent-indigo-600"/>
        )}
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isMarksheet ? 'bg-violet-50 text-violet-600' : 'bg-sky-50 text-sky-600'}`}>
          <DocIcon className="h-5 w-5"/>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          {/* What, for whom */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              {onOpen
                ? <button type="button" onClick={onOpen} title="Request history" className="text-left text-sm font-semibold text-slate-900 hover:text-indigo-700">{d.name}</button>
                : <div className="text-sm font-semibold text-slate-900">{d.name}</div>}
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <button type="button" onClick={onOpenStudent} title="Student details" className="font-medium text-slate-700 hover:text-indigo-700 hover:underline">{d.student?.name || 'Student'}</button>
                {d.student?.enrollmentNumber && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 font-mono font-bold text-emerald-700">{d.student.enrollmentNumber}</span>}
                {d.center?.name && <span>· {d.center.name}</span>}
                {d.student?.courseName && <span>· {d.student.courseName}</span>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {urgent && (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-600 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white"
                  title={d.urgentMarkedBy?.name ? `Marked urgent by ${byLine(d.urgentMarkedBy)} · ${fmtDt(d.urgentMarkedAt)}` : 'Urgent request'}>
                  <AlertTriangle className="h-3 w-3"/>Urgent
                </span>
              )}
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${stageTone}`}>{stageLabel}{withPayment ? ' + payment' : ''}</span>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${d.requestType === 'Hard Copy' ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>{d.requestType || 'Soft Copy'}</span>
            </div>
          </div>

          {/* Money: this document, and (for a marksheet) the student's course fee */}
          <div className={`grid gap-3 ${isMarksheet ? 'md:grid-cols-2' : ''}`}>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{isMarksheet ? 'Marksheet fee' : 'Document fee'}</span>
                {charge > 0 && (balance > 0
                  ? <span className="text-[11px] font-semibold text-amber-700">{fmt(balance)} to pay</span>
                  : <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3"/>Fully paid</span>)}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MoneyStat label="Charge" value={charge ? fmt(charge) : 'Not set'} tone={charge ? 'text-slate-800' : 'text-slate-400'}/>
                <MoneyStat label="Received" value={fmt(received)} tone="text-emerald-700"/>
                <MoneyStat label="Balance" value={fmt(balance)} tone={balance > 0 ? 'text-amber-700' : 'text-emerald-700'}/>
              </div>
              {charge > 0 && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }}/></div>}
              {notVerified > 0 && <p className="mt-2 text-[11px] font-medium text-amber-700">{fmt(notVerified)} of this is not verified yet</p>}
            </div>
            {isMarksheet && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Course fee</span>
                  {course && (course.dueAmount > 0
                    ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertTriangle className="h-3 w-3"/>Not fully paid</span>
                    : <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3"/>Fully paid</span>)}
                </div>
                {course ? (
                  <div className="grid grid-cols-3 gap-2">
                    <MoneyStat label="Total fee" value={fmt(courseTotal)}/>
                    <MoneyStat label="Paid" value={fmt(course.paidAmount)} tone="text-emerald-700"/>
                    <MoneyStat label="Due" value={fmt(course.dueAmount)} tone={course.dueAmount > 0 ? 'text-red-600' : 'text-emerald-700'}/>
                  </div>
                ) : <p className="text-xs text-slate-500">Course fee is not set for this student</p>}
              </div>
            )}
          </div>

          {/* Payments made for this document */}
          {d.payments?.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Payments ({d.payments.length})</div>
              {d.payments.map(p => <DocPaymentRow key={p._id} p={p} accMap={accMap}/>)}
            </div>
          )}
          {d.note && <p className="text-xs italic text-slate-500">Note: “{d.note}”</p>}

          {/* Who asked / approved, and the panel's actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <div className="space-y-0.5 text-xs text-slate-500">
              <div>Requested by <span className="font-semibold text-slate-700">{byLine(d.uploadedBy) || 'Centre'}</span> · {fmtDt(d.createdAt)}</div>
              {approval && (
                <div>Approved by <span className="font-semibold text-slate-700">{byLine(approval.by) || 'Counselor'}</span> · {fmtDt(approval.at)}</div>
              )}
              {urgent && d.urgentMarkedBy?.name && (
                <div className="font-medium text-red-600">Marked urgent by <span className="font-semibold">{byLine(d.urgentMarkedBy)}</span> · {fmtDt(d.urgentMarkedAt)}</div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-slate-500" title="Student's full details: info, documents, fees" onClick={onOpenStudent}>
                <Eye className="mr-1 h-3.5 w-3.5"/>Details
              </Button>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

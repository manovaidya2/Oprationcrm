import { AlertTriangle, CheckCircle2, Clock, Loader2, RotateCcw } from 'lucide-react';
import { TIMELINE_STAGES, stageOf } from '@/lib/admissionTimeline';

const fmtAmt = n => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const fmtDay = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '');
const paidPct = row => (row.feeSet && row.netFee > 0 ? Math.min(100, Math.round((row.paid / row.netFee) * 100)) : 0);
const SOON_DAYS = 5;   // "auto-cancel in N days" shows from this many days before

// "Day 23", "Due 12 Dec" (instalment not due yet) or "Restored · 8d left"
function clockLabel(row) {
  if (row.basis === 'restore') return `Restored · ${Math.max(0, row.daysLeft)}d left`;
  if (row.upcoming) return `Due ${fmtDay(row.clockStart)}`;
  return `Day ${row.days}`;
}

// Red pill near / past the limit: a countdown for admissions under the auto-cancel rule, or
// "Cancel admission" for older admissions past day 50 (they are not cancelled automatically — decide by hand)
function CancelPill({ row }) {
  const text = !row.autoCancel ? 'Cancel admission'
    : row.daysLeft <= 0 ? 'Auto-cancelling' : `Auto-cancel in ${row.daysLeft} day${row.daysLeft === 1 ? '' : 's'}`;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white"
      title={row.autoCancel ? undefined : 'Admission from before the auto-cancel rule — it is not cancelled automatically'}>
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"/>
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white"/>
      </span>
      {text}
    </span>
  );
}
const showCancelPill = row => (row.autoCancel ? row.daysLeft <= SOON_DAYS : row.overdue);

// Compact badge for a student card elsewhere (e.g. the centre's student list)
export function TimelineBadge({ row }) {
  if (!row) return null;
  const stage = stageOf(row.stage);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${stage.pill}`}>
        {row.basis === 'restore' ? <RotateCcw className="h-3 w-3"/> : <Clock className="h-3 w-3"/>}{clockLabel(row)}
      </span>
      <span className="text-slate-500">{row.feeSet ? `${fmtAmt(row.due)} due` : 'Fee not set'}</span>
      {row.pending > 0 && <span className="text-blue-600">· {fmtAmt(row.pending)} pending verification</span>}
      {showCancelPill(row) && <CancelPill row={row}/>}
    </div>
  );
}

function TimelineCard({ row, stage, showCentre, onOpen }) {
  const pct = paidPct(row);
  const cancelSoon = showCancelPill(row);
  return (
    <button type="button" onClick={() => onOpen?.(row)}
      className={`w-full rounded-lg border bg-white p-3 text-left shadow-sm transition hover:-translate-y-px hover:shadow-md ${cancelSoon ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200 hover:border-slate-300'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{row.name}</div>
          <div className="truncate text-xs text-slate-500">
            {[showCentre && row.center?.name, [row.courseName, row.courseYear].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${stage.pill}`}>{clockLabel(row)}</span>
      </div>

      {row.basis === 'instalment' && (
        <div className="mt-1 text-[11px] text-slate-500">{row.upcoming ? 'Next instalment' : 'Instalment due'} {fmtDay(row.clockStart)}</div>
      )}

      {row.feeSet ? (
        <div className="mt-2.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${stage.fill}`} style={{ width: `${pct}%` }}/>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] tabular-nums">
            <span className="text-slate-500">{fmtAmt(row.paid)} of {fmtAmt(row.netFee)}</span>
            <span className="font-semibold text-slate-800">{fmtAmt(row.due)} due</span>
          </div>
        </div>
      ) : (
        <div className="mt-2.5 text-[11px] font-medium text-amber-700">Fee not set</div>
      )}

      {(row.pending > 0 || cancelSoon) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          {row.pending > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">{fmtAmt(row.pending)} pending verification</span>}
          {cancelSoon && <CancelPill row={row}/>}
        </div>
      )}
    </button>
  );
}

// autoCancelFrom: start date of the auto-cancel rule (admissions submitted before it are never cancelled automatically)
export function AdmissionTimeline({ rows = [], loading = false, showCentre = false, onOpen, autoCancelFrom, title = 'Admission Payment Timeline' }) {
  const cancelSoon = rows.filter(r => r.autoCancel && showCancelPill(r)).length;
  const manualOverdue = rows.filter(r => !r.autoCancel && r.overdue).length;
  const ruleDate = autoCancelFrom ? new Date(autoCancelFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Clock className="h-4 w-4"/>
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">
              Days since submission (or the missed instalment) until the course fee is fully paid · auto-cancel at day 50
              {ruleDate ? ` for admissions submitted from ${ruleDate}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 tabular-nums">
            {rows.length} pending payment{rows.length === 1 ? '' : 's'}
          </span>
          {cancelSoon > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700 tabular-nums">
              <AlertTriangle className="h-3.5 w-3.5"/>{cancelSoon} auto-cancel within {SOON_DAYS} days
            </span>
          )}
          {manualOverdue > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700 tabular-nums"
              title="Older admissions are not cancelled automatically — decide by hand">
              <AlertTriangle className="h-3.5 w-3.5"/>{manualOverdue} past day 50 — cancel by hand
            </span>
          )}
        </div>
      </header>

      {loading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-300"/></div>
      ) : (
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {TIMELINE_STAGES.map(stage => {
            const list = rows.filter(r => r.stage === stage.key);
            return (
              <div key={stage.key} className={`flex min-w-0 flex-col rounded-lg border border-t-[3px] ${stage.col} ${stage.top}`}>
                <div className="flex items-start justify-between gap-2 px-3 pb-2 pt-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <span className={`h-2 w-2 rounded-full ${stage.dot}`}/>{stage.label}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">{stage.hint}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${stage.pill}`}>{list.length}</span>
                </div>
                <div className="max-h-96 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
                  {list.length === 0 ? (
                    <div className={`flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-6 text-xs ${stage.empty}`}>
                      <CheckCircle2 className="h-4 w-4"/>All clear
                    </div>
                  ) : list.map(r => <TimelineCard key={r._id} row={r} stage={stage} showCentre={showCentre} onOpen={onOpen}/>)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

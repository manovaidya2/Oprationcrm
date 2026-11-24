// Admission payment timeline — shared by GET /admission-timeline and the auto-cancel job.
//
// An admission is on the timeline from its first submission until its course fee is fully paid
// (paid = verified money, Payment.paidAmount). Its clock starts at:
//   - a restore            -> the restore date; it then has 20 days to complete the fee
//   - an instalment plan   -> the due date of the first instalment not yet fully paid
//                             (Payment.installments, else the old-student dueTimeline)
//   - otherwise            -> the first submission
// Stage by days since the clock start: 0-14 none, 15-29 yellow, 30-44 orange, 45+ red (a restored admission is red).
// It is cancelled automatically at day 50 (day 20 after a restore) — but only admissions first submitted on or after
// the auto-cancel start date. Older admissions stay on the timeline and are flagged after day 50 for a manual decision.
const Student = require('../models/Student');
const Payment = require('../models/Payment');
require('../models/Center');      // registered here so populate('center') also works outside the API (job / scripts)
require('../models/Counselor');   // same for populate('counselor')

const TIMELINE_DAYS = { yellow: 15, orange: 30, red: 45, cancel: 50, restoreGrace: 20 };
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86400000;
const istDay = d => Math.floor((new Date(d).getTime() + IST_OFFSET_MS) / DAY_MS);

// Auto-cancel applies only to admissions first submitted on or after this date (IST).
// Change it with AUTO_CANCEL_FROM=YYYY-MM-DD in .env.
const AUTO_CANCEL_FROM_DEFAULT = '2026-11-24';
function autoCancelFrom() {
  const fromEnv = new Date(`${String(process.env.AUTO_CANCEL_FROM || '').trim()}T00:00:00+05:30`);
  return Number.isNaN(fromEnv.getTime()) ? new Date(`${AUTO_CANCEL_FROM_DEFAULT}T00:00:00+05:30`) : fromEnv;
}

// Admissions that can be on the timeline (and be auto-cancelled)
function timelineConditions() {
  return [
    { 'statusHistory.status': 'Submitted' },
    // not started, closed, or rejected by the university (refund / adjustment path)
    { applicationStatus: { $nin: ['Draft', 'Cancelled', 'Rejected', 'University_Rejected'] } },
    { $nor: [{ applicationStatus: 'Accountant_Rejected', rejectedVia: 'university' }] },
  ];
}

function timelineStage(days) {
  if (days >= TIMELINE_DAYS.red) return 'red';
  if (days >= TIMELINE_DAYS.orange) return 'orange';
  if (days >= TIMELINE_DAYS.yellow) return 'yellow';
  return 'none';
}

function firstSubmittedAt(student) {
  const times = (student.statusHistory || [])
    .filter(h => h.status === 'Submitted' && h.at)
    .map(h => new Date(h.at).getTime());
  return times.length ? new Date(Math.min(...times)) : null;
}

// Due date of the first instalment that is not fully paid (null when there is no dated plan left to pay)
function firstUnpaidInstalmentDate(payment) {
  const plan = (payment?.installments || []).filter(r => Number(r.amount) > 0);
  const rows = plan.length ? plan : (payment?.dueTimeline || []).filter(r => Number(r.amount) > 0);
  const unpaid = rows
    .filter(r => r.paymentDate && Number(r.paidAmount || 0) < Number(r.amount))
    .sort((a, b) => new Date(a.paymentDate) - new Date(b.paymentDate));
  return unpaid[0]?.paymentDate || null;
}

function feeSummary(payment) {
  const netFee = Number(payment?.netFee || 0);
  const paid = Number(payment?.paidAmount || 0);
  const pending = (payment?.transactions || [])
    .filter(t => (t.type || 'Fee') === 'Fee' && !t.documentRef && ['pending_counselor', 'pending_accountant'].includes(t.verificationStatus))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  return { feeSet: netFee > 0, netFee, paid, pending, due: Math.max(0, netFee - paid), fullyPaid: netFee > 0 && paid >= netFee };
}

// One timeline row, or null when the admission is not on the timeline (fully paid / never submitted)
function timelineRow(student, payment, today, cancelFrom) {
  const submittedAt = firstSubmittedAt(student);
  if (!submittedAt) return null;
  const fee = feeSummary(payment);
  if (fee.fullyPaid) return null;

  // Older admissions (before the auto-cancel start date) are never cancelled automatically
  const autoCancel = submittedAt >= cancelFrom;
  let basis = 'submission';
  let clockStart = submittedAt;
  let limit = TIMELINE_DAYS.cancel;
  if (autoCancel && student.restoredAt) {
    basis = 'restore'; clockStart = student.restoredAt; limit = TIMELINE_DAYS.restoreGrace;
  } else {
    const instalmentDue = firstUnpaidInstalmentDate(payment);
    if (instalmentDue) { basis = 'instalment'; clockStart = instalmentDue; }
  }
  const elapsed = today - istDay(clockStart);          // negative: the next instalment is not due yet
  const days = Math.max(0, elapsed);
  const daysLeft = limit - elapsed;
  return {
    _id: student._id,
    name: student.name,
    phone: student.phone || '',
    courseName: student.courseName || '',
    courseYear: student.courseYear || '',
    applicationStatus: student.applicationStatus,
    enrollmentNumber: student.enrollmentNumber || '',
    center: student.center || null,
    counselor: student.counselor || null,
    submittedAt,
    basis,
    clockStart,
    upcoming: elapsed < 0,
    days,
    daysLeft,
    stage: basis === 'restore' ? 'red' : timelineStage(days),
    autoCancel,
    overdue: daysLeft <= 0,                  // past the limit
    cancelDue: autoCancel && daysLeft <= 0,  // the job cancels it
    ...fee,
  };
}

// Timeline rows for the students matching `conditions` (role scope, centre filter...), oldest first
async function buildTimeline(conditions = [], now = new Date()) {
  const students = await Student.find({ $and: [...conditions, ...timelineConditions()] })
    .select('name phone courseName courseYear applicationStatus enrollmentNumber center counselor statusHistory restoredAt')
    .populate('center', 'name city')
    .populate('counselor', 'name')
    .lean();
  const payments = await Payment.find({ student: { $in: students.map(s => s._id) } })
    .select('student netFee paidAmount installments dueTimeline transactions.amount transactions.type transactions.documentRef transactions.verificationStatus')
    .lean();
  const paymentOf = new Map(payments.map(p => [String(p.student), p]));
  const today = istDay(now);
  const cancelFrom = autoCancelFrom();
  return students
    .map(s => timelineRow(s, paymentOf.get(String(s._id)), today, cancelFrom))
    .filter(Boolean)
    .sort((a, b) => a.daysLeft - b.daysLeft || b.days - a.days);
}

module.exports = { TIMELINE_DAYS, buildTimeline, feeSummary, firstSubmittedAt, autoCancelFrom };

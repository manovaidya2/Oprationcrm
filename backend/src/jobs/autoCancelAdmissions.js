// Auto-cancel admissions whose course fee was not fully paid in time (rules: utils/admissionTimeline.js).
// Only admissions first submitted on or after AUTO_CANCEL_FROM (default 2026-11-24) are cancelled; older ones never.
// Runs when the server starts and then every hour. Set AUTO_CANCEL_ADMISSIONS=off in .env to stop it.
// Safe to run repeatedly or on several servers: a student is switched only while it is still in the status we read.
const Student = require('../models/Student');
const User    = require('../models/User');
const { buildTimeline, TIMELINE_DAYS } = require('../utils/admissionTimeline');
const { audit, notify, centreCounselorUserIds, adminUserIds } = require('../utils/helpers');

const SYSTEM = { role: 'System' };
const EVERY_MS = 60 * 60 * 1000;

function cancelNote(row) {
  if (row.basis === 'restore') return `Auto-cancelled: course fee not fully paid within ${TIMELINE_DAYS.restoreGrace} days of restore`;
  const from = row.basis === 'instalment' ? 'of the instalment due date' : 'of submission';
  return `Auto-cancelled: course fee not fully paid within ${TIMELINE_DAYS.cancel} days ${from}`;
}

// dryRun: only return who would be cancelled
async function runAutoCancel({ dryRun = false, now = new Date() } = {}) {
  const due = (await buildTimeline([], now)).filter(r => r.cancelDue);
  if (dryRun) return { cancelled: due, dryRun: true };

  const done = [];
  const namesFor = new Map();   // user id -> names of their admissions that were cancelled
  const tell = (ids, name) => ids.forEach(id => {
    const key = String(id);
    if (!namesFor.has(key)) namesFor.set(key, []);
    namesFor.get(key).push(name);
  });

  for (const row of due) {
    const current = await Student.findById(row._id).select('applicationStatus rejectionReason').lean();
    if (!current || current.applicationStatus !== row.applicationStatus) continue;
    const note = cancelNote(row);
    const result = await Student.updateOne(
      { _id: row._id, applicationStatus: row.applicationStatus },
      {
        $set: {
          applicationStatus: 'Cancelled',
          autoCancelled: true,
          cancelledAt: now,
          statusBeforeCancel: row.applicationStatus,
          reasonBeforeCancel: current.rejectionReason || '',
          rejectionReason: note,
        },
        $push: { statusHistory: { status: 'Cancelled', note, role: 'System', at: now } },
      },
    );
    if (!result.modifiedCount) continue;
    done.push(row);
    await audit('admission_auto_cancelled', 'Student', row._id, SYSTEM,
      { basis: row.basis, days: row.days, due: row.due, previousStatus: row.applicationStatus }, `${row.name}: ${note}`);

    const centreId = row.center?._id || row.center;
    const centreUsers = await User.find({ role: 'Center', centerId: centreId, isActive: true }).select('_id').lean();
    let recipients = [...centreUsers.map(u => u._id), ...(await centreCounselorUserIds({ counselorId: row.counselor?._id || row.counselor, centerId: centreId }))];
    if (!recipients.length) recipients = await adminUserIds();
    tell(recipients, row.name);
  }

  // One summary alert per person per run (the first run can cancel many old admissions at once)
  for (const [userId, names] of namesFor) {
    const list = names.slice(0, 5).join(', ') + (names.length > 5 ? ` and ${names.length - 5} more` : '');
    await notify(userId, {
      message: `${names.length} admission${names.length === 1 ? '' : 's'} auto-cancelled — course fee not paid in time: ${list}. A counselor can restore it when the payment comes.`,
      type: 'application_rejected',
    });
  }
  return { cancelled: done };
}

function startAutoCancelJob() {
  if (String(process.env.AUTO_CANCEL_ADMISSIONS || '').toLowerCase() === 'off') {
    console.log('Auto-cancel of unpaid admissions is OFF (AUTO_CANCEL_ADMISSIONS=off)');
    return;
  }
  const run = () => runAutoCancel()
    .then(({ cancelled }) => { if (cancelled.length) console.log(`Auto-cancelled ${cancelled.length} unpaid admission(s)`); })
    .catch(e => console.error('Auto-cancel failed:', e));
  run();
  setInterval(run, EVERY_MS);
}

module.exports = { runAutoCancel, startAutoCancelJob };

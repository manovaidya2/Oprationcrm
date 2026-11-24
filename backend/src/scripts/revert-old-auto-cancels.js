// One-time fix: undo auto-cancellations of admissions submitted BEFORE the auto-cancel start date
// (AUTO_CANCEL_FROM in .env, default 2026-11-24 — see utils/admissionTimeline.js).
// The rule now applies only to admissions from that date, so older ones that the job had already cancelled go back
// to the status they had. Skipped (left cancelled): ones marked cancelled at the university, or whose amount was settled.
//
//   node src/scripts/revert-old-auto-cancels.js           -> list only
//   node src/scripts/revert-old-auto-cancels.js --apply   -> revert them
require('dotenv').config();
const mongoose  = require('mongoose');
const connectDB = require('../config/db');
const Student   = require('../models/Student');
const { firstSubmittedAt, autoCancelFrom } = require('../utils/admissionTimeline');
const { audit } = require('../utils/helpers');

const day = d => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDB();
  const from = autoCancelFrom();
  const cancelled = await Student.find({ applicationStatus: 'Cancelled', autoCancelled: true })
    .select('name center statusHistory statusBeforeCancel reasonBeforeCancel universityCancelled amountSettled')
    .populate('center', 'name')
    .lean();
  const old = cancelled.filter(s => { const at = firstSubmittedAt(s); return at && at < from; });
  if (!old.length) {
    console.log(`No auto-cancelled admission from before ${day(from)}. Nothing to do.`);
    return;
  }

  let reverted = 0;
  for (const s of old) {
    const line = `${s.name} | ${s.center?.name || '-'} | submitted ${day(firstSubmittedAt(s))} | back to ${s.statusBeforeCancel || 'Submitted'}`;
    if (s.universityCancelled || s.amountSettled) {
      console.log(`Skip (${s.universityCancelled ? 'cancelled at the university' : 'amount settled'}): ${line}`);
      continue;
    }
    console.log(`${apply ? 'Reverted' : 'Would revert'}: ${line}`);
    if (!apply) continue;
    const note = `Auto-cancel reverted: the rule applies only to admissions submitted from ${day(from)}`;
    const result = await Student.updateOne({ _id: s._id, applicationStatus: 'Cancelled', autoCancelled: true }, {
      $set: {
        applicationStatus: s.statusBeforeCancel || 'Submitted', autoCancelled: false,
        rejectionReason: s.reasonBeforeCancel || '', settlementRequested: false, settlementForwardedToAccountant: false,
      },
      $unset: { cancelledAt: 1, statusBeforeCancel: 1, reasonBeforeCancel: 1 },
      $push: { statusHistory: { status: 'Auto_Cancel_Reverted', note, role: 'System', at: new Date() } },
    });
    if (result.modifiedCount) {
      reverted += 1;
      await audit('auto_cancel_reverted', 'Student', s._id, { role: 'System' }, { backTo: s.statusBeforeCancel || 'Submitted' }, `${s.name}: ${note}`);
    }
  }
  console.log(apply ? `Done: ${reverted} admission(s) reverted.` : 'Nothing was changed. Run with --apply to revert them.');
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

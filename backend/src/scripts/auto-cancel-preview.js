// Lists the admissions the auto-cancel job would cancel right now — nothing is changed.
// Only admissions first submitted on or after AUTO_CANCEL_FROM (default 2026-11-24) can be cancelled.
//
//   node src/scripts/auto-cancel-preview.js           -> preview only
//   node src/scripts/auto-cancel-preview.js --apply   -> cancel them now
//
// The server itself runs the same job on start and every hour, unless AUTO_CANCEL_ADMISSIONS=off in .env.
require('dotenv').config();
const mongoose  = require('mongoose');
const connectDB = require('../config/db');
const { runAutoCancel } = require('../jobs/autoCancelAdmissions');

const fmt = n => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;
const BASIS = { submission: 'since submission', instalment: 'since instalment due', restore: 'since restore' };

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDB();
  const { cancelled } = await runAutoCancel({ dryRun: !apply });
  if (!cancelled.length) {
    console.log('No admission is due for auto-cancel.');
    return;
  }
  for (const r of cancelled) {
    console.log(`${apply ? 'Cancelled' : 'Would cancel'}: ${r.name} | ${r.center?.name || '-'} | ${r.applicationStatus} | day ${r.days} ${BASIS[r.basis]} | ${r.feeSet ? `${fmt(r.due)} due of ${fmt(r.netFee)}` : 'fee not set'}`);
  }
  const byStatus = cancelled.reduce((acc, r) => { acc[r.applicationStatus] = (acc[r.applicationStatus] || 0) + 1; return acc; }, {});
  console.log(`\n${cancelled.length} admission(s) ${apply ? 'cancelled' : 'would be cancelled'}. By status: ${Object.entries(byStatus).map(([s, n]) => `${s} ${n}`).join(', ')}`);
  if (!apply) console.log('Nothing was changed. Run with --apply to cancel them now.');
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

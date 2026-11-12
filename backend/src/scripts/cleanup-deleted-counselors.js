// One-time cleanup for counselors deleted BEFORE the profile was removed together with the login.
// Finds counselor profiles that no longer have any login and removes them the same way deleting a
// counselor does now: profile gone, their main centres move to Admin, their students/documents are
// re-filed to the centre's main counselor (or left unassigned while the centre is with Admin).
//
//   node src/scripts/cleanup-deleted-counselors.js           -> only lists what would be removed
//   node src/scripts/cleanup-deleted-counselors.js --apply   -> removes them
require('dotenv').config();
const mongoose  = require('mongoose');
const connectDB = require('../config/db');
const Counselor = require('../models/Counselor');
const User      = require('../models/User');
const Center    = require('../models/Center');
const { removeCounselorProfile } = require('../utils/counselorRemoval');

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDB();
  const withLogin = (await User.distinct('counselorId', { counselorId: { $ne: null } })).map(String);
  const orphans = await Counselor.find({ _id: { $nin: withLogin } }).select('name email').sort('name').lean();
  if (!orphans.length) {
    console.log('No counselor profiles without a login. Nothing to do.');
    return;
  }
  for (const c of orphans) {
    const mainOf = await Center.countDocuments({ assignedCounselor: c._id });
    console.log(`${apply ? 'Removing' : 'Would remove'}: ${c.name} <${c.email}>${mainOf ? ` (main counselor of ${mainOf} centre(s) -> Admin)` : ''}`);
    if (apply) await removeCounselorProfile(c._id);
  }
  console.log(apply
    ? `Done: ${orphans.length} counselor profile(s) removed.`
    : `${orphans.length} profile(s) found. Run again with --apply to remove them.`);
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

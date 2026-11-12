const Center          = require('../models/Center');
const Counselor       = require('../models/Counselor');
const Student         = require('../models/Student');
const StudentDocument = require('../models/StudentDocument');
const User            = require('../models/User');
const Notification    = require('../models/Notification');

// Delete a counselor for good: profile, logins and their notifications.
//  - Centres where they were the MAIN counselor go to Admin (heldByAdmin, no main counselor until Admin picks one).
//  - Centres where they only helped simply lose them.
//  - Their students / documents move to the centre's current main counselor, or are left without a
//    counselor when the centre is now with Admin. Assigning a new main counselor later re-files them.
async function removeCounselorProfile(counselorId) {
  const centres = await Center.find({ assignedCounselor: counselorId }).select('_id').lean();
  if (centres.length) {
    await Center.updateMany(
      { _id: { $in: centres.map(c => c._id) } },
      { $unset: { assignedCounselor: 1 }, $set: { heldByAdmin: true } },
    );
  }

  const centreIds = [...new Set([
    ...(await Student.distinct('center', { counselor: counselorId })),
    ...(await StudentDocument.distinct('center', { counselor: counselorId })),
  ].map(String))];
  for (const centreId of centreIds) {
    const centre = await Center.findById(centreId).select('assignedCounselor').lean();
    const update = centre?.assignedCounselor ? { $set: { counselor: centre.assignedCounselor } } : { $unset: { counselor: 1 } };
    await Student.updateMany({ counselor: counselorId, center: centreId }, update);
    await StudentDocument.updateMany({ counselor: counselorId, center: centreId }, update);
  }
  // Anything left (e.g. no centre on the record) just loses the counselor
  await Student.updateMany({ counselor: counselorId }, { $unset: { counselor: 1 } });
  await StudentDocument.updateMany({ counselor: counselorId }, { $unset: { counselor: 1 } });

  const logins = await User.find({ counselorId }).select('_id').lean();
  await Notification.deleteMany({ userId: { $in: logins.map(u => u._id) } });
  await User.deleteMany({ counselorId });
  await Counselor.deleteOne({ _id: counselorId });
  return { centresToAdmin: centres.length };
}

module.exports = { removeCounselorProfile };

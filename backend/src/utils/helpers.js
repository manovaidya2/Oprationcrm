const AuditLog      = require('../models/AuditLog');
const Notification  = require('../models/Notification');

// ── Audit log ────────────────────────────────────────────────
exports.audit = async (action, entity, entityId, user, details = {}, message = '') => {
  try {
    await AuditLog.create({
      action, entity, entityId,
      performedBy: user?._id,
      role: user?.role,
      details,
      message,
    });
  } catch (e) { console.error('audit log failed', e.message); }
};

// ── Notify one or multiple users ────────────────────────────
exports.notify = async (userIdOrIds, { message, type = 'general', role = '', studentId, documentId } = {}) => {
  try {
    const ids = Array.isArray(userIdOrIds) ? userIdOrIds : [userIdOrIds];
    const docs = ids.filter(Boolean).map(userId => ({
      userId, role, message, type,
      studentId:  studentId  || undefined,
      documentId: documentId || undefined,
    }));
    if (docs.length) await Notification.insertMany(docs);
  } catch (e) { console.error('notify failed', e.message); }
};

// ── Counselor logins working on a centre ─────────────────────
// A centre can have several counselors (main = Center.assignedCounselor, plus extra ones whose
// Counselor.centers holds the centre). They all work the same queues, so they all get the same alerts.
// `counselorId` is the student's / document's own counselor and is always included.
const idOf = v => (v && v._id ? v._id : v);
exports.centreCounselorUserIds = async ({ counselorId, centerId } = {}) => {
  const Counselor = require('../models/Counselor');
  const User = require('../models/User');
  const ids = new Set();
  if (idOf(counselorId)) ids.add(String(idOf(counselorId)));
  if (idOf(centerId)) {
    const linked = await Counselor.find({ centers: idOf(centerId) }).select('_id').lean();
    linked.forEach(c => ids.add(String(c._id)));
  }
  if (!ids.size) return [];
  const users = await User.find({ counselorId: { $in: [...ids] }, role: 'Counselor', isActive: true }).select('_id').lean();
  return users.map(u => u._id);
};

// Notify every counselor working on the centre; returns the user ids notified
exports.notifyCounselors = async (target, payload) => {
  const ids = await exports.centreCounselorUserIds(target);
  if (ids.length) await exports.notify(ids, { role: 'Counselor', ...payload });
  return ids;
};

// ── Find users by role and notify all of them ────────────────
exports.notifyRole = async (roleOrRoles, payload) => {
  const User = require('../models/User');
  const roles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
  const users = await User.find({ role: { $in: roles }, isActive: true }).select('_id role').lean();
  const ids = users.map(u => ({ id: u._id, role: u.role }));
  for (const { id, role } of ids) {
    await exports.notify(id, { ...payload, role });
  }
};

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

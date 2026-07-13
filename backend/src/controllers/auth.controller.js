const asyncHandler = require('express-async-handler');
const User       = require('../models/User');
const Counselor  = require('../models/Counselor');
const Center     = require('../models/Center');
const University = require('../models/University');
const { signToken } = require('../utils/token');

function sanitize(u) {
  return {
    id: u._id, name: u.name, email: u.email, role: u.role,
    counselorId: u.counselorId, centerId: u.centerId,
    universityId: u.universityId,
    avatarColor: u.avatarColor,
  };
}

// POST /api/auth/login  — public
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, isActive: true }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    const e = new Error('Invalid credentials'); e.status = 401; throw e;
  }
  res.json({ token: signToken(user), user: sanitize(user) });
});

// GET /api/auth/me
exports.me = asyncHandler(async (req, res) => {
  res.json({ user: sanitize(req.user) });
});

// POST /api/auth/users  — Admin or Counselor creates accounts
exports.createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, avatarColor, centerId, universityId, phone } = req.body;

  // Counselor can only create Center accounts
  if (req.user.role === 'Counselor' && role !== 'Center') {
    const e = new Error('Counselors can only create Center accounts'); e.status = 403; throw e;
  }

  const exists = await User.findOne({ email });
  if (exists) { const e = new Error('Email already in use'); e.status = 409; throw e; }

  let counselorId;
  let resolvedCenterId;
  let resolvedUniversityId;

  if (role === 'Counselor') {
    const c = await Counselor.create({ name, email, phone: phone || '', avatarColor: avatarColor || '#6366f1' });
    counselorId = c._id;
  }

  if (role === 'Center') {
    if (!centerId) { const e = new Error('centerId required for Center role'); e.status = 400; throw e; }
    const center = await Center.findById(centerId);
    if (!center) { const e = new Error('Center not found'); e.status = 404; throw e; }
    if (req.user.role === 'Counselor') {
      const counselor = await Counselor.findById(req.user.counselorId).select('centers').lean();
      const canCreateForCenter = (counselor?.centers || []).some(id => String(id) === String(center._id));
      if (!canCreateForCenter) {
        const e = new Error('You can create login only for your assigned centers'); e.status = 403; throw e;
      }
    }
    resolvedCenterId = center._id;
  }

  if (role === 'University') {
    if (!universityId) { const e = new Error('universityId required for University role'); e.status = 400; throw e; }
    const uni = await University.findById(universityId);
    if (!uni) { const e = new Error('University not found'); e.status = 404; throw e; }
    resolvedUniversityId = uni._id;
  }

  const user = await User.create({
    name, email, password, role,
    counselorId, centerId: resolvedCenterId,
    universityId: resolvedUniversityId,
    avatarColor: avatarColor || '#6366f1',
    createdPassword: password,
    createdBy: req.user._id,
  });

  res.status(201).json({ user: sanitize(user) });
});

// GET /api/auth/users  — Admin + Counselor
exports.listUsers = asyncHandler(async (req, res) => {
  const filter = {};
  // Counselor only sees active Center users; Admin sees all (active + inactive)
  if (req.user.role === 'Counselor') {
    const counselor = await Counselor.findById(req.user.counselorId).select('centers').lean();
    filter.role = 'Center';
    filter.isActive = true;
    filter.centerId = { $in: counselor?.centers || [] };
  } else if (req.query.role) {
    filter.role = req.query.role;
  }

  const users = await User.find(filter).select('-password +createdPassword')
    .populate('counselorId centerId universityId').sort('-createdAt');
  res.json(users);
});

// PATCH /api/auth/users/:id/password  — Admin only
exports.resetPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) { const e = new Error('Password min 6 chars'); e.status = 400; throw e; }
  const user = await User.findById(req.params.id);
  if (!user) { const e = new Error('User not found'); e.status = 404; throw e; }
  if (req.user.role === 'Counselor') {
    if (user.role !== 'Center') {
      const e = new Error('Counselors can reset only Center logins'); e.status = 403; throw e;
    }
    const counselor = await Counselor.findById(req.user.counselorId).select('centers').lean();
    const canReset = (counselor?.centers || []).some(id => String(id) === String(user.centerId));
    if (!canReset) {
      const e = new Error('You can reset login only for your assigned centers'); e.status = 403; throw e;
    }
  }
  user.password = password;
  user.createdPassword = password;
  await user.save();
  res.json({ ok: true });
});

// PATCH /api/auth/me/password  — Any logged-in user (change own password)
exports.changeOwnPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    const e = new Error('New password must be at least 6 characters'); e.status = 400; throw e;
  }
  const user = await User.findById(req.user._id || req.user.id).select('+password');
  if (!user) { const e = new Error('User not found'); e.status = 404; throw e; }
  if (!(await user.comparePassword(currentPassword))) {
    const e = new Error('Current password is incorrect'); e.status = 401; throw e;
  }
  user.password = newPassword;
  if (user.role === 'Center') user.createdPassword = newPassword;
  await user.save();
  res.json({ ok: true, message: 'Password changed successfully' });
});

// PATCH /api/auth/users/:id/toggle  — Admin only — activate/deactivate
exports.toggleUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) { const e = new Error('User not found'); e.status = 404; throw e; }
  if (String(user._id) === String(req.user._id)) { const e = new Error('Cannot deactivate yourself'); e.status = 400; throw e; }
  user.isActive = !user.isActive;
  await user.save();
  res.json({ ok: true, isActive: user.isActive });
});

// DELETE /api/auth/users/:id  — Admin only
exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) { const e = new Error('User not found'); e.status = 404; throw e; }
  if (String(user._id) === String(req.user._id)) { const e = new Error('Cannot delete yourself'); e.status = 400; throw e; }
  await User.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

// ============================================================
// controllers/university.controller.js
// CRUD for University records (Admin only)
// ============================================================
const asyncHandler = require('express-async-handler');
const University   = require('../models/University');
const User         = require('../models/User');
const Student      = require('../models/Student');
const StudentDoc   = require('../models/StudentDocument');

// GET /api/universities
exports.list = asyncHandler(async (_req, res) => {
  res.json(await University.find().sort('-createdAt'));
});

// GET /api/universities/:id
exports.get = asyncHandler(async (req, res) => {
  const u = await University.findById(req.params.id);
  if (!u) { const e = new Error('University not found'); e.status = 404; throw e; }
  res.json(u);
});

// POST /api/universities  — Admin only
exports.create = asyncHandler(async (req, res) => {
  const uni = await University.create(req.body);
  res.status(201).json(uni);
});

// PUT /api/universities/:id  — Admin only
exports.update = asyncHandler(async (req, res) => {
  const uni = await University.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!uni) { const e = new Error('University not found'); e.status = 404; throw e; }
  res.json(uni);
});

// DELETE /api/universities/:id  — Admin only
exports.remove = asyncHandler(async (req, res) => {
  // Prevent deletion if students are assigned
  const count = await Student.countDocuments({ university: req.params.id });
  if (count > 0) {
    const e = new Error(`Cannot delete — ${count} students are linked to this university`);
    e.status = 409; throw e;
  }
  await University.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

// GET /api/universities/:id/stats  — Stats for this university (Admin / University users)
exports.stats = asyncHandler(async (req, res) => {
  const uniId = req.params.id;
  const [pendingEnrollment, enrolled, pendingDocs, dispatched, totalStudents] = await Promise.all([
    Student.countDocuments({ university: uniId, applicationStatus: 'Sent_To_University' }),
    Student.countDocuments({ university: uniId, applicationStatus: 'Enrolled' }),
    StudentDoc.countDocuments({ university: uniId, status: { $in: ['Fee_Approved', 'Sent_To_University'] } }),
    StudentDoc.countDocuments({ university: uniId, status: { $in: ['University_Dispatched', 'Dispatch_Received', 'Scanned', 'Accountant_Received', 'Counselor_Received', 'Center_Notified', 'Payment_Submitted', 'Payment_Verified', 'Dispatched', 'Delivered'] } }),
    Student.countDocuments({ university: uniId }),
  ]);
  res.json({ pendingEnrollment, enrolled, pendingDocs, dispatched, totalStudents });
});

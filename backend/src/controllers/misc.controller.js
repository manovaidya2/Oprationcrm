// ============================================================
// controllers/misc.controller.js
// Notification, Center, Counselor, Dashboard, AuditLog
// ============================================================
const asyncHandler = require('express-async-handler');
const Notification = require('../models/Notification');
const Center       = require('../models/Center');
const Counselor    = require('../models/Counselor');
const Student      = require('../models/Student');
const Payment      = require('../models/Payment');
const StudentDoc   = require('../models/StudentDocument');
const AuditLog     = require('../models/AuditLog');
const User         = require('../models/User');
const PaymentAccount = require('../models/PaymentAccount');

// ── NOTIFICATIONS ────────────────────────────────────────────
exports.listNotifications = asyncHandler(async (req, res) => {
  const notifs = await Notification.find({ userId: req.user._id })
    .sort('-at').limit(50);
  res.json(notifs);
});

exports.markRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, read: false }, { $set: { read: true } });
  res.json({ ok: true });
});

exports.markOneRead = asyncHandler(async (req, res) => {
  await Notification.findByIdAndUpdate(req.params.id, { read: true });
  res.json({ ok: true });
});

// ── CENTERS ──────────────────────────────────────────────────
exports.listCenters = asyncHandler(async (req, res) => {
  const { role, counselorId } = req.user;
  let filter = {};

  // BUG FIX: Counselor should only see their assigned centers
  if (role === 'Counselor' && counselorId) {
    const counselor = await Counselor.findById(counselorId).select('centers').lean();
    const assignedCenterIds = counselor?.centers || [];
    filter = { _id: { $in: assignedCenterIds } };
  }

  const centers = await Center.find(filter)
    .populate('assignedCounselor', 'name')
    .populate('allowedUniversities', 'name shortName avatarColor')
    .sort('-createdAt').lean();

  // BUG FIX: Some centers may have assignedCounselor as null (old data).
  // Do a reverse-lookup from Counselor.centers to fill in missing assignedCounselor.
  const missingIds = centers.filter(c => !c.assignedCounselor).map(c => String(c._id));
  if (missingIds.length > 0) {
    const allCounselors = await Counselor.find({ centers: { $in: missingIds } }).select('_id name centers').lean();
    // Build a map: centerId -> { _id, name }
    const centerToCounselor = {};
    for (const co of allCounselors) {
      for (const cid of (co.centers || [])) {
        centerToCounselor[String(cid)] = { _id: co._id, name: co.name };
      }
    }
    // Inject into centers and also fix the DB for future calls
    for (const c of centers) {
      if (!c.assignedCounselor) {
        const found = centerToCounselor[String(c._id)];
        if (found) {
          c.assignedCounselor = found;
          // Persist the fix so next call won't need reverse-lookup
          await Center.findByIdAndUpdate(c._id, { assignedCounselor: found._id });
        }
      }
    }
  }

  centers.forEach(c => {
    if (!c.verificationDocs)    c.verificationDocs    = [];
    if (!c.allowedUniversities) c.allowedUniversities = [];
  });
  res.json(centers);
});

exports.getCenter = asyncHandler(async (req, res) => {
  const c = await Center.findById(req.params.id)
    .populate('assignedCounselor', 'name avatarColor')
    .populate('allowedUniversities', 'name shortName avatarColor')
    .lean();
  if (!c) { const e = new Error('Center not found'); e.status = 404; throw e; }
  if (!c.verificationDocs)    c.verificationDocs    = [];
  if (!c.allowedUniversities) c.allowedUniversities = [];
  res.json(c);
});

// GET /api/centers/:id/universities  — list allowed universities for this center
exports.getCenterUniversities = asyncHandler(async (req, res) => {
  const c = await Center.findById(req.params.id)
    .populate('allowedUniversities', 'name shortName avatarColor city').lean();
  if (!c) { const e = new Error('Center not found'); e.status = 404; throw e; }
  res.json(c.allowedUniversities || []);
});

// PUT /api/centers/:id/universities  — set allowed universities (replace whole list)
exports.setCenterUniversities = asyncHandler(async (req, res) => {
  const { universityIds } = req.body; // array of IDs
  if (!Array.isArray(universityIds)) { const e = new Error('universityIds array required'); e.status = 400; throw e; }
  const c = await Center.findByIdAndUpdate(
    req.params.id,
    { allowedUniversities: universityIds },
    { new: true }
  ).populate('allowedUniversities', 'name shortName avatarColor city');
  if (!c) { const e = new Error('Center not found'); e.status = 404; throw e; }
  res.json(c.allowedUniversities);
});

exports.createCenter = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  // Parse array fields sent as JSON strings
  if (typeof body.programInterest === 'string') { try { body.programInterest = JSON.parse(body.programInterest); } catch { body.programInterest = []; } }
  if (typeof body.streams === 'string')         { try { body.streams         = JSON.parse(body.streams);         } catch { body.streams = []; } }

  const center = await Center.create(body);

  // Handle verification docs upload
  if (req.files && req.files.length > 0) {
    const docNames = body.docNames ? (typeof body.docNames === 'string' ? JSON.parse(body.docNames) : body.docNames) : [];
    const docs = req.files.map((file, i) => ({
      name:      docNames[i] || file.originalname,
      fileUrl:   `/uploads/${file.filename}`,
      fileName:  file.originalname,
      sizeKb:    Math.round(file.size / 1024),
    }));
    await Center.findByIdAndUpdate(center._id, { $push: { verificationDocs: { $each: docs } } });
  }

  res.status(201).json(await Center.findById(center._id).populate('assignedCounselor', 'name'));
});

exports.updateCenter = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  if (typeof body.programInterest === 'string') { try { body.programInterest = JSON.parse(body.programInterest); } catch { body.programInterest = []; } }
  if (typeof body.streams === 'string')         { try { body.streams         = JSON.parse(body.streams);         } catch { body.streams = []; } }

  // Don't overwrite verificationDocs via normal update
  delete body.verificationDocs;

  const c = await Center.findByIdAndUpdate(req.params.id, body, { new: true }).populate('assignedCounselor', 'name');
  if (!c) { const e = new Error('Center not found'); e.status = 404; throw e; }
  res.json(c);
});

// POST /api/centers/:id/docs  — upload verification doc
exports.uploadCenterDoc = asyncHandler(async (req, res) => {
  const center = await Center.findById(req.params.id);
  if (!center) { const e = new Error('Center not found'); e.status = 404; throw e; }

  if (!req.file) { const e = new Error('No file uploaded'); e.status = 400; throw e; }
  const doc = {
    name:      req.body.name || req.file.originalname,
    fileUrl:   `/uploads/${req.file.filename}`,
    fileName:  req.file.originalname,
    sizeKb:    Math.round(req.file.size / 1024),
  };
  center.verificationDocs.push(doc);
  await center.save();
  res.json(center.verificationDocs);
});

// DELETE /api/centers/:id/docs/:docId  — remove a verification doc
exports.deleteCenterDoc = asyncHandler(async (req, res) => {
  const center = await Center.findById(req.params.id);
  if (!center) { const e = new Error('Center not found'); e.status = 404; throw e; }
  center.verificationDocs = center.verificationDocs.filter(d => String(d._id) !== req.params.docId);
  await center.save();
  res.json(center.verificationDocs);
});

exports.deleteCenter = asyncHandler(async (req, res) => {
  await Center.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

// ── COUNSELORS ───────────────────────────────────────────────
exports.listCounselors = asyncHandler(async (_req, res) => {
  res.json(await Counselor.find().populate('centers', 'name city').sort('-createdAt'));
});

exports.getCounselor = asyncHandler(async (req, res) => {
  const c = await Counselor.findById(req.params.id).populate('centers', 'name city');
  if (!c) { const e = new Error('Counselor not found'); e.status = 404; throw e; }
  res.json(c);
});

exports.createCounselor = asyncHandler(async (req, res) => {
  res.status(201).json(await Counselor.create(req.body));
});

exports.updateCounselor = asyncHandler(async (req, res) => {
  const c = await Counselor.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!c) { const e = new Error('Counselor not found'); e.status = 404; throw e; }
  res.json(c);
});

exports.deleteCounselor = asyncHandler(async (req, res) => {
  await Counselor.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

exports.addCenterToCounselor = asyncHandler(async (req, res) => {
  const { centerId } = req.body;
  if (!centerId) { const e = new Error('centerId required'); e.status = 400; throw e; }

  // Remove this center from ALL other counselors first
  await Counselor.updateMany(
    { _id: { $ne: req.params.id }, centers: centerId },
    { $pull: { centers: centerId } }
  );

  // Add center to the new counselor
  const c = await Counselor.findByIdAndUpdate(
    req.params.id,
    { $addToSet: { centers: centerId } },
    { new: true }
  ).populate('centers', 'name city');
  if (!c) { const e = new Error('Counselor not found'); e.status = 404; throw e; }

  // Update Center.assignedCounselor
  await Center.findByIdAndUpdate(centerId, { assignedCounselor: req.params.id });
  await Student.updateMany({ center: centerId }, { $set: { counselor: req.params.id } });
  await StudentDoc.updateMany({ center: centerId }, { $set: { counselor: req.params.id } });

  res.json(c);
});

// ── DASHBOARD ─────────────────────────────────────────────────
exports.dashboardStats = asyncHandler(async (req, res) => {
  const role = req.user.role;

  if (role === 'Center') {
    const centerId = req.user.centerId;
    const [students, payments] = await Promise.all([
      Student.find({ center: centerId }).lean(),
      Payment.find({ center: centerId }).lean(),
    ]);
    const statusCounts = students.reduce((acc, s) => { acc[s.applicationStatus] = (acc[s.applicationStatus] || 0) + 1; return acc; }, {});
    const totalFees  = payments.reduce((s, p) => s + (p.netFee || 0), 0);
    const totalPaid  = payments.reduce((s, p) => s + (p.paidAmount || 0), 0);
    return res.json({ totalStudents: students.length, statusCounts, totalFees, totalPaid, totalDue: totalFees - totalPaid });
  }

  if (role === 'Accountant') {
    const [pending, docs] = await Promise.all([
      Student.countDocuments({ applicationStatus: { $in: ['Counselor_Approved', 'Accountant_Pending'] } }),
      StudentDoc.countDocuments({ status: { $in: ['Forwarded', 'Fee_Pending', 'Payment_Submitted'] } }),
    ]);
    return res.json({ pendingAdmissions: pending, pendingDocFees: docs });
  }

  if (role === 'University') {
    const uniId = req.user.universityId;
    const studentFilter = uniId ? { university: uniId } : {};
    const docFilter     = uniId ? { university: uniId } : {};
    const [pending, enrolled, pendingDocs] = await Promise.all([
      Student.countDocuments({ ...studentFilter, applicationStatus: 'Sent_To_University' }),
      Student.countDocuments({ ...studentFilter, applicationStatus: 'Enrolled' }),
      StudentDoc.countDocuments({ ...docFilter, status: { $in: ['Fee_Approved', 'Sent_To_University'] } }),
    ]);
    return res.json({ pendingEnrollment: pending, enrolled, pendingDocs });
  }

  if (role === 'Dispatch') {
    const docs = await StudentDoc.countDocuments({ status: { $in: ['Sent_To_University', 'Dispatch_Received', 'Scanned', 'Payment_Verified'] } });
    return res.json({ pendingDocuments: docs });
  }

  // Admin / Counselor
  const filter = role === 'Counselor' ? { counselor: req.user.counselorId } : {};
  const [studentCount, centerCount, counselorCount] = await Promise.all([
    Student.countDocuments(filter),
    Center.countDocuments(),
    Counselor.countDocuments(),
  ]);
  const statusBreakdown = await Student.aggregate([
    { $match: filter },
    { $group: { _id: '$applicationStatus', count: { $sum: 1 } } },
  ]);
  let paymentFilter = {};
  if (filter.counselor || filter.$or) {
    const studentIds = await Student.find(filter).select('_id').lean();
    paymentFilter = { student: { $in: studentIds.map(s => s._id) } };
  }
  const payments = await Payment.find(paymentFilter).lean();
  const totalFees = payments.reduce((s, p) => s + (p.netFee || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + (p.paidAmount || 0), 0);

  // Per-center student + fees breakdown (Admin only)
  let centersBreakdown = [];
  if (role === 'Admin') {
    const pendingStatuses = ['Submitted','Changes_Requested','Counselor_Approved','Accountant_Pending','Accountant_Rejected','Sent_To_University'];

    // Get all students with center info
    const allStudents = await Student.find({}).select('_id center applicationStatus').lean();
    const centerIdToStudentIds = {};
    allStudents.forEach(s => {
      const cid = String(s.center);
      if (!centerIdToStudentIds[cid]) centerIdToStudentIds[cid] = [];
      centerIdToStudentIds[cid].push(s._id);
    });

    // Get all payments grouped by center
    const allPayments = await Payment.find({}).select('center student netFee paidAmount transactions').lean();
    const centerPayMap = {};
    allPayments.forEach(p => {
      const cid = String(p.center || '');
      if (!centerPayMap[cid]) centerPayMap[cid] = { netFee: 0, paidAmount: 0, transactions: [] };
      centerPayMap[cid].netFee      += p.netFee      || 0;
      centerPayMap[cid].paidAmount  += p.paidAmount  || 0;
      // Collect all verified transactions for monthly breakdown
      (p.transactions || []).forEach(tx => {
        if (tx.verificationStatus === 'verified' && tx.paidAt) {
          centerPayMap[cid].transactions.push({ amount: tx.amount || 0, paidAt: tx.paidAt });
        }
      });
    });

    // Monthly breakdown across all centers (last 12 months)
    const now = new Date();
    const monthlyMap = {};
    allPayments.forEach(p => {
      (p.transactions || []).forEach(tx => {
        if (tx.verificationStatus === 'verified' && tx.paidAt) {
          const d = new Date(tx.paidAt);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          monthlyMap[key] = (monthlyMap[key] || 0) + (tx.amount || 0);
        }
      });
    });
    // Build last 12 months array
    const monthlyFees = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyFees.push({
        key,
        label: d.toLocaleString('en-IN', { month: 'short', year: 'numeric' }),
        amount: monthlyMap[key] || 0,
      });
    }

    centersBreakdown = await Student.aggregate([
      { $group: {
          _id: '$center',
          total:    { $sum: 1 },
          enrolled: { $sum: { $cond: [{ $eq: ['$applicationStatus', 'Enrolled'] }, 1, 0] } },
          pending:  { $sum: { $cond: [{ $in: ['$applicationStatus', pendingStatuses] }, 1, 0] } },
          draft:    { $sum: { $cond: [{ $eq: ['$applicationStatus', 'Draft'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$applicationStatus', 'Rejected'] }, 1, 0] } },
      }},
      { $lookup: { from: 'centers', localField: '_id', foreignField: '_id', as: 'centerData' } },
      { $addFields: { centerInfo: { $arrayElemAt: ['$centerData', 0] } } },
      { $project: {
          centerName: { $ifNull: ['$centerInfo.name', 'Unknown Center'] },
          city:       { $ifNull: ['$centerInfo.city', ''] },
          total: 1, enrolled: 1, pending: 1, draft: 1, rejected: 1,
      }},
      { $sort: { total: -1 } },
    ]);

    // Attach fee data to each center
    centersBreakdown = centersBreakdown.map(c => {
      const fees = centerPayMap[String(c._id)] || { netFee: 0, paidAmount: 0, transactions: [] };
      return {
        ...c,
        totalFees:   fees.netFee,
        totalPaid:   fees.paidAmount,
        totalDue:    fees.netFee - fees.paidAmount,
      };
    });

    // Bank/Account wise breakdown — ALL active accounts, with verified transaction totals
    const allAccounts = await PaymentAccount.find().lean();
    const accMap = {};
    allAccounts.forEach(a => { accMap[String(a._id)] = a; });

    // Init map with all accounts (even those with 0 transactions)
    const bankWiseMap = {};
    allAccounts.forEach(a => {
      bankWiseMap[String(a._id)] = {
        id:            String(a._id),
        label:         a.label,
        mode:          a.mode,
        upiId:         a.upiId         || '',
        upiName:       a.upiName        || '',
        bankName:      a.bankName       || '',
        accountNumber: a.accountNumber  || '',
        accountHolder: a.accountHolder  || '',
        ifscCode:      a.ifscCode       || '',
        branch:        a.branch         || '',
        total: 0,
        count: 0,
      };
    });

    // Accumulate verified transactions — match strictly by ObjectId
    allPayments.forEach(p => {
      (p.transactions || []).forEach(tx => {
        if (tx.verificationStatus !== 'verified') return;
        if (!tx.paidToAccount) return; // skip unassigned
        const key = String(tx.paidToAccount);
        if (!bankWiseMap[key]) return; // account not in active list
        bankWiseMap[key].total += tx.amount || 0;
        bankWiseMap[key].count += 1;
      });
    });

    const bankWiseBreakdown = Object.values(bankWiseMap).sort((a, b) => b.total - a.total);

    // Flat transactions for modal CSV (student name + all tx fields)
    const studentMap = {};
    (await Student.find({}).select('_id name').lean()).forEach(s => { studentMap[String(s._id)] = s.name; });
    const allPaymentsFlat = allPayments.map(p => ({
      studentName: studentMap[String(p.student)] || '',
      transactions: (p.transactions || []).map(tx => ({
        ...tx,
        paidToAccount: tx.paidToAccount ? String(tx.paidToAccount) : null,
      })),
    }));

    return res.json({ studentCount, centerCount, counselorCount, statusBreakdown, totalFees, totalPaid, totalDue: totalFees - totalPaid, centersBreakdown, monthlyFees, bankWiseBreakdown, allPaymentsFlat });
  }

  res.json({ studentCount, centerCount, counselorCount, statusBreakdown, totalFees, totalPaid, totalDue: totalFees - totalPaid, centersBreakdown });
});

// ── AUDIT LOG ─────────────────────────────────────────────────
exports.listAudit = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.entityId) filter.entityId = req.query.entityId;
  if (req.query.entity)   filter.entity   = req.query.entity;
  if (req.query.role)     filter.role     = req.query.role;
  if (req.query.action)   filter.action   = { $regex: req.query.action, $options: 'i' };

  // Date range filter
  if (req.query.from || req.query.to) {
    filter.at = {};
    if (req.query.from) filter.at.$gte = new Date(req.query.from);
    if (req.query.to)   filter.at.$lte = new Date(new Date(req.query.to).setHours(23,59,59,999));
  }

  // Search in message
  if (req.query.search) {
    filter.message = { $regex: req.query.search, $options: 'i' };
  }

  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 50);
  const skip  = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('performedBy', 'name role email')
      .sort('-at')
      .skip(skip)
      .limit(limit),
    AuditLog.countDocuments(filter),
  ]);

  res.json({ logs, total, page, pages: Math.ceil(total / limit) });
});
// GET /api/centers/:id/students - students with their stage breakdown
exports.getCenterStudents = asyncHandler(async (req, res) => {
  const students = await Student.find({ center: req.params.id })
    .populate('counselor', 'name avatarColor')
    .sort('-createdAt')
    .lean();
  res.json(students);
});

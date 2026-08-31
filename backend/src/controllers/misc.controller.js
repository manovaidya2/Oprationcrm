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

  // Counselor and viewer counselor should only see their assigned centers.
  if (['Counselor', 'ViewerCounselor'].includes(role) && counselorId) {
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

  // Opt-in pagination — old callers without page/limit keep getting the full array
  if (req.query.page) {
    const page  = Math.max(1, parseInt(req.query.page, 10)  || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const total = centers.length;
    const start = (page - 1) * limit;
    return res.json({ centers: centers.slice(start, start + limit), total, page, pages: Math.ceil(total / limit) || 1 });
  }
  res.json(centers);
});

exports.getCenter = asyncHandler(async (req, res) => {
  const c = await Center.findById(req.params.id)
    .populate('assignedCounselor', 'name avatarColor')
    .populate('allowedUniversities', 'name shortName avatarColor')
    .lean();
  if (!c) { const e = new Error('Center not found'); e.status = 404; throw e; }
  if (req.user.role === 'Center' && String(c._id) !== String(req.user.centerId)) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }
  if (['Counselor', 'ViewerCounselor'].includes(req.user.role)) {
    const counselor = await Counselor.findById(req.user.counselorId).select('centers').lean();
    const allowed = (counselor?.centers || []).some(id => String(id) === String(c._id));
    if (!allowed) { const e = new Error('Forbidden'); e.status = 403; throw e; }
  }
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

// GET /api/centers/:id/payment-accounts  — list allowed payment accounts for this center
exports.getCenterPaymentAccounts = asyncHandler(async (req, res) => {
  const c = await Center.findById(req.params.id)
    .populate('allowedPaymentAccounts').lean();
  if (!c) { const e = new Error('Center not found'); e.status = 404; throw e; }
  res.json(c.allowedPaymentAccounts || []);
});

// PUT /api/centers/:id/payment-accounts  — set allowed payment accounts (replace whole list)
exports.setCenterPaymentAccounts = asyncHandler(async (req, res) => {
  const { accountIds } = req.body; // array of IDs
  if (!Array.isArray(accountIds)) { const e = new Error('accountIds array required'); e.status = 400; throw e; }
  const c = await Center.findByIdAndUpdate(
    req.params.id,
    { allowedPaymentAccounts: accountIds },
    { new: true }
  ).populate('allowedPaymentAccounts');
  if (!c) { const e = new Error('Center not found'); e.status = 404; throw e; }
  res.json(c.allowedPaymentAccounts);
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
  const viewerCounselorIds = await User.find({ role: 'ViewerCounselor' }).distinct('counselorId');
  res.json(await Counselor.find({ _id: { $nin: viewerCounselorIds.filter(Boolean) } }).populate('centers', 'name city').sort('-createdAt'));
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

  const viewerCounselorIds = await User.find({ role: 'ViewerCounselor' }).distinct('counselorId');

  // Remove this center from other primary counselors first.
  await Counselor.updateMany(
    { _id: { $ne: req.params.id, $nin: viewerCounselorIds.filter(Boolean) }, centers: centerId },
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
exports.assignViewerCounselor = asyncHandler(async (req, res) => {
  const { counselorId } = req.body;
  const center = await Center.findById(req.params.id);
  if (!center) { const e = new Error('Center not found'); e.status = 404; throw e; }

  const viewerCounselorIds = await User.find({
    role: 'ViewerCounselor',
    counselorId: { $exists: true, $ne: null },
  }).distinct('counselorId');

  await Counselor.updateMany(
    { _id: { $in: viewerCounselorIds.filter(Boolean) }, centers: center._id },
    { $pull: { centers: center._id } }
  );

  if (!counselorId) {
    return res.json({ ok: true, centerId: center._id, viewerCounselor: null });
  }

  const viewerUser = await User.findOne({
    role: 'ViewerCounselor',
    counselorId,
    isActive: true,
  }).populate({ path: 'counselorId', populate: { path: 'centers', select: 'name city' } });
  if (!viewerUser) { const e = new Error('Viewer counselor not found'); e.status = 404; throw e; }

  const viewerCounselor = await Counselor.findByIdAndUpdate(
    counselorId,
    { $addToSet: { centers: center._id } },
    { new: true }
  ).populate('centers', 'name city');

  viewerUser.counselorId = viewerCounselor;
  res.json({ ok: true, centerId: center._id, viewerCounselor: viewerUser });
});

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
  let filter = {};
  if (['Counselor', 'ViewerCounselor'].includes(role)) {
    const counselorDoc = await Counselor.findById(req.user.counselorId).select('centers').lean();
    const linkedCenterIds = counselorDoc?.centers || [];
    filter = linkedCenterIds.length > 0
      ? { $or: [{ counselor: req.user.counselorId }, { center: { $in: linkedCenterIds } }] }
      : { counselor: req.user.counselorId };
  }
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

// ── Accountant History — combined feed from Student.statusHistory + Document approvals ──
// Building this feed requires scanning students/documents' embedded history arrays.
// We compute it once and cache briefly so subsequent pages of the SAME view are instant
// (no repeated full-collection scan per page request).
let _acctHistoryCache = { data: null, at: 0 };
const ACCT_HISTORY_TTL_MS = 60 * 1000; // 1 minute

exports.accountantHistory = asyncHandler(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page, 10)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
  const force = req.query.refresh === '1';

  const now = Date.now();
  if (force || !_acctHistoryCache.data || (now - _acctHistoryCache.at) > ACCT_HISTORY_TTL_MS) {
    const ACTION_CONFIG = {
      Sent_To_University:  { label: 'Sent to University',        badge: 'bg-purple-100 text-purple-700',  icon: '🎓' },
      University_Rejected: { label: 'Rejected by University',    badge: 'bg-orange-100 text-orange-700',  icon: '🏫' },
      Accountant_Rejected: { label: 'Forwarded to Counselor',    badge: 'bg-red-100 text-red-700',        icon: '↩' },
      Accountant_Pending:  { label: 'Kept Pending',              badge: 'bg-amber-100 text-amber-700',    icon: '⏳' },
      Counselor_Approved:  { label: 'Received from Counselor',   badge: 'bg-indigo-100 text-indigo-700',  icon: '📥' },
      Enrolled:            { label: 'Enrolled by University',    badge: 'bg-emerald-100 text-emerald-700',icon: '✅' },
      Rejected:            { label: 'Rejected → Center',         badge: 'bg-red-100 text-red-700',        icon: '✗' },
      Changes_Requested:   { label: 'Changes Requested → Center',badge: 'bg-amber-100 text-amber-700',    icon: '✏' },
      Submitted:           { label: 'Submitted by Center',       badge: 'bg-blue-100 text-blue-700',      icon: '📤' },
    };
    const ACCOUNTANT_RELEVANT = new Set([
      'Sent_To_University', 'University_Rejected', 'Accountant_Rejected',
      'Accountant_Pending', 'Counselor_Approved',  'Enrolled',
      'Rejected', 'Changes_Requested',
    ]);

    const [allS, allD] = await Promise.all([
      Student.find({})
        .select('name center courseName university universityName enrollmentNumber statusHistory applicationStatus updatedAt rejectionReason changesRequested')
        .populate('center', 'name')
        .lean(),
      StudentDoc.find({ origin: { $ne: 'Inventory' } })
        .select('name student center type chargeFee totalPaid status statusHistory payments updatedAt')
        .populate('student', 'name')
        .populate('center', 'name')
        .lean(),
    ]);

    const hist = [];

    allS.forEach(s => {
      const entries = s.statusHistory || [];
      if (entries.length === 0) {
        if (ACCOUNTANT_RELEVANT.has(s.applicationStatus)) {
          hist.push({
            id: `${s._id}-fallback`, type: 'student_action',
            actionStatus: s.applicationStatus,
            actionConfig: ACTION_CONFIG[s.applicationStatus] || { label: s.applicationStatus.replace(/_/g,' '), badge: 'bg-slate-100 text-slate-700', icon: '•' },
            studentId: s._id, studentName: s.name, centerName: s.center?.name,
            courseName: s.courseName, universityName: s.university?.name || s.universityName,
            enrollmentNumber: s.enrollmentNumber, note: s.rejectionReason || s.changesRequested || '',
            doneBy: '—', doneByRole: '', at: s.updatedAt, _sortKey: new Date(s.updatedAt || 0),
          });
        }
        return;
      }
      entries.forEach((entry, idx) => {
        if (!ACCOUNTANT_RELEVANT.has(entry.status)) return;
        hist.push({
          id: `${s._id}-sh-${idx}`, type: 'student_action',
          actionStatus: entry.status,
          actionConfig: ACTION_CONFIG[entry.status] || { label: entry.status.replace(/_/g,' '), badge: 'bg-slate-100 text-slate-700', icon: '•' },
          studentId: s._id, studentName: s.name, centerName: s.center?.name,
          courseName: s.courseName, universityName: s.university?.name || s.universityName,
          enrollmentNumber: s.enrollmentNumber, note: entry.note || '',
          doneBy: entry.changedBy?.name || entry.role || '—', doneByRole: entry.role || '',
          at: entry.at, _sortKey: new Date(entry.at || 0),
        });
      });
    });

    allD.filter(d => ['Fee_Approved','Sent_To_University','Dispatched','Delivered','Payment_Verified'].includes(d.status)).forEach(d => {
      const approvalEntry = (d.statusHistory||[]).slice().reverse().find(h => h.status === 'Fee_Approved');
      hist.push({
        id: d._id, type: 'doc_fee',
        entityName: d.name, studentName: d.student?.name, centerName: d.center?.name,
        chargeFee: d.chargeFee, totalPaid: d.totalPaid, docType: d.type,
        verifiedBy: approvalEntry?.changedBy?.name || 'Accountant',
        verifiedAt: approvalEntry?.at || d.updatedAt,
        verificationNote: approvalEntry?.note || '', status: d.status,
        _sortKey: new Date(approvalEntry?.at || d.updatedAt),
      });
    });

    allD.filter(d => d.status === 'Payment_Verified').forEach(d => {
      (d.payments||[]).filter(p => p.verified).forEach(p => {
        hist.push({
          id: `${d._id}-${p._id}`, type: 'doc_payment',
          entityName: d.name, studentName: d.student?.name, docName: d.name,
          amount: p.amount, mode: p.mode, utrRef: p.utrRef, upiId: p.upiId,
          bankName: p.bankName, accountHolder: p.accountHolder, accountNumber: p.accountNumber, ifscCode: p.ifscCode,
          paidAt: p.paidAt, verifiedBy: p.verifiedBy?.name || 'Accountant',
          verifiedAt: p.verifiedAt || d.updatedAt, verificationNote: '',
          _sortKey: new Date(p.verifiedAt || d.updatedAt),
        });
      });
    });

    hist.sort((a, b) => b._sortKey - a._sortKey);
    _acctHistoryCache = { data: hist, at: now };
  }

  let all = _acctHistoryCache.data;
  if (req.query.search) {
    const q = req.query.search.toLowerCase();
    all = all.filter(h =>
      h.studentName?.toLowerCase().includes(q) ||
      h.centerName?.toLowerCase().includes(q) ||
      h.entityName?.toLowerCase().includes(q) ||
      h.enrollmentNumber?.toLowerCase().includes(q) ||
      h.universityName?.toLowerCase().includes(q) ||
      h.note?.toLowerCase().includes(q) ||
      h.utrRef?.toLowerCase().includes(q) ||
      h.actionConfig?.label?.toLowerCase().includes(q)
    );
  }
  const total = all.length;
  const start = (page - 1) * limit;
  res.json({ history: all.slice(start, start + limit), total, page, pages: Math.ceil(total / limit) || 1 });
});
// GET /api/centers/:id/students - students with their stage breakdown
exports.getCenterStudents = asyncHandler(async (req, res) => {
  if (req.user.role === 'Center' && String(req.params.id) !== String(req.user.centerId)) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }
  if (['Counselor', 'ViewerCounselor'].includes(req.user.role)) {
    const counselor = await Counselor.findById(req.user.counselorId).select('centers').lean();
    const allowed = (counselor?.centers || []).some(id => String(id) === String(req.params.id));
    if (!allowed) { const e = new Error('Forbidden'); e.status = 403; throw e; }
  }
  const students = await Student.find({ center: req.params.id })
    .populate('counselor', 'name avatarColor')
    .populate('createdBy', 'name role')
    .populate('lastUpdatedBy', 'name role')
    .populate('statusHistory.changedBy', 'name role')
    .sort('-createdAt')
    .lean();
  res.json(students);
});

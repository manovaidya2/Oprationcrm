const asyncHandler = require('express-async-handler');
const Student    = require('../models/Student');
const Payment    = require('../models/Payment');
const StudentDoc = require('../models/StudentDocument');
const User       = require('../models/User');
const Counselor  = require('../models/Counselor');
const Center     = require('../models/Center');
const University = require('../models/University');
const { audit, notify, notifyRole } = require('../utils/helpers');

// ── Push a status history entry ──────────────────────────────
async function pushHistory(studentId, status, user, note = '') {
  await Student.findByIdAndUpdate(studentId, {
    $push: { statusHistory: {
      status, note,
      changedBy: user?._id,
      role: user?.role || '',
      at: new Date(),
    }},
  });
}

// ── Access helper ────────────────────────────────────────────
async function assertStudentAccess(req, student) {
  if (!student) { const e = new Error('Student not found'); e.status = 404; throw e; }
  const role = req.user.role;
  if (role === 'Center') {
    if (String(student.center?._id || student.center) !== String(req.user.centerId)) {
      const e = new Error('Forbidden'); e.status = 403; throw e;
    }
  }
  if (['Accountant'].includes(role)) {
    const allowed = ['Counselor_Approved', 'Accountant_Pending', 'Accountant_Approved', 'Sent_To_University', 'University_Rejected', 'Accountant_Rejected', 'Rejected', 'Enrolled', 'Cancelled'];
    if (!allowed.includes(student.applicationStatus)) {
      const e = new Error('Forbidden'); e.status = 403; throw e;
    }
  }
  if (role === 'University') {
    if (req.user.universityId && String(student.university) !== String(req.user.universityId)) {
      const e = new Error('Forbidden — student belongs to a different university'); e.status = 403; throw e;
    }
    if (!['Sent_To_University', 'Enrolled','Cancelled'].includes(student.applicationStatus)) {
      const e = new Error('Forbidden'); e.status = 403; throw e;
    }
  }
}

// GET /api/students
exports.list = asyncHandler(async (req, res) => {
  const filter = {};
  const { role, centerId, counselorId, universityId } = req.user;
  const andConditions = [];

  if (role === 'Center') {
    andConditions.push({ center: centerId });
  } else if (role === 'Counselor') {
    const counselorDoc = await Counselor.findById(counselorId).lean();
    const linkedCenterIds = counselorDoc?.centers || [];
    if (linkedCenterIds.length > 0) {
      andConditions.push({ $or: [{ counselor: counselorId }, { center: { $in: linkedCenterIds } }] });
    } else {
      andConditions.push({ counselor: counselorId });
    }
  } else if (role === 'Accountant') {
    andConditions.push({ applicationStatus: { $in: ['Counselor_Approved','Accountant_Pending','Accountant_Approved','Sent_To_University','University_Rejected','Accountant_Rejected','Rejected','Enrolled','Cancelled'] } });
  } else if (role === 'University') {
    if (universityId) {
      andConditions.push({ university: universityId });
    }
    andConditions.push({ applicationStatus: { $in: ['Sent_To_University','Enrolled','Cancelled'] } });
  }

  if (req.query.status)       andConditions.push({ applicationStatus: req.query.status });
  if (req.query.centerId)     andConditions.push({ center: req.query.centerId });
  if (req.query.counselorId)  andConditions.push({ counselor: req.query.counselorId });
  if (req.query.universityId) andConditions.push({ university: req.query.universityId });

  if (req.query.search) {
    const q = req.query.search;
    const matchingCenters = await Center.find({ name: { $regex: q, $options: 'i' } }).select('_id').lean();
    const centerIds = matchingCenters.map(c => c._id);
    const searchOr = [
      { name:             { $regex: q, $options: 'i' } },
      { phone:            { $regex: q, $options: 'i' } },
      { email:            { $regex: q, $options: 'i' } },
      { enrollmentNumber: { $regex: q, $options: 'i' } },
      { fatherName:       { $regex: q, $options: 'i' } },
      { courseName:       { $regex: q, $options: 'i' } },
    ];
    if (centerIds.length > 0) searchOr.push({ center: { $in: centerIds } });
    andConditions.push({ $or: searchOr });
  }

  if (andConditions.length === 1) Object.assign(filter, andConditions[0]);
  else if (andConditions.length > 1) filter.$and = andConditions;

  const students = await Student.find(filter)
    .populate('center', 'name city')
    .populate('counselor', 'name avatarColor')
    .populate('university', 'name shortName avatarColor')
    .sort('-createdAt');
  res.json(students);
});

// GET /api/students/:id
exports.get = asyncHandler(async (req, res) => {
  const s = await Student.findById(req.params.id)
    .populate('center', 'name city state')
    .populate('counselor', 'name avatarColor email')
    .populate('university', 'name shortName');
  await assertStudentAccess(req, s);
  res.json(s);
});

// POST /api/students
exports.create = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  const { role, centerId } = req.user;

  if (role === 'Center') {
    body.center = centerId;
    if (!body.counselor) {
      const linked = await Counselor.find({ centers: centerId }).lean();
      if (linked.length > 0) {
        body.counselor = linked[0]._id;
      } else {
        const any = await Counselor.findOne({ isActive: true }).lean();
        if (any) body.counselor = any._id;
        else { const e = new Error('No counselor assigned to this center. Contact admin.'); e.status = 400; throw e; }
      }
    }
    body.applicationStatus = 'Draft';
  }

  if (body.universityId) {
    const uni = await University.findById(body.universityId);
    if (!uni) { const e = new Error('University not found'); e.status = 404; throw e; }
    body.university    = uni._id;
    body.universityName = uni.name;
    delete body.universityId;
  }
  delete body.university_text;

  body.createdBy = req.user._id;
  if (!body.gender) delete body.gender;
  if (!body.dob)    delete body.dob;

  const student = await Student.create(body);
  await Payment.create({ student: student._id, center: student.center });
  await audit('student_created', 'Student', student._id, req.user, {}, `Student ${student.name} created`);

  const populated = await Student.findById(student._id)
    .populate('center', 'name')
    .populate('counselor', 'name')
    .populate('university', 'name shortName');
  res.status(201).json(populated);
});

// PUT /api/students/:id
exports.update = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  await assertStudentAccess(req, student);

  // Admin can edit all fields even if core is locked; others cannot touch locked fields
  if (student.coreLocked && req.user.role !== 'Admin') {
    ['name','fatherName','motherName','dob','aadharNumber'].forEach(f => delete req.body[f]);
  }
  if (req.user.role === 'Center') { delete req.body.counselor; delete req.body.center; }
  delete req.body.applicationStatus;
  delete req.body.coreLocked;
  // Only Admin can directly update enrollmentNumber (to correct mistakes)
  if (req.user.role !== 'Admin') delete req.body.enrollmentNumber;
  if (req.body.gender === '') delete req.body.gender;

  if (req.body.universityId && ['Admin','Counselor'].includes(req.user.role)) {
    const uni = await University.findById(req.body.universityId);
    if (uni) { req.body.university = uni._id; req.body.universityName = uni.name; }
    delete req.body.universityId;
  }

  const updateData = { ...req.body };
  let parsedDocs = null;
  if (req.body.submissionDocs) {
    try {
      const parsed = typeof req.body.submissionDocs === 'string'
        ? JSON.parse(req.body.submissionDocs) : req.body.submissionDocs;
      if (Array.isArray(parsed)) { parsedDocs = parsed.filter(d => d.name?.trim()); updateData.submissionDocs = parsedDocs; }
    } catch {}
  }
  if (req.files && req.files.length > 0 && parsedDocs) {
    const fileMap = {};
    req.files.forEach(file => {
      const match = file.fieldname.match(/submissionFile_([0-9]+)/);
      if (match) fileMap[parseInt(match[1])] = file;
    });
    parsedDocs.forEach((doc, i) => {
      if (fileMap[i]) { doc.fileUrl = `/uploads/${fileMap[i].filename}`; doc.sizeKb = Math.round(fileMap[i].size/1024); }
    });
    updateData.submissionDocs = parsedDocs;
  }
  delete updateData.submissionDocNames;
  delete updateData.submissionDocCount;
  if (
    updateData.enrollmentNumber !== undefined &&
    String(updateData.enrollmentNumber || '').trim() !== String(student.enrollmentNumber || '').trim()
  ) {
    updateData.enrollmentNumberChecked = false;
    updateData.enrollmentNumberCheckedAt = undefined;
    updateData.enrollmentNumberCheckedBy = undefined;
  }

  const updated = await Student.findByIdAndUpdate(req.params.id, updateData, { new: true })
    .populate('center','name').populate('counselor','name').populate('university','name shortName');
  await audit('student_updated', 'Student', student._id, req.user, {}, `Student ${student.name} updated`);
  res.json(updated);
});

// POST /api/students/:id/transfer-center  — Admin only
exports.transferCenter = asyncHandler(async (req, res) => {
  const { centerId, note } = req.body;
  if (!centerId) { const e = new Error('Target center required'); e.status = 400; throw e; }

  const student = await Student.findById(req.params.id)
    .populate('center', 'name')
    .populate('counselor', 'name');
  if (!student) { const e = new Error('Student not found'); e.status = 404; throw e; }

  const targetCenter = await Center.findById(centerId).populate('assignedCounselor', 'name');
  if (!targetCenter) { const e = new Error('Target center not found'); e.status = 404; throw e; }

  let targetCounselorId = targetCenter.assignedCounselor?._id || targetCenter.assignedCounselor;
  if (!targetCounselorId) {
    const linked = await Counselor.findOne({ centers: targetCenter._id, isActive: true }).select('_id name');
    if (linked) {
      targetCounselorId = linked._id;
      await Center.findByIdAndUpdate(targetCenter._id, { assignedCounselor: linked._id });
      targetCenter.assignedCounselor = linked;
    }
  }
  if (!targetCounselorId) {
    const e = new Error('Target center has no assigned counselor. Assign counselor to center first.'); e.status = 400; throw e;
  }

  if (!((targetCenter.assignedCounselor?.centers || []).some?.(id => String(id) === String(targetCenter._id)))) {
    await Counselor.findByIdAndUpdate(targetCounselorId, { $addToSet: { centers: targetCenter._id } });
  }

  const oldCenterId = student.center?._id || student.center;
  const oldCounselorId = student.counselor?._id || student.counselor;
  const sameCenter = String(oldCenterId) === String(targetCenter._id);
  const sameCounselor = String(oldCounselorId || '') === String(targetCounselorId);
  if (sameCenter && sameCounselor) {
    const e = new Error('Student is already assigned to this center and counselor'); e.status = 400; throw e;
  }

  await Student.findByIdAndUpdate(student._id, {
    $set: {
      center: targetCenter._id,
      counselor: targetCounselorId,
    },
    $push: {
      statusHistory: {
        status: 'Center_Transferred',
        note: note || `Transferred from ${student.center?.name || 'old center'} to ${targetCenter.name}`,
        changedBy: req.user._id,
        role: req.user.role,
        at: new Date(),
      },
    },
  });

  await Payment.updateOne(
    { student: student._id },
    { $set: { center: targetCenter._id } }
  );

  await StudentDoc.updateMany(
    { student: student._id },
    { $set: { center: targetCenter._id, counselor: targetCounselorId } }
  );

  const targetCenterUser = await User.findOne({ role: 'Center', centerId: targetCenter._id, isActive: true });
  if (targetCenterUser) {
    await notify(targetCenterUser._id, {
      message: `${student.name} has been assigned to your center by Admin.`,
      type: 'general',
      role: 'Center',
      studentId: student._id,
    });
  }

  const targetCounselorUser = await User.findOne({ role: 'Counselor', counselorId: targetCounselorId, isActive: true });
  if (targetCounselorUser) {
    await notify(targetCounselorUser._id, {
      message: `${student.name} transferred to ${targetCenter.name}. You are now the assigned counselor.`,
      type: 'general',
      role: 'Counselor',
      studentId: student._id,
    });
  }

  await audit('student_center_transferred', 'Student', student._id, req.user, {
    fromCenter: oldCenterId,
    toCenter: targetCenter._id,
    fromCounselor: oldCounselorId,
    toCounselor: targetCounselorId,
    note: note || '',
  }, `Admin transferred ${student.name} to ${targetCenter.name}`);

  const updated = await Student.findById(student._id)
    .populate('center','name city')
    .populate('counselor','name avatarColor')
    .populate('university','name shortName avatarColor');
  res.json(updated);
});

// POST /api/students/:id/submit
exports.submit = asyncHandler(async (req, res) => {
  const s = await Student.findById(req.params.id).populate('university','name');
  await assertStudentAccess(req, s);
  if (!['Draft','Changes_Requested'].includes(s.applicationStatus)) {
    const e = new Error('Application can only be submitted from Draft or Changes_Requested state'); e.status = 400; throw e;
  }

  if (!s.university && req.body.universityId) {
    const uni = await University.findById(req.body.universityId);
    if (uni) {
      await Student.findByIdAndUpdate(req.params.id, { university: uni._id, universityName: uni.name });
      s.university = uni;
    }
  }

  if (!s.university) {
    const e = new Error('Please select a university before submitting the application'); e.status = 400; throw e;
  }

  if (req.body.feeDetails && s.applicationStatus === 'Draft') {
    const { totalFee, discount, notes, installments } = req.body.feeDetails;
    let payment = await Payment.findOne({ student: s._id });
    if (!payment) payment = new Payment({ student: s._id, center: s.center });
    if (totalFee !== undefined) payment.totalFee = Number(totalFee) || 0;
    if (discount !== undefined) payment.discount = Number(discount) || 0;
    if (notes !== undefined) payment.notes = notes || '';
    if (Array.isArray(installments)) {
      payment.installments = installments
        .map(row => ({
          installmentNumber: Number(row.installmentNumber || 0),
          paymentDate: row.paymentDate ? new Date(row.paymentDate) : null,
          amount: Number(row.amount || 0) || 0,
          reasonOrRequirement: String(row.reasonOrRequirement || '').trim(),
        }))
        .filter(row => row.installmentNumber > 0 && row.paymentDate && !Number.isNaN(row.paymentDate.getTime()));
    }
    await payment.save();
  }

  const paymentForSubmit = await Payment.findOne({ student: s._id }).select('installments totalFee').lean();
  if (!paymentForSubmit || !(paymentForSubmit.installments || []).length) {
    const e = new Error('Please add installment timeline before submitting the application'); e.status = 400; throw e;
  }

  if (req.body.submissionDocs) {
    try {
      const parsed = typeof req.body.submissionDocs === 'string'
        ? JSON.parse(req.body.submissionDocs) : req.body.submissionDocs;
      if (Array.isArray(parsed)) s.submissionDocs = parsed.filter(d => d.name?.trim());
    } catch {}
  }
  if (req.files && req.files.length > 0) {
    const docNames = req.body.submissionDocNames ? req.body.submissionDocNames.split(',') : [];
    const existing = s.submissionDocs || [];
    req.files.forEach((file, i) => {
      existing.push({ name: docNames[i]?.trim() || file.originalname, fileUrl: `/uploads/${file.filename}`, sizeKb: Math.round(file.size/1024) });
    });
    s.submissionDocs = existing;
  }

  const updated = await Student.findByIdAndUpdate(
    req.params.id,
    { applicationStatus: 'Submitted', submissionDocs: s.submissionDocs },
    { new: true }
  ).populate('center','name').populate('counselor','name').populate('university','name');
  await pushHistory(req.params.id, 'Submitted', req.user, '');

  let counselorUsers = [];
  if (s.counselor) {
    const direct = await User.findOne({ counselorId: s.counselor, role: 'Counselor', isActive: true });
    if (direct) counselorUsers.push(direct);
  }
  if (counselorUsers.length === 0 && s.center) {
    const cds = await Counselor.find({ centers: s.center }).lean();
    for (const cd of cds) {
      const u = await User.findOne({ counselorId: cd._id, role:'Counselor', isActive:true });
      if (u) counselorUsers.push(u);
    }
  }
  if (counselorUsers.length === 0) {
    const any = await User.findOne({ role:'Counselor', isActive:true });
    if (any) counselorUsers.push(any);
  }
  for (const cu of counselorUsers) {
    await notify(cu._id, {
      message: `New application: ${s.name} (${s.center?.name||''}) → ${s.university?.name||'University'} — needs review`,
      type: 'student_submitted', role: 'Counselor', studentId: s._id,
    });
  }
  const paymentForCoordinator = await Payment.findOne({ student: s._id }).select('installments').lean();
  if ((paymentForCoordinator?.installments || []).length > 0) {
    await notifyRole('PaymentCoordinator', {
      message: `Installment timeline received for ${s.name} (${s.center?.name || ''})`,
      type: 'installment_timeline',
      role: 'PaymentCoordinator',
      studentId: s._id,
    });
  }
  await audit('application_submitted', 'Student', s._id, req.user, {}, `${s.name} application submitted`);
  res.json(updated);
});

// POST /api/students/:id/approve
exports.counselorApprove = asyncHandler(async (req, res) => {
  const s = await Student.findById(req.params.id)
    .populate('center','name').populate('counselor','name').populate('university','name');
  if (!s || s.applicationStatus !== 'Submitted') { const e = new Error('Must be Submitted'); e.status = 400; throw e; }
  const updated = await Student.findByIdAndUpdate(req.params.id, { applicationStatus: 'Counselor_Approved' }, { new: true })
    .populate('center','name').populate('counselor','name').populate('university','name shortName');
  await pushHistory(req.params.id, 'Counselor_Approved', req.user, '');

  await notifyRole('Accountant', {
    message: `Application approved: ${s.name} | Center: ${s.center?.name} | University: ${s.university?.name||'N/A'} | Course: ${s.courseName} ${s.courseYear} | Verify fee`,
    type: 'application_approved', studentId: s._id, role: 'Accountant'
  });
  await audit('counselor_approved', 'Student', s._id, req.user, {}, `Counselor approved ${s.name}`);
  res.json(updated);
});

// POST /api/students/:id/reject
exports.reject = asyncHandler(async (req, res) => {
  const s = await Student.findById(req.params.id);
  if (!s) { const e = new Error('Not found'); e.status = 404; throw e; }
  const allowed = ['Submitted','Counselor_Approved','Accountant_Pending'];
  if (!allowed.includes(s.applicationStatus)) { const e = new Error('Cannot reject from current status'); e.status = 400; throw e; }
  await Student.findByIdAndUpdate(req.params.id, { applicationStatus: 'Rejected', rejectionReason: req.body.reason||'' });
  s.applicationStatus = 'Rejected'; s.rejectionReason = req.body.reason||'';

  const centerUser = await User.findOne({ centerId: s.center, role:'Center', isActive:true });
  if (centerUser) await notify(centerUser._id, {
    message: `Application rejected for ${s.name}: ${s.rejectionReason}`,
    type: 'application_rejected', role: 'Center', studentId: s._id,
  });
  await pushHistory(req.params.id, 'Rejected', req.user, req.body.reason || '');
  await audit('rejected', 'Student', s._id, req.user, { reason: req.body.reason }, `${s.name} application rejected`);
  res.json(s);
});

// POST /api/students/:id/request-changes
exports.requestChanges = asyncHandler(async (req, res) => {
  const s = await Student.findById(req.params.id);
  if (!s || s.applicationStatus !== 'Submitted') { const e = new Error('Must be Submitted'); e.status = 400; throw e; }
  await Student.findByIdAndUpdate(req.params.id, { applicationStatus: 'Changes_Requested', changesRequested: req.body.note||'' });
  s.applicationStatus = 'Changes_Requested';

  const centerUser = await User.findOne({ centerId: s.center, role:'Center', isActive:true });
  if (centerUser) await notify(centerUser._id, {
    message: `Changes requested for ${s.name}: ${req.body.note||'Please update your application'}`,
    type: 'changes_requested', role: 'Center', studentId: s._id,
  });
  await audit('changes_requested', 'Student', s._id, req.user, { note: req.body.note }, `Changes requested for ${s.name}`);
  await pushHistory(req.params.id, 'Changes_Requested', req.user, req.body.note || '');
  res.json(s);
});

// POST /api/students/:id/accountant-action
exports.accountantAction = asyncHandler(async (req, res) => {
  const { action, note } = req.body;
  const s = await Student.findById(req.params.id).populate('university','name _id');
  if (!s) { const e = new Error('Not found'); e.status = 404; throw e; }
  if (!['Counselor_Approved','Accountant_Pending','University_Rejected'].includes(s.applicationStatus)) {
    const e = new Error('Not in accountant queue'); e.status = 400; throw e;
  }

  let updateFields = {};
  if (action === 'approve') {
    updateFields = { applicationStatus: 'Sent_To_University' };

    const uniId = s.university?._id || s.university;
    if (uniId) {
      const uniUsers = await User.find({ role:'University', universityId: uniId, isActive:true }).select('_id').lean();
      for (const u of uniUsers) {
        await notify(u._id, {
          message: `New admission: ${s.name} | Course: ${s.courseName} ${s.courseYear} | Center: ${s.center?.name||''}`,
          type: 'application_approved', studentId: s._id, role: 'University',
        });
      }
    } else {
      await notifyRole('University', {
        message: `New admission: ${s.name} | Course: ${s.courseName} ${s.courseYear}`,
        type: 'application_approved', studentId: s._id, role: 'University',
      });
    }

    let cu = await User.findOne({ counselorId: s.counselor, role:'Counselor', isActive:true });
    if (!cu) cu = await User.findOne({ role:'Counselor', isActive:true });
    if (cu) await notify(cu._id, {
      message: `${s.name}'s application sent to ${s.university?.name||'University'} for enrollment`,
      type:'application_approved', studentId:s._id, role:'Counselor'
    });

  } else if (action === 'reject') {
    updateFields = { applicationStatus: 'Accountant_Rejected', rejectionReason: note||'', rejectedVia: 'accountant' };
    let cu = await User.findOne({ counselorId: s.counselor, role:'Counselor', isActive:true });
    if (!cu) {
      const cd = await Counselor.find({ centers: s.center }).lean();
      if (cd.length > 0) cu = await User.findOne({ counselorId: cd[0]._id, role:'Counselor', isActive:true });
    }
    if (cu) await notify(cu._id, {
      message: `Accountant rejected ${s.name}'s application: ${note||'Fee issue'}. Please review.`,
      type: 'application_rejected', role: 'Counselor', studentId: s._id,
    });
  } else {
    updateFields = { applicationStatus: 'Accountant_Pending' };
  }

  await Student.findByIdAndUpdate(req.params.id, updateFields);
  Object.assign(s, updateFields);

  const historyLabel = action === 'approve' ? 'Sent_To_University' : action === 'reject' ? 'Accountant_Rejected' : 'Accountant_Pending';
  await pushHistory(req.params.id, historyLabel, req.user, note || '');
  await audit('accountant_action', 'Student', s._id, req.user, { action, note }, `Accountant ${action} for ${s.name}`);
  res.json(s);
});

// POST /api/students/:id/counselor-reforward
exports.counselorReforward = asyncHandler(async (req, res) => {
  const s = await Student.findById(req.params.id);
  if (!s || !['Accountant_Rejected','Changes_Requested'].includes(s.applicationStatus)) {
    const e = new Error('Cannot re-forward from current status'); e.status = 400; throw e;
  }
  const updated = await Student.findByIdAndUpdate(req.params.id,
    { applicationStatus: 'Counselor_Approved', rejectionReason: '' }, { new: true }
  );
  await notifyRole('Accountant', {
    message: `Application re-forwarded: ${s.name} — please re-review`,
    type: 'application_approved', studentId: s._id, role: 'Accountant',
  });
  await audit('counselor_reforward', 'Student', s._id, req.user, {}, `Counselor re-forwarded ${s.name} to accountant`);
  await pushHistory(req.params.id, 'Counselor_Approved', req.user, 'Re-forwarded to accountant');
  res.json(updated);
});

// POST /api/students/:id/counselor-send-to-center
exports.counselorSendToCenter = asyncHandler(async (req, res) => {
  const s = await Student.findById(req.params.id);
  if (!s || s.applicationStatus !== 'Accountant_Rejected') {
    const e = new Error('Must be Accountant_Rejected status'); e.status = 400; throw e;
  }
  const note = req.body.note || 'Please update your application and resubmit';
  const isUniversityPath = req.body.finalReject === true;
  const newStatus = isUniversityPath ? 'Rejected' : 'Changes_Requested';
  const updateFields = { applicationStatus: newStatus, changesRequested: newStatus === 'Changes_Requested' ? note : undefined };
  if (newStatus === 'Rejected') {
    updateFields.rejectionReason = note;
    updateFields.changesRequested = undefined;
    updateFields.rejectedVia = 'university';
  }

  const updated = await Student.findByIdAndUpdate(req.params.id, updateFields, { new: true });
  const centerUser = await User.findOne({ centerId: s.center, role:'Center', isActive:true });
  if (centerUser) await notify(centerUser._id, {
    message: newStatus === 'Rejected'
      ? `Application rejected for ${s.name} (University rejected): ${note}`
      : `Application sent back for changes: ${s.name} — ${note}`,
    type: newStatus === 'Rejected' ? 'application_rejected' : 'changes_requested',
    role: 'Center', studentId: s._id,
  });
  await audit('sent_back_to_center', 'Student', s._id, req.user, { note, newStatus }, `Counselor sent ${s.name} back to center as ${newStatus}`);
  await pushHistory(req.params.id, newStatus, req.user, note);
  res.json(updated);
});

// POST /api/students/:id/university-reject
exports.universityReject = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const s = await Student.findById(req.params.id).populate('university','name').populate('center','name');
  if (!s) { const e = new Error('Not found'); e.status = 404; throw e; }
  if (s.applicationStatus !== 'Sent_To_University') {
    const e = new Error('Student must be in Sent_To_University stage'); e.status = 400; throw e;
  }
  if (req.user.role === 'University') {
    if (req.user.universityId && String(s.university?._id||s.university) !== String(req.user.universityId)) {
      const e = new Error('Forbidden'); e.status = 403; throw e;
    }
  }
  const updated = await Student.findByIdAndUpdate(req.params.id,
    { applicationStatus: 'University_Rejected', rejectionReason: reason||'' },
    { new: true }
  ).populate('center','name').populate('counselor','name').populate('university','name shortName');

  await notifyRole('Accountant', {
    message: `University rejected ${s.name}'s application (${s.university?.name||''}): ${reason||'No reason given'}. Please review and forward to counselor.`,
    type: 'application_rejected', studentId: s._id, role: 'Accountant',
  });
  await pushHistory(req.params.id, 'University_Rejected', req.user, reason || '');
  await audit('university_rejected', 'Student', s._id, req.user, { reason }, `University rejected ${s.name}`);
  res.json(updated);
});

// POST /api/students/:id/accountant-forward-to-counselor
exports.accountantForwardToCounselor = asyncHandler(async (req, res) => {
  const { note } = req.body;
  const s = await Student.findById(req.params.id).populate('center','name').populate('university','name');
  if (!s) { const e = new Error('Not found'); e.status = 404; throw e; }
  if (s.applicationStatus !== 'University_Rejected') {
    const e = new Error('Student must be in University_Rejected stage'); e.status = 400; throw e;
  }
  const updated = await Student.findByIdAndUpdate(req.params.id,
    { applicationStatus: 'Accountant_Rejected', rejectionReason: s.rejectionReason || note || '', rejectedVia: 'university' },
    { new: true }
  ).populate('center','name').populate('counselor','name').populate('university','name shortName');

  let cu = await User.findOne({ counselorId: s.counselor, role:'Counselor', isActive:true });
  if (!cu) {
    const cd = await Counselor.find({ centers: s.center }).lean();
    if (cd.length > 0) cu = await User.findOne({ counselorId: cd[0]._id, role:'Counselor', isActive:true });
  }
  if (cu) await notify(cu._id, {
    message: `University rejected ${s.name}'s application (${s.university?.name||''}): ${s.rejectionReason||note||'Please review'}. Decide whether to send to center.`,
    type: 'application_rejected', role: 'Counselor', studentId: s._id,
  });
  await pushHistory(req.params.id, 'Accountant_Rejected', req.user, `University rejection forwarded to counselor. Reason: ${s.rejectionReason || note || ''}`);
  await audit('accountant_forward_university_reject', 'Student', s._id, req.user, { note }, `Accountant forwarded university rejection of ${s.name} to counselor`);
  res.json(updated);
});

// POST /api/students/:id/enrollment
exports.assignEnrollment = asyncHandler(async (req, res) => {
  const { enrollmentNumber } = req.body;
  if (!enrollmentNumber?.trim()) { const e = new Error('Enrollment number required'); e.status = 400; throw e; }

  const s = await Student.findById(req.params.id).populate('university','name');
  if (!s || s.applicationStatus !== 'Sent_To_University') { const e = new Error('Not in university stage'); e.status = 400; throw e; }

  if (req.user.role === 'University') {
    if (req.user.universityId && String(s.university?._id||s.university) !== String(req.user.universityId)) {
      const e = new Error('Forbidden — student belongs to a different university'); e.status = 403; throw e;
    }
  }

  await Student.findByIdAndUpdate(req.params.id, {
    enrollmentNumber: enrollmentNumber.trim(),
    enrollmentNumberChecked: false,
    enrollmentNumberCheckedAt: undefined,
    enrollmentNumberCheckedBy: undefined,
    applicationStatus: 'Enrolled',
    coreLocked: true,
  });
  s.enrollmentNumber = enrollmentNumber.trim(); s.applicationStatus = 'Enrolled';

  const counselorUser = await User.findOne({ counselorId: s.counselor, isActive:true });
  if (counselorUser) await notify(counselorUser._id, {
    message: `Enrollment assigned for ${s.name}: ${enrollmentNumber} (${s.university?.name||''})`,
    type: 'enrollment_assigned', role: 'Counselor', studentId: s._id,
  });
  const centerUser = await User.findOne({ centerId: s.center, role:'Center', isActive:true });
  if (centerUser) await notify(centerUser._id, {
    message: `Enrollment assigned for ${s.name}: ${enrollmentNumber} (${s.university?.name||''})`,
    type: 'enrollment_assigned', role: 'Center', studentId: s._id,
  });
  await audit('enrollment_assigned', 'Student', s._id, req.user, { enrollmentNumber }, `Enrollment ${enrollmentNumber} assigned to ${s.name}`);
  await pushHistory(req.params.id, 'Enrolled', req.user, `Enrollment number: ${enrollmentNumber}`);
  res.json(s);
});

// POST /api/students/:id/enrollment-check - Center confirms enrollment number is correct
exports.checkEnrollmentNumber = asyncHandler(async (req, res) => {
  const s = await Student.findById(req.params.id)
    .populate('center', 'name')
    .populate('counselor', 'name')
    .populate('university', 'name shortName');
  await assertStudentAccess(req, s);

  if (!s.enrollmentNumber) {
    const e = new Error('Enrollment number is not assigned yet'); e.status = 400; throw e;
  }
  if (s.applicationStatus !== 'Enrolled') {
    const e = new Error('Enrollment can be checked only after student is enrolled'); e.status = 400; throw e;
  }

  if (s.enrollmentNumberChecked) {
    return res.json(s);
  }

  const updated = await Student.findByIdAndUpdate(
    s._id,
    {
      enrollmentNumberChecked: true,
      enrollmentNumberCheckedAt: new Date(),
      enrollmentNumberCheckedBy: req.user._id,
      $push: {
        statusHistory: {
          status: 'Enrollment_Checked',
          note: req.body.note || `Enrollment number checked by ${req.user.role}`,
          changedBy: req.user._id,
          role: req.user.role,
          at: new Date(),
        },
      },
    },
    { new: true }
  )
    .populate('center', 'name city')
    .populate('counselor', 'name avatarColor')
    .populate('university', 'name shortName avatarColor')
    .populate('enrollmentNumberCheckedBy', 'name role');

  const counselorUser = await User.findOne({ counselorId: updated.counselor?._id || updated.counselor, role: 'Counselor', isActive: true });
  if (counselorUser) {
    await notify(counselorUser._id, {
      message: `Enrollment number checked by center for ${updated.name}: ${updated.enrollmentNumber}`,
      type: 'general',
      role: 'Counselor',
      studentId: updated._id,
    });
  }

  await audit('enrollment_checked', 'Student', updated._id, req.user, {
    enrollmentNumber: updated.enrollmentNumber,
  }, `Enrollment number checked for ${updated.name}`);
  res.json(updated);
});

// POST /api/students/:id/cancel  — Admin only
exports.cancelApplication = asyncHandler(async (req, res) => {
  const s = await Student.findById(req.params.id)
    .populate('center', 'name')
    .populate('counselor', 'name')
    .populate('university', 'name');
  if (!s) { const e = new Error('Student not found'); e.status = 404; throw e; }

  if (s.applicationStatus === 'Cancelled') {
    const e = new Error('Application is already cancelled'); e.status = 400; throw e;
  }

  const reason     = (req.body.reason || '').trim();
  const prevStatus = s.applicationStatus;

  await Student.findByIdAndUpdate(req.params.id, {
    applicationStatus: 'Cancelled',
    rejectionReason: reason,
  });

  await pushHistory(s._id, 'Cancelled', req.user, reason || `Cancelled by Admin (was: ${prevStatus})`);

  const centerUser = await User.findOne({ centerId: s.center._id || s.center, role: 'Center', isActive: true });
  if (centerUser) {
    await notify(centerUser._id, {
      message: `Application for ${s.name} has been cancelled by Admin.${reason ? ' Reason: ' + reason : ''}`,
      type: 'application_rejected', role: 'Center', studentId: s._id,
    });
  }

  const counselorUser = await User.findOne({ counselorId: s.counselor?._id || s.counselor, role: 'Counselor', isActive: true });
  if (counselorUser) {
    await notify(counselorUser._id, {
      message: `Application for ${s.name} has been cancelled by Admin.${reason ? ' Reason: ' + reason : ''}`,
      type: 'application_rejected', role: 'Counselor', studentId: s._id,
    });
  }

  await audit('cancelled', 'Student', s._id, req.user, { reason, prevStatus }, `${s.name} application cancelled by Admin (was: ${prevStatus})`);
  res.json({ success: true, message: 'Application cancelled successfully' });
});

// POST /api/students/:id/request-settlement  — Center only
exports.requestSettlement = asyncHandler(async (req, res) => {
  const s = await Student.findById(req.params.id).populate('center', 'name').populate('counselor', 'name');
  if (!s) { const e = new Error('Student not found'); e.status = 404; throw e; }

  if (s.applicationStatus !== 'Cancelled') {
    const e = new Error('Settlement can only be requested for cancelled applications'); e.status = 400; throw e;
  }
  if (s.amountSettled) {
    const e = new Error('Amount is already settled'); e.status = 400; throw e;
  }
  const alreadyRequested = s.settlementRequested ||
    (s.statusHistory || []).some(h => h.status === 'Settlement_Requested');
  if (alreadyRequested) {
    const e = new Error('Settlement has already been requested'); e.status = 400; throw e;
  }
  if (req.user.role === 'Center' && String(s.center._id || s.center) !== String(req.user.centerId)) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }

  const note = (req.body.note || '').trim();

  await Student.findByIdAndUpdate(req.params.id, {
    settlementRequested: true,
    settlementRequestedAt: new Date(),
  });

  const counselorUser = await User.findOne({ counselorId: s.counselor._id || s.counselor, role: 'Counselor', isActive: true });
  if (counselorUser) {
    await notify(counselorUser._id, {
      message: `Settlement requested for cancelled student ${s.name} (${s.center?.name || ''}).${note ? ' Note: ' + note : ''} Please review and forward to accountant if approved.`,
      type: 'settlement_requested', role: 'Counselor', studentId: s._id,
    });
  }

  await pushHistory(s._id, 'Settlement_Requested', req.user, note || 'Settlement requested by center — counselor notified');
  await audit('settlement_requested', 'Student', s._id, req.user, { note }, `Settlement requested for ${s.name} by center`);
  res.json({ success: true, message: 'Settlement request sent to counselor successfully' });
});

// POST /api/students/:id/forward-settlement  — Counselor/Admin only
exports.forwardSettlement = asyncHandler(async (req, res) => {
  const s = await Student.findById(req.params.id).populate('center', 'name').populate('counselor', 'name');
  if (!s) { const e = new Error('Student not found'); e.status = 404; throw e; }

  if (s.applicationStatus !== 'Cancelled') {
    const e = new Error('Student must be in Cancelled status'); e.status = 400; throw e;
  }

  const hasRequest = s.settlementRequested ||
    (s.statusHistory || []).some(h => h.status === 'Settlement_Requested');
  if (!hasRequest) {
    const e = new Error('No settlement request found from center'); e.status = 400; throw e;
  }
  if (s.amountSettled) {
    const e = new Error('Amount is already settled'); e.status = 400; throw e;
  }
  const alreadyForwarded = s.settlementForwardedToAccountant ||
    (s.statusHistory || []).some(h => h.status === 'Settlement_Forwarded');
  if (alreadyForwarded) {
    const e = new Error('Settlement has already been forwarded to accountant'); e.status = 400; throw e;
  }

  const note = (req.body.note || '').trim();

  await Student.findByIdAndUpdate(req.params.id, {
    settlementForwardedToAccountant: true,
    settlementForwardedAt: new Date(),
    settlementForwardedBy: req.user._id,
  });

  const accountants = await User.find({ role: 'Accountant', isActive: true });
  for (const acc of accountants) {
    await notify(acc._id, {
      message: `Settlement forwarded by counselor for cancelled student ${s.name} (${s.center?.name || ''}).${note ? ' Note: ' + note : ''} Please process the refund/adjustment.`,
      type: 'settlement_forwarded', role: 'Accountant', studentId: s._id,
    });
  }

  const centerUser = await User.findOne({ centerId: s.center._id || s.center, role: 'Center', isActive: true });
  if (centerUser) {
    await notify(centerUser._id, {
      message: `Your settlement request for ${s.name} has been approved by counselor and forwarded to accountant for processing.`,
      type: 'settlement_forwarded', role: 'Center', studentId: s._id,
    });
  }

  await pushHistory(s._id, 'Settlement_Forwarded', req.user, note || 'Settlement forwarded to accountant by counselor');
  await audit('settlement_forwarded', 'Student', s._id, req.user, { note }, `Settlement for ${s.name} forwarded to accountant by counselor`);
  res.json({ success: true, message: 'Settlement forwarded to accountant successfully' });
});

// POST /api/students/:id/amount-settle  — Accountant/Admin marks amount as settled
exports.amountSettle = asyncHandler(async (req, res) => {
  const s = await Student.findById(req.params.id).populate('center','name').populate('university','name');
  if (!s) { const e = new Error('Not found'); e.status = 404; throw e; }

  if (!['Rejected', 'Cancelled'].includes(s.applicationStatus)) {
    const e = new Error('Student must be in Rejected or Cancelled status'); e.status = 400; throw e;
  }

  const updated = await Student.findByIdAndUpdate(req.params.id,
    { amountSettled: true, amountSettledAt: new Date(), amountSettledBy: req.user._id },
    { new: true }
  ).populate('center','name').populate('counselor','name').populate('university','name');

  const centerUser = await User.findOne({ centerId: s.center, role:'Center', isActive:true });
  if (centerUser) await notify(centerUser._id, {
    message: `Amount settled for ${s.name} — refund/adjustment has been processed by accountant.`,
    type: 'amount_settled', role: 'Center', studentId: s._id,
  });

  await pushHistory(req.params.id, 'Amount_Settled', req.user, 'Amount settled by accountant');
  await audit('amount_settled', 'Student', s._id, req.user, {}, `Amount settled for ${s.name}`);
  res.json(updated);
});

// DELETE /api/students/:id  — Admin only
exports.remove = asyncHandler(async (req, res) => {
  const StudentDocument = require('../models/StudentDocument');
  const Notification    = require('../models/Notification');
  const id = req.params.id;

  const student = await Student.findById(id).lean();
  const studentName = student?.name || id;

  // Delete all related records
  await Student.findByIdAndDelete(id);
  await Payment.deleteOne({ student: id });
  await StudentDocument.deleteMany({ student: id });
  await Notification.deleteMany({ studentId: id });

  await audit('student_deleted', 'Student', id, req.user, { studentName }, `Student "${studentName}" permanently deleted with all related records by Admin`);
  res.status(204).end();
});

const asyncHandler  = require('express-async-handler');
const StudentDoc    = require('../models/StudentDocument');
const Student       = require('../models/Student');
const User          = require('../models/User');
const { audit, notify, notifyRole } = require('../utils/helpers');

async function loadDoc(id) {
  const doc = await StudentDoc.findById(id)
    .populate('student', 'name center counselor phone email courseName courseYear fatherName enrollmentNumber')
    .populate('center', 'name city state')
    .populate('university', 'name shortName')
    .populate('payments.recordedBy', 'name role')
    .populate('uploadedBy', 'name role')
    .populate('statusHistory.changedBy', 'name role');
  if (!doc) { const e = new Error('Document not found'); e.status = 404; throw e; }
  return doc;
}

function pushHistory(doc, status, user, note = '') {
  doc.statusHistory.push({ status, changedBy: user._id, at: new Date(), note });
  doc.status = status;
}

// GET /api/documents
exports.list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.studentId) filter.student = req.query.studentId;

  const { role, centerId, counselorId, universityId } = req.user;
  if (role === 'Center')     filter.center    = centerId;
  if (role === 'Counselor')  {
    filter.counselor = counselorId;
    if (!req.query.studentId && !req.query.all) {
      filter.status = { $in: ['Requested','Forwarded','Fee_Pending','Fee_Rejected','Counselor_Received','Center_Notified','Payment_Submitted','Payment_Verified','Dispatched','Delivered'] };
    }
  }
  // HARD ISOLATION: University user only sees documents for their own university
  // Skip filter if universityId is null (legacy users — show all, admin can fix)
  if (role === 'University' && universityId) {
    filter.university = universityId;
  }

  const bypassStatus = req.query.all && ['Admin','Counselor','Accountant','Dispatch','University'].includes(role);

  if (!bypassStatus) {
    if (role === 'Accountant') filter.status = { $in: ['Forwarded','Fee_Pending','Payment_Submitted','Accountant_Reviewed','Accountant_Received'] };
    if (role === 'University') filter.status = { $in: [
      'Fee_Approved', 'Sent_To_University',
      'University_Dispatched', 'Dispatch_Received', 'Scanned',
      'Accountant_Received', 'Counselor_Received', 'Center_Notified',
      'Payment_Submitted', 'Payment_Verified', 'Dispatched', 'Delivered'
    ] };
    if (role === 'Dispatch')   filter.status = { $in: ['University_Dispatched','Dispatch_Received','Scanned','Payment_Verified','Dispatched','Delivered'] };
  }

  const docs = await StudentDoc.find(filter)
    .populate('student', 'name enrollmentNumber courseName')
    .populate('center', 'name')
    .populate('university', 'name shortName')
    .populate('payments.recordedBy', 'name role')
    .sort('-createdAt');
  res.json(docs);
});

exports.get = asyncHandler(async (req, res) => {
  res.json(await loadDoc(req.params.id));
});

// POST /api/documents - Center creates doc request with optional payment
exports.create = asyncHandler(async (req, res) => {
  const {
    studentId, name, type, note, chargeFee,
    paymentAmount, paymentMode, paymentUtrRef, paymentDate,
    paymentUpiId, paymentBankName, paymentAccountHolder, paymentAccountNumber, paymentIfscCode,
    paymentPaidToAccount, paymentPaidToAccountLabel,
  } = req.body;
  const student = await Student.findById(studentId);
  if (!student) { const e = new Error('Student not found'); e.status = 404; throw e; }

  if (req.user.role === 'Center' && student.applicationStatus !== 'Enrolled') {
    const e = new Error('Document requests only after enrollment'); e.status = 400; throw e;
  }
  if (req.user.role === 'Center' && String(student.center) !== String(req.user.centerId)) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }

  const doc = new StudentDoc({
    student: studentId, center: student.center, counselor: student.counselor,
    university: student.university,
    name: name.trim(), type: type||'', note: note||'',
    chargeFee: Number(chargeFee)||0,
    uploadedBy: req.user._id, status: 'Requested',
    statusHistory: [{ status: 'Requested', changedBy: req.user._id, at: new Date() }],
  });

  if (req.file) { doc.fileUrl = `/uploads/${req.file.filename}`; doc.sizeKb = Math.round(req.file.size/1024); }

  const paidAmount = Number(paymentAmount) || 0;
  if (paidAmount > 0) {
    const validMode = ['UPI','Bank Transfer'].includes(paymentMode) ? paymentMode : 'UPI';
    doc.payments.push({
      amount: paidAmount, mode: validMode,
      upiId: paymentUpiId||'', utrRef: paymentUtrRef||'',
      bankName: paymentBankName||'', accountHolder: paymentAccountHolder||'',
      accountNumber: paymentAccountNumber||'', ifscCode: paymentIfscCode||'',
      paidAt: paymentDate ? new Date(paymentDate) : new Date(),
      recordedBy: req.user._id,
      paidToAccount: paymentPaidToAccount || undefined,
      paidToAccountLabel: paymentPaidToAccountLabel || '',
    });
    doc.statusHistory.push({ status: 'Requested', changedBy: req.user._id, at: new Date(), note: `Payment of ₹${paidAmount} attached at request time` });
  }

  await doc.save();

  const counselorUser = await User.findOne({ counselorId: student.counselor, isActive: true });
  if (counselorUser) {
    await notify(counselorUser._id, {
      message: paidAmount > 0
        ? `Doc request with payment: "${name}" for ${student.name} — ₹${paidAmount} paid`
        : `Document request: "${name}" for ${student.name}`,
      type: 'doc_requested', role: 'Counselor', studentId, documentId: doc._id,
    });
  }
  await audit('doc_requested', 'StudentDocument', doc._id, req.user, { name }, `Doc request: ${name}`);
  res.status(201).json(doc);
});

exports.update = asyncHandler(async (req, res) => {
  const doc = await StudentDoc.findById(req.params.id);
  if (!doc) { const e = new Error('Not found'); e.status = 404; throw e; }
  if (req.body.name)      doc.name      = req.body.name;
  if (req.body.type)      doc.type      = req.body.type;
  if (req.body.note)      doc.note      = req.body.note;
  if (req.body.chargeFee !== undefined) doc.chargeFee = Number(req.body.chargeFee);
  if (req.file) { doc.fileUrl = `/uploads/${req.file.filename}`; doc.sizeKb = Math.round(req.file.size/1024); }
  await doc.save();
  res.json(await loadDoc(doc._id));
});

// Counselor forwards to accountant
exports.forward = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  // BUG FIX: Only 'Requested' status can be forwarded.
  // Payment_Submitted is no longer set at create time.
  if (doc.status !== 'Requested') {
    const e = new Error('Document must be in Requested status to forward'); e.status = 400; throw e;
  }
  pushHistory(doc, 'Forwarded', req.user, 'Forwarded to accountant for fee check');
  await doc.save();
  const hasPrepayment = doc.payments.length > 0;
  const msg = hasPrepayment
    ? `Doc fee check (payment attached): "${doc.name}" for ${doc.student?.name}`
    : `Doc fee check: "${doc.name}" for ${doc.student?.name}`;
  await notifyRole('Accountant', { message: msg, type: 'doc_forwarded', documentId: doc._id, studentId: doc.student?._id, role: 'Accountant' });
  await audit('doc_forwarded', 'StudentDocument', doc._id, req.user, {}, `Forwarded to accountant`);
  res.json(doc);
});
exports.accountantAction = asyncHandler(async (req, res) => {
  const { action, note } = req.body;
  const doc = await loadDoc(req.params.id);
  if (!['Forwarded','Fee_Pending'].includes(doc.status)) {
    const e = new Error('Not in accountant queue'); e.status = 400; throw e;
  }

  if (action === 'approve') {
    pushHistory(doc, 'Fee_Approved', req.user, note||'');
    doc.status = 'Sent_To_University';
    doc.statusHistory.push({ status: 'Sent_To_University', changedBy: req.user._id, at: new Date() });
    // ISOLATED: notify only university users belonging to this document's university
    const uniId = doc.university;
    if (uniId) {
      const uniUsers = await User.find({ role:'University', universityId: uniId, isActive:true }).select('_id').lean();
      for (const u of uniUsers) {
        await notify(u._id, { message: `Document needed: "${doc.name}" for ${doc.student?.name}`, type: 'doc_fee_approved', documentId: doc._id, studentId: doc.student?._id, role: 'University' });
      }
      if (uniUsers.length === 0) await notifyRole('University', { message: `Document needed: "${doc.name}" for ${doc.student?.name}`, type: 'doc_fee_approved', documentId: doc._id, studentId: doc.student?._id, role: 'University' });
    } else {
      await notifyRole('University', { message: `Document needed: "${doc.name}" for ${doc.student?.name}`, type: 'doc_fee_approved', documentId: doc._id, studentId: doc.student?._id, role: 'University' });
    }
  } else if (action === 'reject') {
    pushHistory(doc, 'Fee_Rejected', req.user, note||'Fee rejected by accountant');
    // Notify COUNSELOR — they decide whether to send back to center or re-forward
    const counselorUser = await User.findOne({ counselorId: doc.counselor, isActive: true });
    if (counselorUser) await notify(counselorUser._id, {
      message: `Accountant rejected doc fee: "${doc.name}" for ${doc.student?.name}. Reason: ${note||'Fee issue'}. Please review and decide next action.`,
      type: 'doc_fee_rejected', documentId: doc._id, role: 'Counselor',
    });
  } else {
    // pending - keep in queue
    pushHistory(doc, 'Fee_Pending', req.user, note||'Fees not cleared');
  }
  await doc.save();
  await audit('accountant_doc_action', 'StudentDocument', doc._id, req.user, { action, note }, `Accountant ${action}`);
  res.json(doc);
});

// University confirms dispatch (sends courier to Dispatch dept)
exports.universityDispatch = asyncHandler(async (req, res) => {
  const { company, trackingNo, dispatchDate, documentsDesc } = req.body;
  if (!trackingNo?.trim()) { const e = new Error('Tracking number required'); e.status = 400; throw e; }
  const doc = await loadDoc(req.params.id);
  if (doc.status !== 'Sent_To_University') { const e = new Error('Must be Sent_To_University status'); e.status = 400; throw e; }

  // Store university courier info in courierInfo temporarily
  doc.courierInfo = { company: company||'', trackingNo, dispatchDate: dispatchDate ? new Date(dispatchDate) : new Date(), documentsDesc: documentsDesc||'', sentBy: req.user._id, sentAt: new Date() };
  pushHistory(doc, 'University_Dispatched', req.user, `University sent via ${company||''} - ${trackingNo}`);
  await doc.save();
  await notifyRole('Dispatch', { message: `Courier incoming from University: "${doc.name}" - ${trackingNo}`, type: 'doc_forwarded', documentId: doc._id, role: 'Dispatch' });
  await audit('university_dispatched', 'StudentDocument', doc._id, req.user, { trackingNo }, `University dispatched ${doc.name}`);
  res.json(doc);
});

// Dispatch confirms receipt from university
exports.dispatchReceive = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  if (doc.status !== 'University_Dispatched') { const e = new Error('Must be University_Dispatched status'); e.status = 400; throw e; }
  pushHistory(doc, 'Dispatch_Received', req.user, 'Courier received from university');
  await doc.save();

  // Notify university users that their courier was received by dispatch
  const uniId = doc.university?._id || doc.university;
  if (uniId) {
    const uniUsers = await User.find({ role: 'University', universityId: uniId, isActive: true }).select('_id').lean();
    for (const u of uniUsers) {
      await notify(u._id, {
        message: `Dispatch confirmed receipt of your courier for "${doc.name}" (Student: ${doc.student?.name})`,
        type: 'doc_forwarded', documentId: doc._id, studentId: doc.student?._id, role: 'University',
      });
    }
  } else {
    // Legacy — notify all university users
    await notifyRole('University', {
      message: `Dispatch confirmed receipt of courier for "${doc.name}" (Student: ${doc.student?.name})`,
      type: 'doc_forwarded', documentId: doc._id, role: 'University',
    });
  }

  await audit('dispatch_received', 'StudentDocument', doc._id, req.user, {}, `Courier received for ${doc.name}`);
  res.json(doc);
});

// Dispatch uploads scanned copy -> goes to ACCOUNTANT first, then counselor, then center
exports.uploadScan = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  if (doc.status !== 'Dispatch_Received') { const e = new Error('Must confirm receipt first'); e.status = 400; throw e; }

  if (req.file) { doc.scannedUrl = `/uploads/${req.file.filename}`; doc.scannedName = req.file.originalname; }
  if (req.body.scannedUrl) doc.scannedUrl = req.body.scannedUrl;

  pushHistory(doc, 'Scanned', req.user, 'Scanned copy uploaded by dispatch');
  doc.status = 'Accountant_Received';
  doc.statusHistory.push({ status: 'Accountant_Received', changedBy: req.user._id, at: new Date(), note: 'Scanned copy sent to accountant for review' });
  await doc.save();

  await notifyRole('Accountant', {
    message: `Scanned document received from Dispatch: "${doc.name}" for ${doc.student?.name}. Please review and forward to counselor.`,
    type: 'doc_scanned', documentId: doc._id, role: 'Accountant',
  });
  await audit('scan_uploaded', 'StudentDocument', doc._id, req.user, {}, `Scan uploaded for ${doc.name}`);
  res.json(doc);
});

// Accountant forwards scan to counselor
exports.accountantForwardScan = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  if (doc.status !== 'Accountant_Received') { const e = new Error('Must be Accountant_Received status'); e.status = 400; throw e; }
  pushHistory(doc, 'Counselor_Received', req.user, 'Accountant reviewed and forwarded to counselor');
  await doc.save();
  const counselorUser = await User.findOne({ counselorId: doc.counselor, isActive: true });
  if (counselorUser) {
    await notify(counselorUser._id, {
      message: `Scanned document ready: "${doc.name}" for ${doc.student?.name}. Please review and forward to center.`,
      type: 'doc_scanned', documentId: doc._id, role: 'Counselor',
    });
  }
  await audit('accountant_forwarded_scan', 'StudentDocument', doc._id, req.user, {}, `Accountant forwarded scan to counselor`);
  res.json(doc);
});

// Counselor forwards scanned doc to center (notifies center for payment)
exports.counselorForwardToCenter = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  if (doc.status !== 'Counselor_Received') { const e = new Error('Must be in Counselor_Received status'); e.status = 400; throw e; }

  // Recalculate totalPaid from payments array
  const totalPaid = doc.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  doc.totalPaid = totalPaid;

  // If already fully paid — skip Center_Notified and go straight to Payment_Submitted
  if (doc.chargeFee > 0 && totalPaid >= doc.chargeFee) {
    pushHistory(doc, 'Payment_Submitted', req.user, 'Forwarded to center — payment already complete, auto-forwarded to accountant');
    await doc.save();
    // Notify accountant directly
    await notifyRole('Accountant', {
      message: `Doc payment ready for verification (pre-paid): "${doc.name}" - ${doc.student?.name}`,
      type: 'doc_payment_received', documentId: doc._id, role: 'Accountant',
    });
    // Also notify center that doc is in progress
    const centerUser = await User.findOne({ centerId: doc.center, role: 'Center', isActive: true });
    if (centerUser) {
      await notify(centerUser._id, {
        message: `Your document "${doc.name}" payment is verified — dispatch will send courier soon`,
        type: 'doc_scanned', documentId: doc._id, role: 'Center',
      });
    }
    await audit('counselor_forwarded_to_center_prepaid', 'StudentDocument', doc._id, req.user, {}, `Forwarded to accountant (pre-paid)`);
    return res.json(doc);
  }

  // Normal flow — payment pending
  pushHistory(doc, 'Center_Notified', req.user, 'Counselor forwarded to center - payment required');
  await doc.save();

  // Notify center
  const centerUser = await User.findOne({ centerId: doc.center, role: 'Center', isActive: true });
  if (centerUser) {
    await notify(centerUser._id, {
      message: `Document ready: "${doc.name}" — please complete payment`,
      type: 'doc_scanned', documentId: doc._id, role: 'Center',
    });
  }
  await audit('counselor_forwarded_to_center', 'StudentDocument', doc._id, req.user, {}, `Forwarded to center`);
  res.json(doc);
});

// Add/update doc payment
exports.addPayment = asyncHandler(async (req, res) => {
  const {
    amount, mode, utrRef, note, paidAt,
    upiId, bankName, accountHolder, accountNumber, ifscCode,
    paidToAccount, paidToAccountLabel,
  } = req.body;
  if (!amount || Number(amount) <= 0) { const e = new Error('Amount must be positive'); e.status = 400; throw e; }

  const doc = await loadDoc(req.params.id);
  doc.payments.push({
    amount: Number(amount),
    mode: mode || 'UPI',
    upiId: upiId || '',
    utrRef: utrRef || '',
    bankName: bankName || '',
    accountHolder: accountHolder || '',
    accountNumber: accountNumber || '',
    ifscCode: ifscCode || '',
    note: note || '',
    paidAt: paidAt ? new Date(paidAt) : new Date(),
    recordedBy: req.user._id,
    paidToAccount: paidToAccount || undefined,
    paidToAccountLabel: paidToAccountLabel || '',
  });

  const newTotalPaid = doc.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  doc.totalPaid = newTotalPaid;

  // BUG FIX: Status change depends on current doc status:
  // 'Requested' = doc not yet forwarded to university. Payment attaches but status stays.
  // 'Center_Notified' or 'Fee_Rejected' = scanned doc received, center now paying.
  if (doc.status === 'Requested') {
    // DO NOT change status - counselor must still forward to accountant via normal flow
    const counselorUser = await User.findOne({ counselorId: doc.counselor, isActive: true });
    if (counselorUser) {
      await notify(counselorUser._id, {
        message: `Payment attached to doc request: "${doc.name}" for ${doc.student?.name}. Forward to accountant when ready.`,
        type: 'doc_payment_received', documentId: doc._id, role: 'Counselor',
      });
    }
  } else if (['Center_Notified', 'Fee_Rejected'].includes(doc.status)) {
    // Scanned doc payment flow - move to Payment_Submitted for counselor to verify
    pushHistory(doc, 'Payment_Submitted', req.user, 'Payment submitted - counselor to verify and forward to accountant');
    const counselorUser = await User.findOne({ counselorId: doc.counselor, isActive: true });
    if (counselorUser) {
      await notify(counselorUser._id, {
        message: `Center submitted payment for "${doc.name}" - ${doc.student?.name}. Please verify and forward to accountant.`,
        type: 'doc_payment_received', documentId: doc._id, role: 'Counselor',
      });
    }
  }
  await doc.save();
  await audit('doc_payment_added', 'StudentDocument', doc._id, req.user, { amount, utrRef }, `Payment ₹${amount} for ${doc.name}`);
  res.json(await loadDoc(doc._id));
});

// Update existing doc payment
exports.updatePayment = asyncHandler(async (req, res) => {
  const doc = await StudentDoc.findById(req.params.id);
  if (!doc) { const e = new Error('Document not found'); e.status = 404; throw e; }
  const payment = doc.payments.id(req.params.payId);
  if (!payment) { const e = new Error('Payment not found'); e.status = 404; throw e; }

  const fields = ['amount','mode','upiId','utrRef','bankName','accountHolder','accountNumber','ifscCode','note','paidAt'];
  fields.forEach(f => {
    if (req.body[f] !== undefined) {
      payment[f] = f === 'amount' ? Number(req.body[f]) : f === 'paidAt' ? new Date(req.body[f]) : req.body[f];
    }
  });
  await doc.save();
  res.json(await loadDoc(doc._id));
});

// Center requests dispatch when already fully paid (skips payment step)
exports.requestDispatch = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  if (doc.status !== 'Center_Notified') { const e = new Error('Document must be in Center_Notified status'); e.status = 400; throw e; }

  const fullyPaid = doc.chargeFee <= 0 || doc.totalPaid >= doc.chargeFee;
  if (!fullyPaid) { const e = new Error('Payment not complete yet'); e.status = 400; throw e; }

  // Same as addPayment flow — move to Payment_Submitted so counselor can forward
  pushHistory(doc, 'Payment_Submitted', req.user, 'Center requested dispatch — payment already complete');
  await doc.save();

  // Notify counselor to forward to accountant
  const counselorUser = await User.findOne({ counselorId: doc.counselor, isActive: true });
  if (counselorUser) {
    await notify(counselorUser._id, {
      message: `Dispatch requested for "${doc.name}" — ${doc.student?.name}. Payment already complete. Please forward to accountant.`,
      type: 'doc_payment_received', documentId: doc._id, role: 'Counselor',
    });
  }
  await audit('request_dispatch', 'StudentDocument', doc._id, req.user, {}, `Center requested dispatch for ${doc.name}`);
  res.json(await loadDoc(doc._id));
});

// Counselor forwards payment verification to accountant
exports.counselorForwardPayment = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  if (doc.status !== 'Payment_Submitted') { const e = new Error('Must be Payment_Submitted status'); e.status = 400; throw e; }
  pushHistory(doc, 'Payment_Submitted', req.user, 'Counselor reviewed - forwarded to accountant for verification');
  await doc.save();
  // Now notify accountant
  await notifyRole('Accountant', { message: `Doc payment ready for verification: "${doc.name}" - ${doc.student?.name}`, type: 'doc_payment_received', documentId: doc._id, role: 'Accountant' });
  await audit('counselor_forwarded_payment', 'StudentDocument', doc._id, req.user, {}, `Forwarded payment to accountant`);
  res.json(doc);
});

// Accountant verifies doc payment -> sends to Dispatch
exports.verifyPayment = asyncHandler(async (req, res) => {
  const { approved, note } = req.body;
  const doc = await loadDoc(req.params.id);
  if (doc.status !== 'Payment_Submitted') { const e = new Error('Not in payment verification'); e.status = 400; throw e; }

  if (approved) {
    pushHistory(doc, 'Payment_Verified', req.user, note||'Payment verified');
    // Notify Dispatch to send courier to center
    await notifyRole('Dispatch', { message: `Payment verified - send courier to center for: "${doc.name}" - ${doc.student?.name}`, type: 'payment_verified', documentId: doc._id, role: 'Dispatch' });
    // Also notify Counselor
    const counselorUser = await User.findOne({ counselorId: doc.counselor, isActive: true });
    if (counselorUser) await notify(counselorUser._id, { message: `Doc payment verified for "${doc.name}" - Dispatch will courier to center`, type: 'payment_verified', documentId: doc._id, role: 'Counselor' });
  } else {
    pushHistory(doc, 'Center_Notified', req.user, note||'Payment rejected - resubmit');
  }
  await doc.save();
  await audit('doc_payment_verified', 'StudentDocument', doc._id, req.user, { approved }, `Payment ${approved ? 'verified':'rejected'}`);
  res.json(doc);
});

// Dispatch sends courier to center (with courier details sent to counselor too)
exports.dispatchToCenter = asyncHandler(async (req, res) => {
  const { company, trackingNo, dispatchDate, documentsDesc } = req.body;
  if (!trackingNo?.trim()) { const e = new Error('Tracking number required'); e.status = 400; throw e; }

  const doc = await loadDoc(req.params.id);
  if (doc.status !== 'Payment_Verified') { const e = new Error('Payment must be verified first'); e.status = 400; throw e; }

  // Overwrite courierInfo with dispatch-to-center details
  doc.courierInfo = { company: company||'', trackingNo, dispatchDate: dispatchDate ? new Date(dispatchDate) : new Date(), documentsDesc: documentsDesc||doc.name, sentBy: req.user._id, sentAt: new Date() };
  pushHistory(doc, 'Dispatched', req.user, `Courier: ${company||''} - ${trackingNo}`);
  await doc.save();

  // Notify COUNSELOR first with courier details
  const counselorUser = await User.findOne({ counselorId: doc.counselor, isActive: true });
  if (counselorUser) {
    await notify(counselorUser._id, {
      message: `Document dispatched to center: "${doc.name}" - ${company||''} Tracking: ${trackingNo}`,
      type: 'doc_dispatched', documentId: doc._id, role: 'Counselor',
    });
  }
  // Then notify center
  const centerUser = await User.findOne({ centerId: doc.center, role: 'Center', isActive: true });
  if (centerUser) {
    await notify(centerUser._id, {
      message: `Document en route: "${doc.name}" - ${company||''}, Tracking: ${trackingNo}`,
      type: 'doc_dispatched', documentId: doc._id, role: 'Center',
    });
  }
  await audit('doc_dispatched', 'StudentDocument', doc._id, req.user, { company, trackingNo }, `Dispatched: ${doc.name}`);
  res.json(doc);
});


exports.centerConfirmDelivery = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  if (doc.status !== 'Dispatched') {
    const e = new Error('Document must be in Dispatched status'); e.status = 400; throw e;
  }

  pushHistory(doc, 'Delivered', req.user, 'Center confirmed receipt of courier');
  await doc.save();

  
  
  const counselorUser = await User.findOne({ counselorId: doc.counselor, isActive: true });
  

  if (counselorUser) {
    await notify(counselorUser._id, {
      message: `Center "${doc.center?.name}" confirmed receipt of courier for "${doc.name}" - Student: ${doc.student?.name}${doc.student?.enrollmentNumber ? ` (${doc.student.enrollmentNumber})` : ''}`,
      type: 'doc_delivered', documentId: doc._id, role: 'Counselor',
    });
    console.log('Notification sent to:', counselorUser._id);
  } else {
    console.log('NO counselorUser found!');
  }

  await audit('doc_delivered', 'StudentDocument', doc._id, req.user, {}, `Delivered: ${doc.name}`);
  res.json(doc);
});

exports.remove = asyncHandler(async (req, res) => {
  await StudentDoc.findByIdAndDelete(req.params.id);
  res.status(204).end();
});
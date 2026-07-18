const asyncHandler = require('express-async-handler');
const Payment = require('../models/Payment');
const Student = require('../models/Student');
const User    = require('../models/User');
const Counselor = require('../models/Counselor');
const { audit, notify, notifyRole } = require('../utils/helpers');

function normalizeInstallments(input) {
  if (!Array.isArray(input)) return undefined;
  return input
    .map((row, idx) => ({
      installmentNumber: Number(row.installmentNumber || row.number || 0) || idx + 1,
      paymentDate: row.paymentDate ? new Date(row.paymentDate) : null,
      amount: Number(row.amount || row.fee || 0) || 0,
      reasonOrRequirement: String(row.reasonOrRequirement || row.reason || '').trim(),
    }))
    .filter(row => row.installmentNumber > 0
      && (row.amount > 0 || row.reasonOrRequirement || (row.paymentDate && !Number.isNaN(row.paymentDate.getTime()))))
    .sort((a, b) => {
      const byDate = new Date(a.paymentDate || 0) - new Date(b.paymentDate || 0);
      return byDate || a.installmentNumber - b.installmentNumber;
    });
}

function validateInstallmentTotal(installments = [], netFee = 0) {
  if (!installments.length) return '';
  const expected = Math.max(0, Number(netFee || 0));
  if (!expected) return '';
  const total = installments.reduce((sum, row) => sum + (Number(row.amount || 0) || 0), 0);
  if (total < expected) return `Installment total is short by ₹${(expected - total).toLocaleString('en-IN')}`;
  if (total > expected) return `Fee and installment total mismatch. Net fee is ₹${expected.toLocaleString('en-IN')}, installment total is ₹${total.toLocaleString('en-IN')}`;
  return '';
}

function wantsCenterFlow(req) {
  return req.body.actingAsCenter === true || req.body.actingAsCenter === 'true';
}

async function canActForStudentCenter(req, student) {
  if (req.user.role === 'PaymentCoordinator' && wantsCenterFlow(req)) return true;
  if (req.user.role !== 'Counselor' || !wantsCenterFlow(req)) return false;
  const counselor = await Counselor.findById(req.user.counselorId).select('centers').lean();
  return (counselor?.centers || []).some(centerId => String(centerId) === String(student.center));
}

exports.get = asyncHandler(async (req, res) => {
  const existing = await Payment.findOne({ student: req.params.studentId });
  if (existing) await existing.save();
  const payment = await Payment.findOne({ student: req.params.studentId })
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role')
    .populate('transactions.documentRef', 'name');
  res.json(payment || null);
});

// PUT - lock fee after first submission for Center role
exports.upsertFee = asyncHandler(async (req, res) => {
  const { totalFee, discount, notes } = req.body;
  const student = await Student.findById(req.params.studentId);
  if (!student) { const e = new Error('Student not found'); e.status = 404; throw e; }
  const userActingAsCenter = await canActForStudentCenter(req, student);
  const centerOriginated = req.user.role === 'Center' || userActingAsCenter;

  if (req.user.role === 'Center' && String(student.center) !== String(req.user.centerId)) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }
  if (['Counselor','PaymentCoordinator'].includes(req.user.role) && wantsCenterFlow(req) && !userActingAsCenter) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }

  // Cancelled applications are fully locked — no changes allowed
  if (student.applicationStatus === 'Cancelled' && centerOriginated) {
    const e = new Error('This application has been cancelled. No changes are allowed.'); e.status = 403; throw e;
  }

  // Center can only set fees in Draft or Changes_Requested state
  if (centerOriginated && req.user.role !== 'PaymentCoordinator' && !['Draft', 'Changes_Requested'].includes(student.applicationStatus)) {
    const e = new Error('Fee structure cannot be changed after submission. Contact Admin/Counselor.'); e.status = 403; throw e;
  }

  let payment = await Payment.findOne({ student: req.params.studentId });
  if (!payment) payment = new Payment({ student: req.params.studentId, center: student.center });

  if (totalFee !== undefined) payment.totalFee = Number(totalFee) || 0;
  if (discount !== undefined) payment.discount  = Number(discount) || 0;
  if (notes    !== undefined) payment.notes     = notes;
  const installments = normalizeInstallments(req.body.installments);
  if (installments !== undefined) {
    const netFee = Math.max(0, (payment.totalFee || 0) - (payment.discount || 0));
    const totalError = validateInstallmentTotal(installments, netFee);
    if (totalError) { const e = new Error(totalError); e.status = 400; throw e; }
  }
  if (installments !== undefined) payment.installments = installments;
  await payment.save();

  if (student.applicationStatus !== 'Draft' && installments !== undefined) {
    await notifyRole('PaymentCoordinator', {
      message: `Installment timeline updated for ${student.name}`,
      type: 'installment_updated',
      role: 'PaymentCoordinator',
      studentId: student._id,
    });
  }

  await audit('fee_updated', 'Payment', payment._id, req.user, { totalFee, discount, installments: installments?.length }, `Fee updated`);
  res.json(await Payment.findById(payment._id).populate('transactions.recordedBy', 'name role'));
});

exports.installmentTimeline = asyncHandler(async (req, res) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const payments = await Payment.find({ 'installments.0': { $exists: true } })
    .populate({
      path: 'student',
      select: 'name phone email courseName courseYear enrollmentNumber applicationStatus center counselor university',
      populate: [
        { path: 'center', select: 'name organisationName city' },
        { path: 'counselor', select: 'name' },
        { path: 'university', select: 'name shortName' },
      ],
    })
    .populate('center', 'name organisationName city')
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role');
  for (const payment of payments) await payment.save();
  const rowsSource = payments.map(payment => payment.toObject());

  const rows = [];
  for (const payment of rowsSource) {
    if (!payment.student) continue;
    if (payment.student.applicationStatus === 'Draft') continue;
    const feeTransactions = (payment.transactions || [])
      .filter(t => t.type === 'Fee' && ['verified', 'not_required'].includes(t.verificationStatus || 'not_required'))
      .sort((a, b) => new Date(a.paidAt || a.createdAt || 0) - new Date(b.paidAt || b.createdAt || 0));
    const orderedInstallments = [...(payment.installments || [])].sort((a, b) => {
      const byDate = new Date(a.paymentDate || 0) - new Date(b.paymentDate || 0);
      return byDate || (a.installmentNumber || 0) - (b.installmentNumber || 0);
    });
    const paidDateByInstallment = {};
    let requiredTotal = 0;
    for (const planned of orderedInstallments) {
      requiredTotal += Number(planned.amount || 0);
      let paidTotal = 0;
      const coveringTx = feeTransactions.find(tx => {
        paidTotal += Number(tx.amount || 0);
        return paidTotal >= requiredTotal;
      });
      if (coveringTx) paidDateByInstallment[String(planned._id)] = coveringTx.paidAt || coveringTx.createdAt;
    }
    for (const inst of payment.installments || []) {
      const due = inst.paymentDate ? new Date(inst.paymentDate) : null;
      if (!due || Number.isNaN(due.getTime())) continue;
      due.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
      rows.push({
        paymentId: payment._id,
        studentId: payment.student._id,
        studentName: payment.student.name,
        phone: payment.student.phone || '',
        email: payment.student.email || '',
        courseName: payment.student.courseName || '',
        courseYear: payment.student.courseYear || '',
        enrollmentNumber: payment.student.enrollmentNumber || '',
        applicationStatus: payment.student.applicationStatus || '',
        centerName: payment.student.center?.name || payment.student.center?.organisationName || payment.center?.name || '',
        counselorName: payment.student.counselor?.name || '',
        universityName: payment.student.university?.name || payment.student.university?.shortName || '',
        totalFee: payment.totalFee || 0,
        netFee: payment.netFee || 0,
        paidAmount: payment.paidAmount || 0,
        dueAmount: payment.dueAmount || 0,
        transactions: feeTransactions,
        installment: { ...inst, actualPaidAt: paidDateByInstallment[String(inst._id)] || null },
        paymentDate: inst.paymentDate,
        actualPaidAt: paidDateByInstallment[String(inst._id)] || null,
        daysLeft,
        bucket: inst.status === 'Paid'
          ? 'paid'
          : daysLeft < 0
            ? 'overdue'
            : daysLeft <= 7
              ? 'week'
              : 'upcoming',
      });
    }
  }

  rows.sort((a, b) => {
    const statusRank = { overdue: 0, week: 1, upcoming: 2, paid: 3 };
    return (statusRank[a.bucket] - statusRank[b.bucket])
      || (new Date(a.paymentDate) - new Date(b.paymentDate))
      || String(a.studentName).localeCompare(String(b.studentName));
  });
  res.json(rows);
});

exports.markInstallmentPaid = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.paymentId);
  if (!payment) { const e = new Error('Payment record not found'); e.status = 404; throw e; }
  const inst = payment.installments.id(req.params.installmentId);
  if (!inst) { const e = new Error('Installment not found'); e.status = 404; throw e; }

  const amount = Number(req.body.amount || Math.max(0, (inst.amount || 0) - (inst.paidAmount || 0)));
  if (!amount || amount <= 0) { const e = new Error('Amount must be positive'); e.status = 400; throw e; }

  payment.transactions.push({
    amount,
    mode: req.body.mode || 'UPI',
    upiId: req.body.upiId || '',
    utrRef: req.body.utrRef || '',
    bankName: req.body.bankName || '',
    accountHolder: req.body.accountHolder || '',
    accountNumber: req.body.accountNumber || '',
    ifscCode: req.body.ifscCode || '',
    note: req.body.note || `Installment #${inst.installmentNumber} marked paid by payment coordinator`,
    paidAt: req.body.paidAt ? new Date(req.body.paidAt) : new Date(),
    recordedBy: req.user._id,
    type: 'Fee',
    verificationStatus: 'verified',
    verifiedBy: req.user._id,
    verifiedAt: new Date(),
    paymentScreenshot: req.file ? `/uploads/${req.file.filename}` : '',
  });
  await payment.save();
  await audit('installment_paid', 'Payment', payment._id, req.user, { installmentId: inst._id, amount }, `Installment payment recorded`);
  res.json(await Payment.findById(payment._id)
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role'));
});

// POST /api/payments/:studentId/transactions - add payment
exports.addTransaction = asyncHandler(async (req, res) => {
  const {
    amount, mode, utrRef, note, paidAt, type, documentRef,
    upiId, bankName, accountHolder, accountNumber, ifscCode,
    paidToAccount, paidToAccountLabel,
  } = req.body;
  if (!amount || Number(amount) <= 0) { const e = new Error('Amount must be positive'); e.status = 400; throw e; }

  const student = await Student.findById(req.params.studentId);
  if (!student) { const e = new Error('Student not found'); e.status = 404; throw e; }
  const userActingAsCenter = await canActForStudentCenter(req, student);
  const centerOriginated = req.user.role === 'Center' || userActingAsCenter;
  if (req.user.role === 'Center' && String(student.center) !== String(req.user.centerId)) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }
  if (['Counselor','PaymentCoordinator'].includes(req.user.role) && wantsCenterFlow(req) && !userActingAsCenter) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }

  // Cancelled applications are fully locked — no new payments allowed
  if (student.applicationStatus === 'Cancelled' && centerOriginated) {
    const e = new Error('This application has been cancelled. No payments can be added.'); e.status = 403; throw e;
  }

  let payment = await Payment.findOne({ student: req.params.studentId });
  if (!payment) { const e = new Error('Set up fee structure first'); e.status = 400; throw e; }

  const needsVerification = centerOriginated && (type || 'Fee') === 'Fee';
  const verificationStatus = needsVerification ? 'pending_counselor' : 'not_required';

  payment.transactions.push({
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
    type: type || 'Fee',
    documentRef: documentRef || undefined,
    verificationStatus,
    paidToAccount: (paidToAccount && paidToAccount !== 'undefined') ? paidToAccount : undefined,
    paidToAccountLabel: paidToAccountLabel || '',
    paymentScreenshot: req.file ? `/uploads/${req.file.filename}` : '',
  });
  await payment.save();

  if (needsVerification) {
    const counselorUser = await User.findOne({ counselorId: student.counselor, isActive: true });
    if (counselorUser) {
      await notify(counselorUser._id, {
        message: `Fee payment of ₹${amount} submitted by center for ${student.name} - please verify and forward to accountant`,
        type: 'payment_verified',
        role: 'Counselor',
        studentId: student._id,
      });
    }
  }

  await audit('payment_added', 'Payment', payment._id, req.user, { amount, utrRef, verificationStatus }, `Payment ₹${amount} recorded`);
  res.status(201).json(await Payment.findById(payment._id)
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role'));
});

// PATCH /api/payments/:studentId/transactions/:txId - update transaction details
exports.updateTransaction = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ student: req.params.studentId });
  if (!payment) { const e = new Error('Payment record not found'); e.status = 404; throw e; }
  const tx = payment.transactions.id(req.params.txId);
  if (!tx) { const e = new Error('Transaction not found'); e.status = 404; throw e; }

  // Only Admin can edit verified transactions; all others are blocked
  if (tx.verificationStatus === 'verified' && req.user.role !== 'Admin') {
    const e = new Error('Cannot edit a verified payment'); e.status = 403; throw e;
  }

  const fields = ['amount','mode','upiId','utrRef','bankName','accountHolder','accountNumber','ifscCode','note','paidAt','paidToAccount'];
  fields.forEach(f => {
    if (req.body[f] !== undefined) {
      tx[f] = f === 'amount' ? Number(req.body[f]) : f === 'paidAt' ? new Date(req.body[f]) : req.body[f];
    }
  });

  // Admin can also change verification status directly
  if (req.user.role === 'Admin' && req.body.verificationStatus !== undefined) {
    tx.verificationStatus = req.body.verificationStatus;
  }

  if (req.file) tx.paymentScreenshot = `/uploads/${req.file.filename}`;
  await payment.save();
  res.json(await Payment.findById(payment._id)
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role'));
});

// PATCH /api/payments/:studentId/transactions/:txId/resend
// Center resends a rejected payment for counselor review
exports.resendTransaction = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ student: req.params.studentId });
  if (!payment) { const e = new Error('Payment record not found'); e.status = 404; throw e; }
  const student = await Student.findById(req.params.studentId);
  if (!student) { const e = new Error('Student not found'); e.status = 404; throw e; }
  const userActingAsCenter = await canActForStudentCenter(req, student);
  if (req.user.role === 'Center' && String(student.center) !== String(req.user.centerId)) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }
  if (['Counselor','PaymentCoordinator'].includes(req.user.role) && wantsCenterFlow(req) && !userActingAsCenter) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }
  const tx = payment.transactions.id(req.params.txId);
  if (!tx) { const e = new Error('Transaction not found'); e.status = 404; throw e; }
  if (tx.verificationStatus === 'verified') {
    const e = new Error('Cannot resend a verified payment'); e.status = 403; throw e;
  }

  const fields = ['amount','mode','upiId','utrRef','bankName','accountHolder','accountNumber','ifscCode','note','paidAt'];
  fields.forEach(f => {
    if (req.body[f] !== undefined) {
      tx[f] = f === 'amount' ? Number(req.body[f]) : f === 'paidAt' ? new Date(req.body[f]) : req.body[f];
    }
  });
  if (req.file) tx.paymentScreenshot = `/uploads/${req.file.filename}`;

  tx.verificationStatus = 'pending_counselor';
  await payment.save();

  await notifyRole('Counselor', {
    message: `Fee payment resubmitted by center for ${student?.name} — ₹${tx.amount}. Please review.`,
    type: 'fee_payment_resubmitted', studentId: student?._id, role: 'Counselor',
  });

  await audit('fee_payment_resubmitted', 'Payment', payment._id, req.user, { amount: tx.amount }, `Center resubmitted fee payment of ₹${tx.amount}`);
  res.json({ ok: true, message: 'Payment resubmitted for review' });
});

// PATCH /api/payments/:studentId/transactions/:txId/counsel-reject
// Counselor rejects fee payment — sends back to center to resubmit
exports.counselorRejectFeePayment = asyncHandler(async (req, res) => {
  const { note } = req.body;
  const payment = await Payment.findOne({ student: req.params.studentId });
  if (!payment) { const e = new Error('Payment record not found'); e.status = 404; throw e; }
  const tx = payment.transactions.id(req.params.txId);
  if (!tx) { const e = new Error('Transaction not found'); e.status = 404; throw e; }
  if (tx.verificationStatus !== 'pending_counselor') {
    const e = new Error('Payment is not pending counselor review'); e.status = 400; throw e;
  }
  tx.verificationStatus = 'rejected';
  tx.verificationNote   = note || '';
  tx.verifiedBy         = req.user._id;
  tx.verifiedAt         = new Date();
  await payment.save();

  const student = await Student.findById(req.params.studentId).populate('center');
  const centerUsers = await User.find({ center: student?.center?._id, role: 'Center' });
  await Promise.all(centerUsers.map(u => notify(u._id, {
    message: `Fee payment of ₹${tx.amount} for ${student?.name} was rejected by counselor${note ? ': ' + note : ''}. Please correct and resubmit.`,
    type: 'fee_payment_rejected', studentId: student?._id, role: 'Center',
  })));

  await audit('fee_payment_rejected', 'Payment', payment._id, req.user, { note }, `Counselor rejected fee payment of ₹${tx.amount}`);
  res.json({ ok: true, message: 'Fee payment rejected' });
});

// Counselor reviews fee payment -> forwards to accountant
exports.counselorForwardFeePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ student: req.params.studentId });
  if (!payment) { const e = new Error('Payment record not found'); e.status = 404; throw e; }
  const tx = payment.transactions.id(req.params.txId);
  if (!tx) { const e = new Error('Transaction not found'); e.status = 404; throw e; }
  if (tx.verificationStatus !== 'pending_counselor') {
    const e = new Error('Not pending counselor review'); e.status = 400; throw e;
  }

  tx.verificationStatus = 'pending_accountant';
  await payment.save();

  const student = await Student.findById(req.params.studentId);
  await notifyRole('Accountant', {
    message: `Fee payment verified by counselor for ${student?.name} - ₹${tx.amount}. Please verify.`,
    type: 'payment_verified',
    role: 'Accountant',
    studentId: req.params.studentId,
  });

  await audit('fee_payment_forwarded', 'Payment', payment._id, req.user, { txId: req.params.txId }, `Counselor forwarded fee payment to accountant`);
  res.json(await Payment.findById(payment._id)
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role'));
});

// PATCH /api/payments/:studentId/transactions/:txId/account-verify
// Accountant verifies or rejects fee payment
exports.accountantVerifyFeePayment = asyncHandler(async (req, res) => {
  const { approved, note } = req.body;
  const payment = await Payment.findOne({ student: req.params.studentId });
  if (!payment) { const e = new Error('Payment record not found'); e.status = 404; throw e; }
  const tx = payment.transactions.id(req.params.txId);
  if (!tx) { const e = new Error('Transaction not found'); e.status = 404; throw e; }
  if (tx.verificationStatus !== 'pending_accountant') {
    const e = new Error('Not pending accountant review'); e.status = 400; throw e;
  }

  tx.verificationStatus = approved ? 'verified' : 'rejected';
  tx.verificationNote   = note || '';
  tx.verifiedBy         = req.user._id;
  tx.verifiedAt         = new Date();
  await payment.save();

  const student = await Student.findById(req.params.studentId);
  const counselorUser = await User.findOne({ counselorId: student?.counselor, isActive: true });
  if (counselorUser) {
    await notify(counselorUser._id, {
      message: `Fee payment of ₹${tx.amount} for ${student?.name} ${approved ? 'verified ✓' : 'rejected ✗'} by accountant${note ? ': ' + note : ''}`,
      type: 'payment_verified',
      role: 'Counselor',
      studentId: req.params.studentId,
    });
  }
  const centerUser = await User.findOne({ centerId: student?.center, role: 'Center', isActive: true });
  if (centerUser) {
    await notify(centerUser._id, {
      message: `Your fee payment of ₹${tx.amount} for ${student?.name} has been ${approved ? 'verified ✓' : 'rejected ✗'}${note ? ': ' + note : ''}`,
      type: 'payment_verified',
      role: 'Center',
      studentId: req.params.studentId,
    });
  }

  await audit('fee_payment_verified', 'Payment', payment._id, req.user, { approved, note }, `Accountant ${approved ? 'verified' : 'rejected'} fee payment of ₹${tx.amount}`);
  res.json(await Payment.findById(payment._id)
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role'));
});

// GET /api/payments-rejected — Admin only: all rejected transactions
exports.getRejectedPayments = asyncHandler(async (req, res) => {
  const Student = require('../models/Student');
  const payments = await Payment.find({
    'transactions.verificationStatus': 'rejected'
  }).lean();

  const result = [];
  for (const pay of payments) {
    const rejectedTxs = pay.transactions.filter(t => t.verificationStatus === 'rejected');
    if (rejectedTxs.length === 0) continue;
    const student = await Student.findById(pay.student)
      .populate('center', 'name')
      .populate('counselor', 'name')
      .lean();
    if (!student) continue;
    rejectedTxs.forEach(tx => {
      result.push({
        studentId: student._id,
        studentName: student.name,
        centerName: student.center?.name || '',
        counselorName: student.counselor?.name || '',
        courseName: student.courseName || '',
        enrollmentNumber: student.enrollmentNumber || '',
        paymentId: pay._id,
        tx,
      });
    });
  }
  // Sort newest first
  result.sort((a, b) => new Date(b.tx.paidAt || b.tx.createdAt || 0) - new Date(a.tx.paidAt || a.tx.createdAt || 0));
  res.json(result);
});

exports.deleteTransaction = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ student: req.params.studentId });
  if (!payment) { const e = new Error('Payment record not found'); e.status = 404; throw e; }
  const idx = payment.transactions.findIndex(t => String(t._id) === req.params.txId);
  if (idx === -1) { const e = new Error('Transaction not found'); e.status = 404; throw e; }

  // Only Admin can delete verified transactions; others are blocked
  if (payment.transactions[idx].verificationStatus === 'verified' && req.user.role !== 'Admin') {
    const e = new Error('Cannot delete a verified payment'); e.status = 403; throw e;
  }

  payment.transactions.splice(idx, 1);
  await payment.save();
  res.json(await Payment.findById(payment._id)
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role'));
});

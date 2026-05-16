const asyncHandler = require('express-async-handler');
const Payment = require('../models/Payment');
const Student = require('../models/Student');
const User    = require('../models/User');
const { audit, notify, notifyRole } = require('../utils/helpers');

exports.get = asyncHandler(async (req, res) => {
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

  if (req.user.role === 'Center' && String(student.center) !== String(req.user.centerId)) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }

  // Center can only set fees in Draft or Changes_Requested state
  if (req.user.role === 'Center' && !['Draft', 'Changes_Requested'].includes(student.applicationStatus)) {
    const e = new Error('Fee structure cannot be changed after submission. Contact Admin/Counselor.'); e.status = 403; throw e;
  }

  let payment = await Payment.findOne({ student: req.params.studentId });
  if (!payment) payment = new Payment({ student: req.params.studentId, center: student.center });

  if (totalFee !== undefined) payment.totalFee = Number(totalFee) || 0;
  if (discount !== undefined) payment.discount  = Number(discount) || 0;
  if (notes    !== undefined) payment.notes     = notes;
  await payment.save();

  await audit('fee_updated', 'Payment', payment._id, req.user, { totalFee, discount }, `Fee updated`);
  res.json(await Payment.findById(payment._id).populate('transactions.recordedBy', 'name role'));
});

// POST /api/payments/:studentId/transactions - add payment
// If Center adds fee payment on enrolled student -> notify counselor for verification
exports.addTransaction = asyncHandler(async (req, res) => {
  const {
    amount, mode, utrRef, note, paidAt, type, documentRef,
    upiId, bankName, accountHolder, accountNumber, ifscCode,
    paidToAccount, paidToAccountLabel,
  } = req.body;
  if (!amount || Number(amount) <= 0) { const e = new Error('Amount must be positive'); e.status = 400; throw e; }

  const student = await Student.findById(req.params.studentId);
  if (!student) { const e = new Error('Student not found'); e.status = 404; throw e; }
  if (req.user.role === 'Center' && String(student.center) !== String(req.user.centerId)) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }

  let payment = await Payment.findOne({ student: req.params.studentId });
  if (!payment) { const e = new Error('Set up fee structure first'); e.status = 400; throw e; }

  const needsVerification = req.user.role === 'Center' && (type || 'Fee') === 'Fee';
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
    paidToAccount: paidToAccount || undefined,
    paidToAccountLabel: paidToAccountLabel || '',
  });
  await payment.save();

  // Notify counselor if verification needed
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

  // Block editing verified transactions
  if (tx.verificationStatus === 'verified') {
    const e = new Error('Cannot edit a verified payment'); e.status = 403; throw e;
  }

  const fields = ['amount','mode','upiId','utrRef','bankName','accountHolder','accountNumber','ifscCode','note','paidAt'];
  fields.forEach(f => {
    if (req.body[f] !== undefined) {
      tx[f] = f === 'amount' ? Number(req.body[f]) : f === 'paidAt' ? new Date(req.body[f]) : req.body[f];
    }
  });
  await payment.save();
  res.json(await Payment.findById(payment._id)
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role'));
});

// PATCH /api/payments/:studentId/transactions/:txId/counsel-verify
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
  // Notify accountant
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
  // Notify counselor of result
  const counselorUser = await User.findOne({ counselorId: student?.counselor, isActive: true });
  if (counselorUser) {
    await notify(counselorUser._id, {
      message: `Fee payment of ₹${tx.amount} for ${student?.name} ${approved ? 'verified ✓' : 'rejected ✗'} by accountant${note ? ': ' + note : ''}`,
      type: 'payment_verified',
      role: 'Counselor',
      studentId: req.params.studentId,
    });
  }
  // Notify center
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

exports.deleteTransaction = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ student: req.params.studentId });
  if (!payment) { const e = new Error('Payment record not found'); e.status = 404; throw e; }
  const idx = payment.transactions.findIndex(t => String(t._id) === req.params.txId);
  if (idx === -1) { const e = new Error('Transaction not found'); e.status = 404; throw e; }

  // Block deleting verified transactions
  if (payment.transactions[idx].verificationStatus === 'verified') {
    const e = new Error('Cannot delete a verified payment'); e.status = 403; throw e;
  }

  payment.transactions.splice(idx, 1);
  await payment.save();
  res.json(await Payment.findById(payment._id)
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role'));
});
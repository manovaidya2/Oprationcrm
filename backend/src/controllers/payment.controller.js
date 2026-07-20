const asyncHandler = require('express-async-handler');
const Payment = require('../models/Payment');
const Student = require('../models/Student');
const User    = require('../models/User');
const Counselor = require('../models/Counselor');
const { audit, notify, notifyRole } = require('../utils/helpers');
const { enrichPaymentDuplicateUtrs, findDuplicateUtrMatches } = require('../utils/utrDuplicate');

const CENTER_FEE_EDITABLE_STATUSES = ['Draft', 'Changes_Requested', 'Accountant_Rejected', 'University_Rejected'];

function normalizeInstallments(input) {
  if (!Array.isArray(input)) return undefined;
  return input
    .map((row, idx) => ({
      ...(row._id ? { _id: row._id } : {}),
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

// POST /api/payments-bulk — fetch payments for many students in ONE query (no duplicate-check, fast)
exports.bulkGet = asyncHandler(async (req, res) => {
  const { studentIds } = req.body;
  if (!Array.isArray(studentIds) || studentIds.length === 0) return res.json([]);
  const payments = await Payment.find({ student: { $in: studentIds } })
    .select('student totalFee discount netFee paidAmount dueAmount transactions')
    .lean();
  res.json(payments);
});

exports.get = asyncHandler(async (req, res) => {
  const existing = await Payment.findOne({ student: req.params.studentId });
  if (existing) await existing.save();
  const payment = await Payment.findOne({ student: req.params.studentId })
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role')
    .populate('transactions.documentRef', 'name');
  // Duplicate-UTR check is expensive (scans full collections) — only run it when explicitly requested
  // (dashboards/lists that just need totals should NOT trigger this)
  if (req.query.checkDuplicates === '1') {
    return res.json(await enrichPaymentDuplicateUtrs(payment));
  }
  res.json(payment);
});

exports.accountantFeePayments = asyncHandler(async (req, res) => {
  const payments = await Payment.find({
    'transactions.verificationStatus': 'pending_accountant',
  })
    .populate({
      path: 'student',
      select: 'name phone email courseName courseYear enrollmentNumber applicationStatus center counselor university fatherName tenth_percent twelfth_percent',
      populate: [
        { path: 'center', select: 'name organisationName city' },
        { path: 'counselor', select: 'name' },
        { path: 'university', select: 'name shortName' },
      ],
    })
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role')
    .lean();

  const entries = [];
  for (const payment of payments) {
    if (!payment.student) continue;
    (payment.transactions || [])
      .filter(tx => tx.verificationStatus === 'pending_accountant' && tx.type !== 'Document' && !tx.documentRef)
      .forEach(tx => entries.push({ student: payment.student, payment, tx }));
  }

  await Promise.all(entries.map(async entry => {
    const matches = await findDuplicateUtrMatches(entry.tx.utrRef, {
      paymentId: entry.payment._id,
      txId: entry.tx._id,
    });
    entry.tx.duplicateUtrMatches = matches;
    entry.tx.utrDuplicate = matches.length > 0;
  }));

  entries.sort((a, b) => new Date(b.tx.paidAt || b.tx.createdAt || 0) - new Date(a.tx.paidAt || a.tx.createdAt || 0));
  res.json(entries);
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

  // Center can edit fees while the application is still in a center-correction stage.
  if (centerOriginated && req.user.role !== 'PaymentCoordinator' && !CENTER_FEE_EDITABLE_STATUSES.includes(student.applicationStatus)) {
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
  const saved = await Payment.findById(payment._id).populate('transactions.recordedBy', 'name role');
  res.json(await enrichPaymentDuplicateUtrs(saved));
});

exports.installmentTimeline = asyncHandler(async (req, res) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const page  = req.query.page  ? Math.max(1, parseInt(req.query.page, 10)) : null;
  const limit = req.query.limit ? Math.min(100, Math.max(1, parseInt(req.query.limit, 10))) : null;

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
  // Parallelize instead of sequential await — this was doing one DB write per payment,
  // one after another, on EVERY dashboard load. Concurrent writes are safe here (different documents).
  await Promise.all(payments.map(payment => payment.save()));
  const rowsSource = payments.map(payment => payment.toObject());

  const rows = [];
  for (const payment of rowsSource) {
    if (!payment.student) continue;
    if (payment.student.applicationStatus === 'Draft') continue;
    const allFeeTransactions = (payment.transactions || [])
      .filter(t => t.type === 'Fee')
      .sort((a, b) => new Date(a.paidAt || a.createdAt || 0) - new Date(b.paidAt || b.createdAt || 0));
    const feeTransactions = allFeeTransactions
      .filter(t => t.type === 'Fee' && ['verified', 'not_required'].includes(t.verificationStatus || 'not_required'))
      .sort((a, b) => new Date(a.paidAt || a.createdAt || 0) - new Date(b.paidAt || b.createdAt || 0));
    const plannedRows = payment.installments || [];
    const timelineType = 'installments';
    const orderedInstallments = [...plannedRows].sort((a, b) => {
      const byDate = new Date(a.paymentDate || 0) - new Date(b.paymentDate || 0);
      return byDate || (a.installmentNumber || 0) - (b.installmentNumber || 0);
    });
    const paidDateByInstallment = {};
    const paidTxByInstallment = {};
    if (timelineType === 'installments' || timelineType === 'dueTimeline') {
      let requiredTotal = timelineType === 'dueTimeline' ? Number(payment.dueTimelineBasePaidAmount || 0) : 0;
      for (const planned of orderedInstallments) {
        requiredTotal += Number(planned.amount || 0);
        let paidTotal = 0;
        const coveringTx = feeTransactions.find(tx => {
          paidTotal += Number(tx.amount || 0);
          return paidTotal >= requiredTotal;
        });
        if (coveringTx) {
          paidDateByInstallment[String(planned._id)] = coveringTx.paidAt || coveringTx.createdAt;
          paidTxByInstallment[String(planned._id)] = coveringTx;
        }
      }
    }
    const base = {
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
      transactions: allFeeTransactions,
      timelineType,
    };
    for (const inst of plannedRows) {
      const actualPaidAt = paidDateByInstallment[String(inst._id)] || inst.paidAt || null;
      const paidTransaction = paidTxByInstallment[String(inst._id)] || null;
      const pendingTransaction = allFeeTransactions
        .filter(tx => ['pending_counselor', 'pending_accountant'].includes(tx.verificationStatus || ''))
        .find(tx => String(tx.installmentRef || '') === String(inst._id));
      const installment = { ...inst, actualPaidAt, paidTransaction, pendingTransaction };
      const due = inst.paymentDate ? new Date(inst.paymentDate) : null;
      if (!due || Number.isNaN(due.getTime())) {
        rows.push({
          ...base,
          needsTimeline: true,
          installment,
          paymentDate: null,
          actualPaidAt,
          paidTransaction,
          pendingTransaction,
          daysLeft: null,
          bucket: 'needs_timeline',
        });
        continue;
      }
      due.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
      rows.push({
        ...base,
        installment,
        paymentDate: inst.paymentDate,
        actualPaidAt,
        paidTransaction,
        pendingTransaction,
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

  // Opt-in pagination — old callers with no page param get the full array (unchanged behavior)
  if (page && limit) {
    const total = rows.length;
    const start = (page - 1) * limit;
    const pageRows = rows.slice(start, start + limit);
    return res.json({ rows: pageRows, total, page, pages: Math.ceil(total / limit) || 1 });
  }
  res.json(rows);
});

exports.dueTimeline = asyncHandler(async (req, res) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const payments = await Payment.find({
    'installments.0': { $exists: false },
    $or: [{ 'dueTimeline.0': { $exists: true } }, { dueAmount: { $gt: 0 } }],
  })
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

  const rows = [];
  for (const paymentDoc of payments) {
    const payment = paymentDoc.toObject();
    if (!payment.student || payment.student.applicationStatus === 'Draft') continue;

    const allFeeTransactions = (payment.transactions || [])
      .filter(t => t.type === 'Fee')
      .sort((a, b) => new Date(a.paidAt || a.createdAt || 0) - new Date(b.paidAt || b.createdAt || 0));
    const feeTransactions = allFeeTransactions
      .filter(t => t.type === 'Fee' && ['verified', 'not_required'].includes(t.verificationStatus || 'not_required'))
      .sort((a, b) => new Date(a.paidAt || a.createdAt || 0) - new Date(b.paidAt || b.createdAt || 0));

    const base = {
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
      transactions: allFeeTransactions,
    };

    const plannedRows = payment.dueTimeline || [];
    if (!plannedRows.length && (payment.dueAmount || 0) > 0) {
      rows.push({
        ...base,
        needsTimeline: true,
        installment: { _id: `due-${payment._id}`, installmentNumber: 'Timeline', paymentDate: null, amount: payment.dueAmount || 0, paidAmount: 0, status: 'Pending', reasonOrRequirement: 'Create a payment timeline for the pending balance' },
        paymentDate: null,
        actualPaidAt: null,
        daysLeft: null,
        bucket: 'needs_timeline',
      });
      continue;
    }

    const paidDateByInstallment = {};
    const paidTxByInstallment = {};
    let requiredTotal = Number(payment.dueTimelineBasePaidAmount || 0);
    for (const planned of [...plannedRows].sort((a, b) => new Date(a.paymentDate || 0) - new Date(b.paymentDate || 0))) {
      requiredTotal += Number(planned.amount || 0);
      let paidTotal = 0;
      const coveringTx = feeTransactions.find(tx => {
        paidTotal += Number(tx.amount || 0);
        return paidTotal >= requiredTotal;
      });
      if (coveringTx) {
        paidDateByInstallment[String(planned._id)] = coveringTx.paidAt || coveringTx.createdAt;
        paidTxByInstallment[String(planned._id)] = coveringTx;
      }
    }

    for (const inst of plannedRows) {
      const due = inst.paymentDate ? new Date(inst.paymentDate) : null;
      const actualPaidAt = paidDateByInstallment[String(inst._id)] || inst.paidAt || null;
      const paidTransaction = paidTxByInstallment[String(inst._id)] || null;
      const pendingTransaction = allFeeTransactions
        .filter(tx => ['pending_counselor', 'pending_accountant'].includes(tx.verificationStatus || ''))
        .find(tx => String(tx.installmentRef || '') === String(inst._id));
      const installment = { ...inst, actualPaidAt, paidTransaction, pendingTransaction };
      if (!due || Number.isNaN(due.getTime())) {
        rows.push({
          ...base,
          needsTimeline: true,
          installment,
          paymentDate: null,
          actualPaidAt,
          paidTransaction,
          pendingTransaction,
          daysLeft: null,
          bucket: inst.status === 'Paid' ? 'paid' : 'needs_timeline',
        });
        continue;
      }
      due.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
      const isPaid = inst.status === 'Paid' || Number(inst.paidAmount || 0) >= Number(inst.amount || 0);
      rows.push({
        ...base,
        installment,
        paymentDate: inst.paymentDate,
        actualPaidAt,
        paidTransaction,
        pendingTransaction,
        daysLeft,
        bucket: isPaid ? 'paid' : daysLeft < 0 ? 'overdue' : daysLeft <= 7 ? 'week' : 'upcoming',
      });
    }
  }

  const statusRank = { needs_timeline: 0, overdue: 1, week: 2, upcoming: 3, paid: 4 };
  rows.sort((a, b) => (statusRank[a.bucket] - statusRank[b.bucket])
    || (new Date(a.paymentDate || '9999-12-31') - new Date(b.paymentDate || '9999-12-31'))
    || String(a.studentName).localeCompare(String(b.studentName)));
  res.json(rows);
});

exports.updateDueTimeline = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.paymentId).populate('student', 'name applicationStatus');
  if (!payment) { const e = new Error('Payment record not found'); e.status = 404; throw e; }
  if (!payment.student || payment.student.applicationStatus === 'Draft') {
    const e = new Error('Payment timeline can be created after application submission'); e.status = 400; throw e;
  }

  await payment.save();
  const rows = normalizeInstallments(req.body.timeline || req.body.installments || []);
  if (!rows || rows.length === 0) {
    const e = new Error('Add at least one timeline row'); e.status = 400; throw e;
  }
  if (rows.some(row => !row.paymentDate || Number.isNaN(new Date(row.paymentDate).getTime()))) {
    const e = new Error('Payment date is required for every timeline row'); e.status = 400; throw e;
  }

  const dueAmount = Number(payment.dueAmount || 0);
  if (dueAmount <= 0) {
    const e = new Error('No pending balance is available for a payment timeline'); e.status = 400; throw e;
  }

  const total = rows.reduce((sum, row) => sum + (Number(row.amount || 0) || 0), 0);
  if (total !== dueAmount) {
    const e = new Error(`Timeline total must match pending balance. Pending balance is ₹${dueAmount.toLocaleString('en-IN')}, timeline total is ₹${total.toLocaleString('en-IN')}`);
    e.status = 400;
    throw e;
  }

  payment.dueTimeline = rows;
  payment.dueTimelineBasePaidAmount = payment.paidAmount || 0;
  await payment.save();
  await notifyRole('PaymentCoordinator', {
    message: `Payment timeline updated for ${payment.student.name}`,
    type: 'installment_updated',
    role: 'PaymentCoordinator',
    studentId: payment.student._id,
  });
  await audit('payment_due_timeline_updated', 'Payment', payment._id, req.user, { rows: rows.length, dueAmount }, 'Payment due timeline updated');
  const saved = await Payment.findById(payment._id)
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role');
  res.json(await enrichPaymentDuplicateUtrs(saved));
});

exports.updateInstallmentTimeline = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.paymentId).populate('student', 'name applicationStatus');
  if (!payment) { const e = new Error('Payment record not found'); e.status = 404; throw e; }
  if (!payment.student || payment.student.applicationStatus === 'Draft') {
    const e = new Error('Installment timeline can be changed after application submission'); e.status = 400; throw e;
  }

  const rows = normalizeInstallments(req.body.timeline || req.body.installments || []);
  if (!rows || rows.length === 0) {
    const e = new Error('Add at least one installment row'); e.status = 400; throw e;
  }
  if (rows.some(row => !row.paymentDate || Number.isNaN(new Date(row.paymentDate).getTime()))) {
    const e = new Error('Payment date is required for every installment row'); e.status = 400; throw e;
  }

  const netFee = Math.max(0, Number(payment.netFee || ((payment.totalFee || 0) - (payment.discount || 0))));
  const total = rows.reduce((sum, row) => sum + (Number(row.amount || 0) || 0), 0);
  if (netFee > 0 && total !== netFee) {
    const e = new Error(`Installment total must match net fee. Net fee is ₹${netFee.toLocaleString('en-IN')}, installment total is ₹${total.toLocaleString('en-IN')}`);
    e.status = 400;
    throw e;
  }

  payment.installments = rows;
  await payment.save();
  await notifyRole('PaymentCoordinator', {
    message: `Installment timeline updated for ${payment.student.name}`,
    type: 'installment_updated',
    role: 'PaymentCoordinator',
    studentId: payment.student._id,
  });
  await audit('payment_installment_timeline_updated', 'Payment', payment._id, req.user, { rows: rows.length, netFee }, 'Installment timeline updated');
  const saved = await Payment.findById(payment._id)
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role');
  res.json(await enrichPaymentDuplicateUtrs(saved));
});

exports.markInstallmentPaid = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.paymentId).populate('student', 'name counselor center');
  if (!payment) { const e = new Error('Payment record not found'); e.status = 404; throw e; }
  const inst = payment.installments.id(req.params.installmentId) || payment.dueTimeline.id(req.params.installmentId);
  if (!inst) { const e = new Error('Installment not found'); e.status = 404; throw e; }

  const amount = Number(req.body.amount || Math.max(0, (inst.amount || 0) - (inst.paidAmount || 0)));
  if (!amount || amount <= 0) { const e = new Error('Amount must be positive'); e.status = 400; throw e; }
  const needsVerification = req.user.role === 'PaymentCoordinator';

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
    installmentRef: inst._id,
    verificationStatus: needsVerification ? 'pending_counselor' : 'verified',
    verifiedBy: needsVerification ? undefined : req.user._id,
    verifiedAt: needsVerification ? undefined : new Date(),
    paymentScreenshot: req.file ? `/uploads/${req.file.filename}` : '',
  });
  await payment.save();
  if (needsVerification) {
    const counselorUser = await User.findOne({ counselorId: payment.student?.counselor, isActive: true });
    if (counselorUser) {
      await notify(counselorUser._id, {
        message: `Fee payment of ₹${amount} submitted by payment coordinator for ${payment.student?.name} - please verify and forward to accountant`,
        type: 'payment_verified',
        role: 'Counselor',
        studentId: payment.student?._id,
      });
    } else {
      await notifyRole('Counselor', {
        message: `Fee payment of ₹${amount} submitted by payment coordinator for ${payment.student?.name} - please verify and forward to accountant`,
        type: 'payment_verified',
        role: 'Counselor',
        studentId: payment.student?._id,
      });
    }
  }
  await audit('installment_paid', 'Payment', payment._id, req.user, { installmentId: inst._id, amount, verificationStatus: needsVerification ? 'pending_counselor' : 'verified' }, `Installment payment recorded`);
  const saved = await Payment.findById(payment._id)
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role');
  res.json(await enrichPaymentDuplicateUtrs(saved));
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
  const saved = await Payment.findById(payment._id)
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role');
  res.status(201).json(await enrichPaymentDuplicateUtrs(saved));
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
  const saved = await Payment.findById(payment._id)
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role');
  res.json(await enrichPaymentDuplicateUtrs(saved));
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
  const saved = await Payment.findById(payment._id)
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role');
  res.json(await enrichPaymentDuplicateUtrs(saved));
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
  const saved = await Payment.findById(payment._id)
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role');
  res.json(await enrichPaymentDuplicateUtrs(saved));
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
  const saved = await Payment.findById(payment._id)
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role');
  res.json(await enrichPaymentDuplicateUtrs(saved));
});

const asyncHandler = require('express-async-handler');
const Center = require('../models/Center');
const Student = require('../models/Student');
const Payment = require('../models/Payment');

function feeTransactions(payment = {}) {
  return (payment.transactions || [])
    .filter(tx => (tx.type || 'Fee') === 'Fee' && !tx.documentRef && tx.verificationStatus === 'verified')
    .sort((a, b) => new Date(a.paidAt || a.createdAt || 0) - new Date(b.paidAt || b.createdAt || 0));
}

function summarizePayment(payment = {}) {
  const totalFee = Number(payment.totalFee || 0);
  const discount = Number(payment.discount || 0);
  const netFee = Math.max(0, totalFee - discount);
  const transactions = feeTransactions(payment);
  const paidAmount = transactions
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  return {
    totalFee,
    discount,
    netFee,
    paidAmount,
    dueAmount: Math.max(0, netFee - paidAmount),
    transactionCount: transactions.length,
  };
}

function submittedAt(student = {}) {
  const submitted = (student.statusHistory || [])
    .filter(row => row.status === 'Submitted' && row.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at))[0];
  return submitted?.at || null;
}

exports.centers = asyncHandler(async (_req, res) => {
  const centers = await Center.find().sort('name organisationName').lean();
  const centerIds = centers.map(center => center._id);

  const [studentCounts, payments] = await Promise.all([
    Student.aggregate([
      { $match: { center: { $in: centerIds } } },
      { $group: { _id: '$center', students: { $sum: 1 } } },
    ]),
    Payment.find({ center: { $in: centerIds } })
      .select('center totalFee discount transactions')
      .lean(),
  ]);

  const countByCenter = new Map(studentCounts.map(row => [String(row._id), row.students]));
  const totalsByCenter = new Map();

  payments.forEach(payment => {
    const key = String(payment.center);
    const current = totalsByCenter.get(key) || { totalAmount: 0, paidAmount: 0, dueAmount: 0 };
    const summary = summarizePayment(payment);
    current.totalAmount += summary.netFee;
    current.paidAmount += summary.paidAmount;
    current.dueAmount += summary.dueAmount;
    totalsByCenter.set(key, current);
  });

  res.json(centers.map(center => ({
    ...center,
    studentCount: countByCenter.get(String(center._id)) || 0,
    ...(totalsByCenter.get(String(center._id)) || { totalAmount: 0, paidAmount: 0, dueAmount: 0 }),
  })));
});

exports.centerStudents = asyncHandler(async (req, res) => {
  const center = await Center.findById(req.params.centerId).lean();
  if (!center) {
    const e = new Error('Center not found');
    e.status = 404;
    throw e;
  }

  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.max(0, Math.min(500, Number(req.query.limit || 0)));
  const skip = limit ? (page - 1) * limit : 0;
  const studentQuery = Student.find({ center: center._id })
    .populate('university', 'name shortName')
    .sort('name');

  if (limit) studentQuery.skip(skip).limit(limit);

  const [students, totalStudents] = await Promise.all([
    studentQuery.lean(),
    limit ? Student.countDocuments({ center: center._id }) : Promise.resolve(null),
  ]);

  const payments = await Payment.find({ student: { $in: students.map(student => student._id) } })
    .populate('transactions.recordedBy', 'name role')
    .populate('transactions.verifiedBy', 'name role')
    .populate('transactions.paidToAccount', 'label mode upiId upiName bankName accountHolder accountNumber ifscCode branch')
    .lean();

  const paymentByStudent = new Map(payments.map(payment => [String(payment.student), payment]));
  const rows = students.map(student => {
    const payment = paymentByStudent.get(String(student._id)) || {};
    const summary = summarizePayment(payment);
    const transactions = feeTransactions(payment).map(tx => ({
      _id: tx._id,
      amount: tx.amount || 0,
      mode: tx.mode || '',
      utrRef: tx.utrRef || '',
      upiId: tx.upiId || '',
      bankName: tx.bankName || '',
      accountHolder: tx.accountHolder || '',
      accountNumber: tx.accountNumber || '',
      ifscCode: tx.ifscCode || '',
      paidAt: tx.paidAt,
      recordAddedAt: tx.createdAt,
      verifiedAt: tx.verifiedAt,
      verificationStatus: tx.verificationStatus || 'not_required',
      paidToAccountLabel: tx.paidToAccountLabel || tx.paidToAccount?.label || '',
      paidToAccount: tx.paidToAccount || null,
    }));

    return {
      student: {
        _id: student._id,
        name: student.name,
        enrollmentNumber: student.enrollmentNumber || '',
        phone: student.phone || '',
        courseName: student.courseName || '',
        courseYear: student.courseYear || '',
        applicationStatus: student.applicationStatus || '',
        universityName: student.university?.name || student.universityName || '',
        createdAt: student.createdAt,
        submittedAt: submittedAt(student),
      },
      totalAmount: summary.netFee,
      amountPaid: summary.paidAmount,
      amountDue: summary.dueAmount,
      transactions,
    };
  });

  const totals = rows.reduce((acc, row) => ({
    totalAmount: acc.totalAmount + row.totalAmount,
    amountPaid: acc.amountPaid + row.amountPaid,
    amountDue: acc.amountDue + row.amountDue,
  }), { totalAmount: 0, amountPaid: 0, amountDue: 0 });

  res.json({
    center,
    rows,
    totals,
    maxTransactions: Math.max(0, ...rows.map(row => row.transactions.length)),
    page: limit ? page : 1,
    limit,
    totalStudents: limit ? totalStudents : rows.length,
    partial: Boolean(limit),
  });
});

const asyncHandler = require('express-async-handler');
const Center = require('../models/Center');
const Student = require('../models/Student');
const Payment = require('../models/Payment');
const Counselor = require('../models/Counselor');
const StudentDocument = require('../models/StudentDocument');

async function assignedCenterFilter(req) {
  if (!['Counselor', 'ViewerCounselor'].includes(req.user?.role)) return {};
  const counselor = await Counselor.findById(req.user.counselorId).select('centers').lean();
  return { _id: { $in: counselor?.centers || [] } };
}

async function assertLedgerCenterAccess(req, centerId) {
  if (!['Counselor', 'ViewerCounselor'].includes(req.user?.role)) return;
  const counselor = await Counselor.findById(req.user.counselorId).select('centers').lean();
  const allowed = (counselor?.centers || []).some(id => String(id) === String(centerId));
  if (!allowed) {
    const e = new Error('Forbidden');
    e.status = 403;
    throw e;
  }
}

// ── Course fee (admission) side ─────────────────────────────────
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

// ── Document charges side ──────────────────────────────────────
// Every request-origin document carries its own chargeFee + its own payments[].
// We surface those as a parallel-but-separate ledger so course fee numbers are
// never mixed with document numbers.
function isLedgerDocument(doc = {}) {
  return doc.origin !== 'Inventory';
}

function summarizeDocuments(docs = []) {
  let docTotalAmount = 0;
  let docAmountPaid = 0;
  const docTransactions = [];
  const documents = [];

  docs.filter(isLedgerDocument).forEach(doc => {
    const chargeFee = Number(doc.chargeFee || 0);
    docTotalAmount += chargeFee;

    let docPaid = 0;
    const docPayments = (doc.payments || []).map(payment => {
      const amount = Number(payment.amount || 0);
      const verified = Boolean(payment.verified);
      if (verified) {
        docAmountPaid += amount;
        docPaid += amount;
      }
      const record = {
        _id: payment._id,
        documentId: doc._id,
        documentName: doc.name || '',
        requestType: doc.requestType || 'Soft Copy',
        documentStatus: doc.status || '',
        amount,
        mode: payment.mode || '',
        utrRef: payment.utrRef || '',
        upiId: payment.upiId || '',
        bankName: payment.bankName || '',
        accountHolder: payment.accountHolder || '',
        accountNumber: payment.accountNumber || '',
        ifscCode: payment.ifscCode || '',
        note: payment.note || '',
        paidAt: payment.paidAt || null,
        recordAddedAt: payment.createdAt || null,
        verifiedAt: payment.verifiedAt || null,
        verified,
        status: verified ? 'verified' : 'pending',
        paidToAccountLabel: payment.paidToAccountLabel || payment.paidToAccount?.label || '',
        paidToAccount: payment.paidToAccount || null,
      };
      docTransactions.push(record);
      return record;
    });

    documents.push({
      _id: doc._id,
      name: doc.name || '',
      requestType: doc.requestType || 'Soft Copy',
      status: doc.status || '',
      chargeFee,
      paidAmount: docPaid,
      dueAmount: Math.max(0, chargeFee - docPaid),
      payments: docPayments,
    });
  });

  docTransactions.sort((a, b) => new Date(a.paidAt || 0) - new Date(b.paidAt || 0));
  documents.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return {
    docTotalAmount,
    docAmountPaid,
    docAmountDue: Math.max(0, docTotalAmount - docAmountPaid),
    docTransactionCount: docTransactions.length,
    docTransactions,
    documents,
  };
}

function submittedAt(student = {}) {
  const submitted = (student.statusHistory || [])
    .filter(row => row.status === 'Submitted' && row.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at))[0];
  return submitted?.at || null;
}

async function buildRows(students) {
  const studentIds = students.map(student => student._id);
  const [payments, documents] = await Promise.all([
    Payment.find({ student: { $in: studentIds } })
      .populate('transactions.recordedBy', 'name role')
      .populate('transactions.verifiedBy', 'name role')
      .populate('transactions.paidToAccount', 'label mode upiId upiName bankName accountHolder accountNumber ifscCode branch')
      .lean(),
    StudentDocument.find({ student: { $in: studentIds }, origin: { $ne: 'Inventory' } })
      .select('student name requestType status chargeFee payments createdAt')
      .populate('payments.paidToAccount', 'label mode upiId upiName bankName accountHolder accountNumber ifscCode branch')
      .lean(),
  ]);

  const paymentByStudent = new Map(payments.map(payment => [String(payment.student), payment]));
  const documentsByStudent = new Map();
  documents.forEach(doc => {
    const key = String(doc.student);
    if (!documentsByStudent.has(key)) documentsByStudent.set(key, []);
    documentsByStudent.get(key).push(doc);
  });

  return students.map(student => {
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

    const docSummary = summarizeDocuments(documentsByStudent.get(String(student._id)) || []);

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
      // Course fee ledger
      totalAmount: summary.netFee,
      amountPaid: summary.paidAmount,
      amountDue: summary.dueAmount,
      transactions,
      // Document charges ledger (kept separate)
      docTotalAmount: docSummary.docTotalAmount,
      docAmountPaid: docSummary.docAmountPaid,
      docAmountDue: docSummary.docAmountDue,
      docTransactions: docSummary.docTransactions,
      documents: docSummary.documents,
      // Combined view helper
      grandTotalAmount: summary.netFee + docSummary.docTotalAmount,
      grandAmountPaid: summary.paidAmount + docSummary.docAmountPaid,
      grandAmountDue: summary.dueAmount + docSummary.docAmountDue,
    };
  });
}

function totalsFor(rows) {
  return rows.reduce((acc, row) => ({
    totalAmount: acc.totalAmount + Number(row.totalAmount || 0),
    amountPaid: acc.amountPaid + Number(row.amountPaid || 0),
    amountDue: acc.amountDue + Number(row.amountDue || 0),
    docTotalAmount: acc.docTotalAmount + Number(row.docTotalAmount || 0),
    docAmountPaid: acc.docAmountPaid + Number(row.docAmountPaid || 0),
    docAmountDue: acc.docAmountDue + Number(row.docAmountDue || 0),
    grandTotalAmount: acc.grandTotalAmount + Number(row.grandTotalAmount || 0),
    grandAmountPaid: acc.grandAmountPaid + Number(row.grandAmountPaid || 0),
    grandAmountDue: acc.grandAmountDue + Number(row.grandAmountDue || 0),
  }), {
    totalAmount: 0, amountPaid: 0, amountDue: 0,
    docTotalAmount: 0, docAmountPaid: 0, docAmountDue: 0,
    grandTotalAmount: 0, grandAmountPaid: 0, grandAmountDue: 0,
  });
}

function maxCounts(rows) {
  return {
    maxTransactions: Math.max(0, ...rows.map(row => row.transactions.length)),
    maxDocTransactions: Math.max(0, ...rows.map(row => row.docTransactions.length)),
  };
}

exports.centers = asyncHandler(async (req, res) => {
  const centers = await Center.find(await assignedCenterFilter(req)).sort('name organisationName').lean();
  const centerIds = centers.map(center => center._id);

  const [studentCounts, payments, documents] = await Promise.all([
    Student.aggregate([
      { $match: { center: { $in: centerIds } } },
      { $group: { _id: '$center', students: { $sum: 1 } } },
    ]),
    Payment.find({ center: { $in: centerIds } })
      .select('center totalFee discount transactions')
      .lean(),
    StudentDocument.find({ center: { $in: centerIds }, origin: { $ne: 'Inventory' } })
      .select('center chargeFee payments status origin')
      .lean(),
  ]);

  const countByCenter = new Map(studentCounts.map(row => [String(row._id), row.students]));
  const totalsByCenter = new Map();

  const ensure = key => {
    if (!totalsByCenter.has(key)) {
      totalsByCenter.set(key, {
        totalAmount: 0, paidAmount: 0, dueAmount: 0,
        docTotalAmount: 0, docPaidAmount: 0, docDueAmount: 0,
      });
    }
    return totalsByCenter.get(key);
  };

  payments.forEach(payment => {
    const current = ensure(String(payment.center));
    const summary = summarizePayment(payment);
    current.totalAmount += summary.netFee;
    current.paidAmount += summary.paidAmount;
    current.dueAmount += summary.dueAmount;
  });

  documents.forEach(doc => {
    const current = ensure(String(doc.center));
    const summary = summarizeDocuments([doc]);
    current.docTotalAmount += summary.docTotalAmount;
    current.docPaidAmount += summary.docAmountPaid;
    current.docDueAmount += summary.docAmountDue;
  });

  res.json(centers.map(center => {
    const totals = totalsByCenter.get(String(center._id)) || {
      totalAmount: 0, paidAmount: 0, dueAmount: 0,
      docTotalAmount: 0, docPaidAmount: 0, docDueAmount: 0,
    };
    return {
      ...center,
      studentCount: countByCenter.get(String(center._id)) || 0,
      ...totals,
      grandTotalAmount: totals.totalAmount + totals.docTotalAmount,
      grandPaidAmount: totals.paidAmount + totals.docPaidAmount,
      grandDueAmount: totals.dueAmount + totals.docDueAmount,
    };
  }));
});

exports.centerStudents = asyncHandler(async (req, res) => {
  await assertLedgerCenterAccess(req, req.params.centerId);
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

  const rows = await buildRows(students);
  const totals = totalsFor(rows);
  const counts = maxCounts(rows);

  res.json({
    center,
    rows,
    totals,
    ...counts,
    page: limit ? page : 1,
    limit,
    totalStudents: limit ? totalStudents : rows.length,
    partial: Boolean(limit),
  });
});

exports.students = asyncHandler(async (req, res) => {
  const centerFilter = await assignedCenterFilter(req);
  const allowedCenters = centerFilter._id?.$in || null;
  const filter = allowedCenters ? { center: { $in: allowedCenters } } : {};
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.max(0, Math.min(500, Number(req.query.limit || 0)));
  const skip = limit ? (page - 1) * limit : 0;
  const studentQuery = Student.find(filter)
    .populate('university', 'name shortName')
    .sort('name');

  if (limit) studentQuery.skip(skip).limit(limit);

  const [students, totalStudents] = await Promise.all([
    studentQuery.lean(),
    limit ? Student.countDocuments(filter) : Promise.resolve(null),
  ]);

  const rows = await buildRows(students);
  const counts = maxCounts(rows);

  res.json({
    rows,
    totals: totalsFor(rows),
    ...counts,
    page: limit ? page : 1,
    limit,
    totalStudents: limit ? totalStudents : rows.length,
    partial: Boolean(limit),
  });
});

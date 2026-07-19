const Payment = require('../models/Payment');
const StudentDocument = require('../models/StudentDocument');

function normalizeUtr(value) {
  return String(value || '').trim().toUpperCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sameUtr(a, b) {
  return normalizeUtr(a) === normalizeUtr(b);
}

function sourceLabel(type) {
  return type === 'Document' ? 'Document Payment' : 'Fee Payment';
}

async function findDuplicateUtrMatches(utrRef, exclude = {}) {
  const normalized = normalizeUtr(utrRef);
  if (!normalized) return [];

  const exact = new RegExp(`^${escapeRegex(normalized)}$`, 'i');
  const [payments, docs] = await Promise.all([
    Payment.find({ 'transactions.utrRef': exact })
      .populate('student', 'name courseName enrollmentNumber')
      .populate('center', 'name organisationName')
      .lean(),
    StudentDocument.find({ 'payments.utrRef': exact })
      .populate('student', 'name courseName enrollmentNumber')
      .populate('center', 'name organisationName')
      .lean(),
  ]);

  const matches = [];

  for (const payment of payments) {
    for (const tx of payment.transactions || []) {
      if (!sameUtr(tx.utrRef, normalized)) continue;
      if (exclude.paymentId && String(payment._id) === String(exclude.paymentId)
        && exclude.txId && String(tx._id) === String(exclude.txId)) continue;
      matches.push({
        source: sourceLabel(tx.type),
        studentId: payment.student?._id,
        studentName: payment.student?.name || 'Unknown student',
        centerName: payment.center?.name || payment.center?.organisationName || '',
        courseName: payment.student?.courseName || '',
        enrollmentNumber: payment.student?.enrollmentNumber || '',
        amount: tx.amount || 0,
        paidAt: tx.paidAt,
        status: tx.verificationStatus || '',
        paymentId: payment._id,
        transactionId: tx._id,
      });
    }
  }

  for (const doc of docs) {
    for (const pay of doc.payments || []) {
      if (!sameUtr(pay.utrRef, normalized)) continue;
      if (exclude.documentId && String(doc._id) === String(exclude.documentId)
        && exclude.docPaymentId && String(pay._id) === String(exclude.docPaymentId)) continue;
      matches.push({
        source: 'Document Payment',
        studentId: doc.student?._id,
        studentName: doc.student?.name || 'Unknown student',
        centerName: doc.center?.name || doc.center?.organisationName || '',
        courseName: doc.student?.courseName || '',
        enrollmentNumber: doc.student?.enrollmentNumber || '',
        documentId: doc._id,
        documentName: doc.name,
        amount: pay.amount || 0,
        paidAt: pay.paidAt,
        status: pay.verified ? 'verified' : doc.status || '',
        transactionId: pay._id,
      });
    }
  }

  return matches;
}

async function enrichPaymentDuplicateUtrs(payment) {
  if (!payment) return null;
  const obj = typeof payment.toObject === 'function' ? payment.toObject() : { ...payment };
  const txs = obj.transactions || [];
  // Only check duplicates for transactions still under review — verified/old ones don't need re-checking on every fetch
  const checkable = txs.filter(tx => ['pending_counselor','pending_accountant','rejected'].includes(tx.verificationStatus) && tx.utrRef);
  await Promise.all(checkable.map(async tx => {
    const matches = await findDuplicateUtrMatches(tx.utrRef, { paymentId: obj._id, txId: tx._id });
    tx.duplicateUtrMatches = matches;
    tx.utrDuplicate = matches.length > 0;
  }));
  return obj;
}

async function enrichDocumentDuplicateUtrs(doc) {
  if (!doc) return null;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const pays = obj.payments || [];
  const checkable = pays.filter(pay => !pay.verified && pay.utrRef);
  await Promise.all(checkable.map(async pay => {
    const matches = await findDuplicateUtrMatches(pay.utrRef, { documentId: obj._id, docPaymentId: pay._id });
    pay.duplicateUtrMatches = matches;
    pay.utrDuplicate = matches.length > 0;
  }));
  return obj;
}

async function enrichDocumentDuplicateUtrs(doc) {
  if (!doc) return null;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  for (const pay of obj.payments || []) {
    const matches = await findDuplicateUtrMatches(pay.utrRef, {
      documentId: obj._id,
      docPaymentId: pay._id,
    });
    pay.duplicateUtrMatches = matches;
    pay.utrDuplicate = matches.length > 0;
  }
  return obj;
}

module.exports = {
  findDuplicateUtrMatches,
  enrichPaymentDuplicateUtrs,
  enrichDocumentDuplicateUtrs,
  normalizeUtr,
};

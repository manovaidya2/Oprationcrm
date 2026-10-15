// ============================================================
// controllers/accountsSettlement.controller.js
// Payment Desk — "Payment adjustment" = a settlement.
//
// One payment (one UTR, one screenshot) that a centre sends for many students is spread across
// those students' fees. It is the same CenterSettlement record Centre Billing creates, so it shows
// there too and can be reversed there. Several students sharing a UTR is expected.
// ============================================================
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Center           = require('../models/Center');
const Student          = require('../models/Student');
const Payment          = require('../models/Payment');
const PaymentAccount   = require('../models/PaymentAccount');
const CenterSettlement = require('../models/CenterSettlement');
const User             = require('../models/User');
const { audit, notify } = require('../utils/helpers');
const { EPS, COUNTED, fail, r2, num, isId, esc } = require('../utils/accountsUtil');

const EXCLUDED = ['Draft', 'Cancelled', 'Rejected'];
const SOURCE = 'Center Monthly Settlement';
const netFee = p => Math.max(0, r2((p?.totalFee || 0) - (p?.discount || 0)));
const paidOf = p => r2((p?.transactions || [])
  .filter(t => (t.type || 'Fee') === 'Fee' && COUNTED.includes(t.verificationStatus || 'not_required'))
  .reduce((s, t) => s + (t.amount || 0), 0));
const monthOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const centerName = c => c?.name || c?.organisationName || '';

function parseAllocations(raw) {
  let list = raw;
  if (typeof raw === 'string') { try { list = JSON.parse(raw); } catch { throw fail('Allocations could not be read'); } }
  if (!Array.isArray(list)) throw fail('Select at least one student');
  const seen = new Set();
  return list.map(a => {
    if (!isId(a.studentId)) throw fail('Invalid student in the list');
    if (seen.has(String(a.studentId))) throw fail('A student is in the list twice');
    seen.add(String(a.studentId));
    const amount = r2(num(a.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw fail('Every selected student needs an amount above zero');
    return { studentId: String(a.studentId), amount };
  });
}

async function accountFor(id) {
  if (!id) return null;
  if (!isId(id)) throw fail('Invalid account');
  const acc = await PaymentAccount.findById(id).lean();
  if (!acc) throw fail('Account not found', 404);
  return acc;
}

const labelNote = note => `Course fee settled via centre payment${note ? ` - ${note}` : ''}`;

// GET /payment-desk/settlement/students?centerId=&search=&all=1
// A centre's students with their fee, paid and balance, for picking who the payment is for.
exports.students = asyncHandler(async (req, res) => {
  if (!isId(req.query.centerId)) throw fail('Choose a centre');
  const filter = { center: req.query.centerId, applicationStatus: { $nin: EXCLUDED } };
  const q = String(req.query.search || '').trim();
  if (q) { const rx = new RegExp(esc(q), 'i'); filter.$or = [{ name: rx }, { enrollmentNumber: rx }, { phone: rx }]; }
  const students = await Student.find(filter).select('name enrollmentNumber courseName courseYear applicationStatus createdAt')
    .sort('createdAt').limit(1500).lean();
  const payments = await Payment.find({ student: { $in: students.map(s => s._id) } }).select('student totalFee discount transactions').lean();
  const byStudent = new Map(payments.map(p => [String(p.student), p]));
  const rows = students.map(s => {
    const p = byStudent.get(String(s._id));
    const net = netFee(p), paid = paidOf(p);
    return {
      studentId: s._id, name: s.name, enrollmentNumber: s.enrollmentNumber || '', course: `${s.courseName || ''} ${s.courseYear || ''}`.trim(),
      applicationStatus: s.applicationStatus, createdAt: s.createdAt, netFee: net, paid, due: Math.max(0, r2(net - paid)),
      pendingCount: (p?.transactions || []).filter(t => (t.type || 'Fee') === 'Fee' && ['pending_counselor', 'pending_accountant'].includes(t.verificationStatus)).length,
    };
  }).filter(r => req.query.all === '1' || r.due > EPS);
  res.json(rows);
});

// POST /payment-desk/settlements   (multipart: optional paymentScreenshot)
exports.create = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!isId(b.centerId)) throw fail('Choose a centre');
  const center = await Center.findById(b.centerId).select('name organisationName').lean();
  if (!center) throw fail('Centre not found', 404);
  const wanted = parseAllocations(b.allocations);
  if (!wanted.length) throw fail('Select at least one student');
  const mode = b.mode === 'Bank Transfer' ? 'Bank Transfer' : b.mode === 'UPI' ? 'UPI' : null;
  if (!mode) throw fail('Select a payment mode');
  const utrRef = String(b.utrRef || '').trim();
  if (!utrRef) throw fail('UTR / reference number is required');
  const paidAt = b.paidAt ? new Date(b.paidAt) : null;
  if (!paidAt || Number.isNaN(paidAt.getTime())) throw fail('Enter a valid payment date');
  const acc = await accountFor(b.accountId);
  const note = String(b.note || '').trim();
  const shot = req.file ? `/uploads/${req.file.filename}` : '';

  const session = await mongoose.startSession();
  let savedId;
  try {
    await session.withTransaction(async () => {
      // everything is re-read and re-checked inside the transaction (it may be retried)
      const students = await Student.find({ _id: { $in: wanted.map(w => w.studentId) }, center: center._id }).select('name applicationStatus').session(session).lean();
      if (students.length !== wanted.length) throw fail('One or more students do not belong to this centre');
      const nameOf = new Map(students.map(s => [String(s._id), s]));
      const payments = await Payment.find({ student: { $in: students.map(s => s._id) } }).session(session);
      const byStudent = new Map(payments.map(p => [String(p.student), p]));

      const settlement = new CenterSettlement({
        center: center._id, billingMonth: monthOf(paidAt), dateBasis: 'createdAt', amount: 0, studentCount: 1, mode, utrRef,
        upiId: acc?.upiId || '', bankName: acc?.bankName || '', accountHolder: acc?.accountHolder || '',
        accountNumber: acc?.accountNumber || '', ifscCode: acc?.ifscCode || '',
        paidAt, note, paidToAccount: acc?._id, paidToAccountLabel: acc?.label || '', recordedBy: req.user._id,
        via: 'Payment Desk', paymentScreenshot: shot,
      });
      let total = 0;
      for (const w of wanted) {
        const student = nameOf.get(w.studentId);
        if (EXCLUDED.includes(student.applicationStatus)) throw fail(`${student.name} is ${student.applicationStatus} and cannot be adjusted`);
        const payment = byStudent.get(w.studentId);
        if (!payment || netFee(payment) <= 0) throw fail(`Set the fee for ${student.name} before adjusting`);
        const due = Math.max(0, r2(netFee(payment) - paidOf(payment)));
        if (w.amount > due + EPS) throw fail(`${student.name}: ₹${w.amount} is more than the balance due of ₹${due}`);
        payment.transactions.push({
          amount: w.amount, mode, utrRef, upiId: settlement.upiId, bankName: settlement.bankName, accountHolder: settlement.accountHolder,
          accountNumber: settlement.accountNumber, ifscCode: settlement.ifscCode, note: labelNote(note), paidAt,
          recordedBy: req.user._id, verifiedBy: req.user._id, verifiedAt: new Date(), type: 'Fee', verificationStatus: 'verified',
          paidToAccount: acc?._id, paidToAccountLabel: acc?.label || '', paymentScreenshot: shot,
          source: SOURCE, centerSettlement: settlement._id, settlementMonth: settlement.billingMonth,
        });
        payment.lastUpdatedBy = req.user._id;
        payment.lastUpdatedAt = new Date();
        await payment.save({ session });
        settlement.allocations.push({ student: student._id, payment: payment._id, transactionId: payment.transactions[payment.transactions.length - 1]._id, totalFee: payment.netFee, amount: w.amount });
        total = r2(total + w.amount);
      }
      settlement.amount = total;
      settlement.studentCount = settlement.allocations.length;
      await settlement.save({ session });
      savedId = settlement._id;
    });
  } finally { await session.endSession(); }

  const saved = await CenterSettlement.findById(savedId).lean();
  await audit('payment_desk_settlement_created', 'CenterSettlement', saved._id, req.user,
    { centerId: center._id, utrRef, amount: saved.amount, students: saved.studentCount, screenshot: !!shot },
    `${centerName(center)}: payment adjustment ₹${saved.amount} (${utrRef}) applied to ${saved.studentCount} student${saved.studentCount === 1 ? '' : 's'}`);
  const centreUsers = await User.find({ role: 'Center', centerId: center._id, isActive: true }).select('_id').lean();
  await notify(centreUsers.map(u => u._id), { message: `Your payment of ₹${saved.amount} (${utrRef}) was applied to ${saved.studentCount} student fee record${saved.studentCount === 1 ? '' : 's'}.`, type: 'payment_verified', role: 'Center' });
  res.status(201).json(saved);
});

// GET /payment-desk/settlements/:id
exports.get = asyncHandler(async (req, res) => {
  const s = await CenterSettlement.findById(req.params.id)
    .populate('center', 'name organisationName').populate('recordedBy', 'name')
    .populate('allocations.student', 'name enrollmentNumber courseName courseYear').lean();
  if (!s) throw fail('Settlement not found', 404);
  res.json(s);
});

// PATCH /payment-desk/settlements/:id   (multipart: optional paymentScreenshot)
// Changes the shared payment details on the settlement AND on every student's payment that came from it.
exports.update = asyncHandler(async (req, res) => {
  const b = req.body;
  const reason = String(b.reason || '').trim() || 'Edited from Payment Desk';
  const settlement = await CenterSettlement.findById(req.params.id);
  if (!settlement) throw fail('Settlement not found', 404);
  if (settlement.status === 'Reversed') throw fail('A reversed settlement cannot be edited');

  const changes = [];
  const next = {};
  if (b.utrRef !== undefined) { const v = String(b.utrRef).trim(); if (!v) throw fail('UTR / reference cannot be empty'); if (v !== (settlement.utrRef || '')) { next.utrRef = v; changes.push({ field: 'utrRef', before: settlement.utrRef, after: v }); } }
  if (b.paidAt !== undefined) { const d = new Date(b.paidAt); if (Number.isNaN(d.getTime())) throw fail('Enter a valid date'); if (d.toISOString().slice(0, 10) !== new Date(settlement.paidAt).toISOString().slice(0, 10)) { next.paidAt = d; changes.push({ field: 'paidAt', before: settlement.paidAt, after: d }); } }
  if (b.mode !== undefined) { if (!['UPI', 'Bank Transfer'].includes(b.mode)) throw fail('Select a valid payment mode'); if (b.mode !== settlement.mode) { next.mode = b.mode; changes.push({ field: 'mode', before: settlement.mode, after: b.mode }); } }
  if (b.note !== undefined && String(b.note).trim() !== (settlement.note || '')) { next.note = String(b.note).trim(); changes.push({ field: 'note', before: settlement.note || '', after: next.note }); }
  let acc;
  if (b.accountId !== undefined && String(b.accountId || '') !== String(settlement.paidToAccount || '')) {
    acc = await accountFor(b.accountId || null);
    next.account = true;
    changes.push({ field: 'account', before: settlement.paidToAccountLabel || '', after: acc?.label || '' });
  }
  if (req.file) { next.shot = `/uploads/${req.file.filename}`; changes.push({ field: 'screenshot', before: settlement.paymentScreenshot ? 'uploaded' : 'none', after: 'uploaded' }); }
  if (!changes.length) throw fail('Nothing was changed');

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const doc = await CenterSettlement.findById(req.params.id).session(session);
      if (!doc || doc.status !== 'Completed') throw fail('Settlement is not active');
      if (next.utrRef !== undefined) doc.utrRef = next.utrRef;
      if (next.paidAt) doc.paidAt = next.paidAt;
      if (next.mode) doc.mode = next.mode;
      if (next.note !== undefined) doc.note = next.note;
      if (next.account) {
        doc.paidToAccount = acc?._id; doc.paidToAccountLabel = acc?.label || '';
        if (acc) { doc.upiId = acc.upiId || ''; doc.bankName = acc.bankName || ''; doc.accountHolder = acc.accountHolder || ''; doc.accountNumber = acc.accountNumber || ''; doc.ifscCode = acc.ifscCode || ''; }
      }
      if (next.shot) doc.paymentScreenshot = next.shot;
      doc.lastEditedBy = req.user._id; doc.lastEditedAt = new Date(); doc.editReason = reason;

      const payments = await Payment.find({ _id: { $in: doc.allocations.map(a => a.payment) } }).session(session);
      for (const payment of payments) {
        let touched = false;
        for (const tx of payment.transactions) {
          if (String(tx.centerSettlement) !== String(doc._id)) continue;
          tx.utrRef = doc.utrRef; tx.paidAt = doc.paidAt; tx.mode = doc.mode; tx.note = labelNote(doc.note);
          tx.paidToAccount = doc.paidToAccount; tx.paidToAccountLabel = doc.paidToAccountLabel;
          tx.upiId = doc.upiId; tx.bankName = doc.bankName; tx.accountHolder = doc.accountHolder; tx.accountNumber = doc.accountNumber; tx.ifscCode = doc.ifscCode;
          if (doc.paymentScreenshot) tx.paymentScreenshot = doc.paymentScreenshot;
          tx.lastUpdatedBy = req.user._id; tx.lastUpdatedAt = new Date();
          touched = true;
        }
        if (touched) await payment.save({ session });
      }
      await doc.save({ session });
    });
  } finally { await session.endSession(); }

  await audit('payment_desk_settlement_edited', 'CenterSettlement', settlement._id, req.user, { reason, changes },
    `Payment adjustment ${settlement.utrRef} edited for ${settlement.studentCount} students: ${changes.map(c => `${c.field} ${c.before} → ${c.after}`).join('; ')} (${reason})`);
  res.json(await CenterSettlement.findById(settlement._id).lean());
});

// POST /payment-desk/settlements/:id/reverse   { reason }
// Takes the whole settlement back: every student's payment from it is removed and the balances come back.
exports.reverse = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || '').trim() || 'Reversed from Payment Desk';
  const first = await CenterSettlement.findById(req.params.id).select('status').lean();
  if (!first) throw fail('Settlement not found', 404);
  if (first.status === 'Reversed') throw fail('Settlement is already reversed');
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const doc = await CenterSettlement.findById(req.params.id).session(session);
      if (!doc || doc.status !== 'Completed') throw fail('Settlement is not active');
      const payments = await Payment.find({ _id: { $in: doc.allocations.map(a => a.payment) } }).session(session);
      for (const payment of payments) {
        payment.transactions = payment.transactions.filter(t => String(t.centerSettlement) !== String(doc._id));
        payment.lastUpdatedBy = req.user._id; payment.lastUpdatedAt = new Date();
        await payment.save({ session });
      }
      doc.status = 'Reversed'; doc.reversedBy = req.user._id; doc.reversedAt = new Date(); doc.reversalReason = reason;
      await doc.save({ session });
    });
  } finally { await session.endSession(); }
  await audit('payment_desk_settlement_reversed', 'CenterSettlement', req.params.id, req.user, { reason }, `Payment adjustment reversed: ${reason}`);
  res.json(await CenterSettlement.findById(req.params.id).lean());
});

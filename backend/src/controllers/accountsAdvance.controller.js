// ============================================================
// controllers/accountsAdvance.controller.js
// Payment Desk — Centre Advance: a running account of money centres paid in advance.
// Deposits raise the balance; adjusting a settlement or paying a student from it lowers the balance.
// Every movement is a row in the history. See models/CentreAdvance.js.
// ============================================================
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Center           = require('../models/Center');
const Student          = require('../models/Student');
const Payment          = require('../models/Payment');
const PaymentAccount   = require('../models/PaymentAccount');
const CentreAdvance    = require('../models/CentreAdvance');
const CenterSettlement = require('../models/CenterSettlement');
const User             = require('../models/User');
const { audit, notify } = require('../utils/helpers');
const { EPS, COUNTED, fail, r2, num, isId, esc, ist } = require('../utils/accountsUtil');

const ADV_SOURCE = 'Centre Advance';
const centreName = c => c?.name || c?.organisationName || '';
const netFee = p => Math.max(0, r2((p?.totalFee || 0) - (p?.discount || 0)));
const paidOf = p => r2((p?.transactions || [])
  .filter(t => (t.type || 'Fee') === 'Fee' && COUNTED.includes(t.verificationStatus || 'not_required'))
  .reduce((s, t) => s + (t.amount || 0), 0));

async function tellCentre(centerId, message) {
  const users = await User.find({ role: 'Center', centerId, isActive: true }).select('_id').lean();
  if (users.length) await notify(users.map(u => u._id), { message, type: 'payment_verified', role: 'Center' });
}

// GET /payment-desk/advance?search=&centerId=   every centre with its advance balance
exports.summary = asyncHandler(async (req, res) => {
  const cf = {};
  if (isId(req.query.centerId)) cf._id = req.query.centerId;
  const q = String(req.query.search || '').trim();
  if (q) { const rx = new RegExp(esc(q), 'i'); cf.$or = [{ name: rx }, { organisationName: rx }, { city: rx }]; }
  const [centres, rows] = await Promise.all([
    Center.find(cf).select('name organisationName city').sort('name').lean(),
    CentreAdvance.aggregate([
      { $match: { status: 'Active' } },
      { $group: { _id: { c: '$center', k: '$kind' }, total: { $sum: '$amount' }, last: { $max: '$date' } } },
    ]),
  ]);
  const by = new Map();
  rows.forEach(r => {
    const k = String(r._id.c);
    const e = by.get(k) || { deposited: 0, used: 0, last: null };
    if (r._id.k === 'Deposit') e.deposited = r2(e.deposited + r.total); else e.used = r2(e.used + r.total);
    if (!e.last || r.last > e.last) e.last = r.last;
    by.set(k, e);
  });
  const list = centres.map(c => {
    const e = by.get(String(c._id)) || { deposited: 0, used: 0, last: null };
    return { centerId: c._id, name: centreName(c), city: c.city || '', deposited: e.deposited, used: e.used, balance: r2(e.deposited - e.used), lastActivity: e.last };
  });
  list.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
  res.json({ centres: list, totals: { deposited: r2(list.reduce((s, x) => s + x.deposited, 0)), used: r2(list.reduce((s, x) => s + x.used, 0)), balance: r2(list.reduce((s, x) => s + x.balance, 0)) } });
});

// GET /payment-desk/advance/:centerId/history
exports.history = asyncHandler(async (req, res) => {
  if (!isId(req.params.centerId)) throw fail('Invalid centre');
  const center = await Center.findById(req.params.centerId).select('name organisationName city').lean();
  if (!center) throw fail('Centre not found', 404);
  const entries = await CentreAdvance.find({ center: center._id })
    .populate('student', 'name enrollmentNumber').populate('recordedBy', 'name').populate('reversedBy', 'name')
    .populate('settlement', 'utrRef amount studentCount').sort('date createdAt').lean();
  let running = 0;
  const out = entries.map(e => {
    if (e.status === 'Active') running = r2(running + (e.kind === 'Deposit' ? e.amount : -e.amount));
    return {
      _id: e._id, kind: e.kind, status: e.status, amount: e.amount, date: e.date, createdAt: e.createdAt, balanceAfter: e.status === 'Active' ? running : null,
      mode: e.mode || '', utrRef: e.utrRef || '', accountName: e.accountLabel || '', screenshot: e.paymentScreenshot || '', note: e.note || '',
      student: e.student ? { _id: e.student._id, name: e.student.name, enrollmentNumber: e.student.enrollmentNumber || '' } : null,
      settlement: e.settlement ? { _id: e.settlement._id, utrRef: e.settlement.utrRef, amount: e.settlement.amount, studentCount: e.settlement.studentCount } : null,
      recordedBy: e.recordedBy?.name || '', reversedBy: e.reversedBy?.name || '', reversedAt: e.reversedAt || null, reversalReason: e.reversalReason || '',
    };
  });
  const deposited = r2(entries.filter(e => e.status === 'Active' && e.kind === 'Deposit').reduce((s, e) => s + e.amount, 0));
  const used = r2(entries.filter(e => e.status === 'Active' && e.kind === 'Used').reduce((s, e) => s + e.amount, 0));
  res.json({ center: { _id: center._id, name: centreName(center), city: center.city || '' }, deposited, used, balance: r2(deposited - used), entries: out.reverse() });
});

// POST /payment-desk/advance   (multipart: optional paymentScreenshot)   - a centre paid in advance
exports.deposit = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!isId(b.centerId)) throw fail('Choose a centre');
  const center = await Center.findById(b.centerId).select('name organisationName').lean();
  if (!center) throw fail('Centre not found', 404);
  const amount = r2(num(b.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw fail('Enter the amount received');
  const mode = b.mode === 'Bank Transfer' ? 'Bank Transfer' : b.mode === 'UPI' ? 'UPI' : null;
  if (!mode) throw fail('Select a payment mode');
  const utrRef = String(b.utrRef || '').trim();
  if (!utrRef) throw fail('UTR / reference number is required');
  const date = b.paidAt ? new Date(b.paidAt) : null;
  if (!date || Number.isNaN(date.getTime())) throw fail('Enter a valid payment date');
  let acc = null;
  if (b.accountId) { if (!isId(b.accountId)) throw fail('Invalid account'); acc = await PaymentAccount.findById(b.accountId).lean(); if (!acc) throw fail('Account not found', 404); }
  const entry = await CentreAdvance.create({
    center: center._id, kind: 'Deposit', amount, date, mode, utrRef, account: acc?._id, accountLabel: acc?.label || '',
    paymentScreenshot: req.file ? `/uploads/${req.file.filename}` : '', note: String(b.note || '').trim(), recordedBy: req.user._id,
  });
  const balance = await CentreAdvance.balanceOf(center._id);
  await audit('centre_advance_deposit', 'CentreAdvance', entry._id, req.user, { centerId: center._id, amount, utrRef }, `${centreName(center)}: advance of ₹${amount} received (${utrRef}). Balance ₹${balance}`);
  await tellCentre(center._id, `Your advance payment of ₹${amount} (${utrRef}) has been recorded. Advance balance: ₹${balance}.`);
  res.status(201).json({ entryId: entry._id, balance });
});

// POST /payment-desk/advance/pay   { studentId, amount, paidAt?, note? }   - pay one student's fee from the centre's advance
exports.payStudent = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!isId(b.studentId)) throw fail('Choose a student');
  const amount = r2(num(b.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw fail('Enter a valid amount');
  const date = b.paidAt ? new Date(b.paidAt) : new Date();
  if (Number.isNaN(date.getTime())) throw fail('Enter a valid date');
  const student = await Student.findById(b.studentId).select('name center applicationStatus').lean();
  if (!student) throw fail('Student not found', 404);
  if (['Draft', 'Cancelled', 'Rejected'].includes(student.applicationStatus)) throw fail(`${student.name} is ${student.applicationStatus}; a payment cannot be added`);
  const note = String(b.note || '').trim();

  const session = await mongoose.startSession();
  let balanceAfter, entryId;
  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOne({ student: student._id }).session(session);
      if (!payment || netFee(payment) <= 0) throw fail('This student has no fee set. Correct the fee first.');
      const due = Math.max(0, r2(netFee(payment) - paidOf(payment)));
      if (amount > due + EPS) throw fail(`Amount is more than the balance due of ₹${due}`);
      const balance = await CentreAdvance.balanceOf(student.center, session);
      if (amount > balance + EPS) throw fail(`The centre's advance balance is only ₹${balance}`);
      payment.transactions.push({
        amount, mode: 'Bank Transfer', utrRef: 'ADVANCE', note: note ? `Paid from centre advance - ${note}` : 'Paid from centre advance', paidAt: date,
        type: 'Fee', verificationStatus: 'verified', verificationNote: 'Paid from centre advance', recordedBy: req.user._id, verifiedBy: req.user._id, verifiedAt: new Date(),
        source: ADV_SOURCE, paidToAccountLabel: 'Centre advance',
      });
      payment.lastUpdatedBy = req.user._id; payment.lastUpdatedAt = new Date();
      await payment.save({ session });
      const [entry] = await CentreAdvance.create([{
        center: student.center, kind: 'Used', amount, date, student: student._id, payment: payment._id,
        transactionId: payment.transactions[payment.transactions.length - 1]._id, studentCount: 1, note, recordedBy: req.user._id,
      }], { session });
      entryId = entry._id; balanceAfter = r2(balance - amount);
    });
  } finally { await session.endSession(); }
  await audit('centre_advance_used', 'CentreAdvance', entryId, req.user, { studentId: student._id, amount }, `₹${amount} of the centre advance applied to ${student.name}. Balance ₹${balanceAfter}`);
  await tellCentre(student.center, `₹${amount} from your advance balance was applied to ${student.name}'s fee. Advance balance: ₹${balanceAfter}.`);
  res.status(201).json({ balance: balanceAfter });
});

// POST /payment-desk/advance/entries/:id/reverse   { reason }
// A wrong deposit can be taken back while the balance still covers it. A single-student use is undone here;
// a use inside a settlement is undone by reversing that settlement (which also gives the balance back).
exports.reverseEntry = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw fail('Invalid entry');
  const reason = String(req.body.reason || '').trim() || 'Reversed from Payment Desk';
  const first = await CentreAdvance.findById(req.params.id).lean();
  if (!first) throw fail('Entry not found', 404);
  if (first.status === 'Reversed') throw fail('This entry is already reversed');
  if (first.kind === 'Used' && first.settlement) throw fail('This was used in a settlement. Reverse that settlement (Day Book, the adjusted row) to give the balance back.');

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const e = await CentreAdvance.findById(req.params.id).session(session);
      if (!e || e.status !== 'Active') throw fail('This entry is no longer active');
      if (e.kind === 'Deposit') {
        const bal = await CentreAdvance.balanceOf(e.center, session);
        if (e.amount > bal + EPS) throw fail(`₹${r2(e.amount - bal)} of this deposit has already been used. Reverse those uses first (balance is ₹${bal}).`);
      } else {
        const payment = await Payment.findById(e.payment).session(session);
        if (payment) {
          payment.transactions = payment.transactions.filter(t => String(t._id) !== String(e.transactionId));
          payment.lastUpdatedBy = req.user._id; payment.lastUpdatedAt = new Date();
          await payment.save({ session });
        }
      }
      e.status = 'Reversed'; e.reversedBy = req.user._id; e.reversedAt = new Date(); e.reversalReason = reason;
      await e.save({ session });
    });
  } finally { await session.endSession(); }
  const balance = await CentreAdvance.balanceOf(first.center);
  await audit('centre_advance_reversed', 'CentreAdvance', first._id, req.user, { kind: first.kind, amount: first.amount, reason }, `Centre advance ${first.kind.toLowerCase()} of ₹${first.amount} reversed: ${reason}. Balance ₹${balance}`);
  res.json({ balance });
});

// GET /payment-desk/advance/export.csv?centerId=   (one centre's history, or every centre's balance)
exports.exportCsv = asyncHandler(async (req, res) => {
  const { sendCsv, stamp } = require('../utils/accountsUtil');
  if (isId(req.query.centerId)) {
    const entries = await CentreAdvance.find({ center: req.query.centerId }).populate('student', 'name').populate('settlement', 'utrRef studentCount').populate('recordedBy', 'name').sort('date createdAt').lean();
    let running = 0;
    const rows = entries.map(e => {
      if (e.status === 'Active') running = r2(running + (e.kind === 'Deposit' ? e.amount : -e.amount));
      return [ist(e.date), e.kind === 'Deposit' ? 'ADVANCE RECEIVED' : 'USED', e.kind === 'Deposit' ? e.amount : '', e.kind === 'Used' ? e.amount : '', e.status === 'Active' ? running : '',
        e.utrRef || e.settlement?.utrRef || '', e.accountLabel || '', e.student?.name || (e.settlement ? `Settlement of ${e.settlement.studentCount} students` : ''), e.note || '', e.status, e.recordedBy?.name || ''];
    });
    return sendCsv(res, `centre-advance-${stamp()}.csv`, [['DATE', 'TYPE', 'RECEIVED', 'USED', 'BALANCE', 'UTR', 'ACCOUNT', 'STUDENT / SETTLEMENT', 'NOTE', 'STATUS', 'ENTERED BY'], ...rows]);
  }
  const fake = { query: {}, user: req.user };
  let data;
  await exports.summary(fake, { json: d => { data = d; } }, e => { throw e; });
  sendCsv(res, `centre-advance-balances-${stamp()}.csv`, [['CENTRE', 'CITY', 'ADVANCE RECEIVED', 'USED', 'BALANCE', 'LAST ACTIVITY'], ...data.centres.map(c => [c.name, c.city, c.deposited, c.used, c.balance, ist(c.lastActivity)])]);
});

exports.ADV_SOURCE = ADV_SOURCE;

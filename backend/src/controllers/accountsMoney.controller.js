// ============================================================
// controllers/accountsMoney.controller.js
// Payment Desk — Bank Book / Cash Book, Income & Expenses, University Bill.
// ============================================================
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Student         = require('../models/Student');
const Payment         = require('../models/Payment');
const StudentDocument = require('../models/StudentDocument');
const PaymentAccount  = require('../models/PaymentAccount');
const University      = require('../models/University');
const AccountEntry    = require('../models/AccountEntry');
const UniversityBill  = require('../models/UniversityBill');
const { audit } = require('../utils/helpers');
const { fail, r2, num, isId, parseYmd, parseRange, ist, sendCsv, stamp } = require('../utils/accountsUtil');
const { EXPENSE_HEADS } = require('./accountsBook.controller');

const oid = v => new mongoose.Types.ObjectId(String(v));
const dayStr = d => ist(d);

// ── Collections from verified student payments (read live) ───
async function collections(from, toExcl) {
  const range = { $gte: from, $lt: toExcl };
  const group = {
    _id: { acc: '$p.paidToAccount', day: { $dateToString: { format: '%Y-%m-%d', date: '$p.paidAt', timezone: 'Asia/Kolkata' } } },
    total: { $sum: '$p.amount' }, count: { $sum: 1 },
  };
  const [fees, docs] = await Promise.all([
    Payment.aggregate([
      { $match: { 'transactions.paidAt': range } },
      { $unwind: '$transactions' },
      { $replaceRoot: { newRoot: { p: '$transactions' } } },
      { $match: { 'p.paidAt': range, 'p.type': { $in: ['Fee', null] }, 'p.verificationStatus': { $in: ['verified', 'not_required', null] } } },
      { $group: group },
    ]),
    StudentDocument.aggregate([
      { $match: { 'payments.paidAt': range } },
      { $unwind: '$payments' },
      { $replaceRoot: { newRoot: { p: '$payments' } } },
      { $match: { 'p.paidAt': range, 'p.verified': true } },
      { $group: group },
    ]),
  ]);
  const out = new Map();
  [...fees, ...docs].forEach(r => {
    const key = `${r._id.acc || 'none'}|${r._id.day}`;
    const e = out.get(key) || { acc: r._id.acc ? String(r._id.acc) : 'none', day: r._id.day, total: 0, count: 0 };
    e.total = r2(e.total + r.total); e.count += r.count;
    out.set(key, e);
  });
  return [...out.values()];
}

async function outflows(from, toExcl) {
  const rows = await AccountEntry.aggregate([
    { $match: { kind: { $in: ['Withdrawal', 'Expense'] }, date: { $gte: from, $lt: toExcl } } },
    { $group: { _id: { acc: '$account', mode: '$mode', kind: '$kind' }, total: { $sum: '$amount' } } },
  ]);
  return rows.map(r => ({ acc: r._id.mode === 'Cash' || !r._id.acc ? 'cash' : String(r._id.acc), kind: r._id.kind, total: r2(r.total) }));
}

const sumBy = (list, pred) => r2(list.filter(pred).reduce((s, x) => s + x.total, 0));

// ── Bank Book ────────────────────────────────────────────────
async function buildBankBook(q) {
  const { from, toExcl } = parseRange(q);
  const only = q.accountId || '';
  const accounts = await PaymentAccount.find().select('label mode isActive').sort('label').lean();
  const keys = [...accounts.map(a => ({ key: String(a._id), label: a.label, mode: a.mode, isActive: a.isActive })), { key: 'cash', label: 'Cash in hand', mode: 'Cash', isActive: true }];

  const [coll, outs, openings] = await Promise.all([
    collections(from, toExcl), outflows(from, toExcl),
    AccountEntry.find({ kind: 'Opening' }).sort('-date').lean(),
  ]);

  const rows = [];
  for (const a of keys) {
    if (only && only !== a.key) continue;
    const opening = openings.find(o => (a.key === 'cash' ? (o.mode === 'Cash' || !o.account) : String(o.account) === a.key) && o.date <= from);
    let openingBalance = 0, openingAsOn = null;
    if (opening) {
      openingBalance = opening.amount; openingAsOn = opening.date;
      if (opening.date < from) {
        const [c0, o0] = await Promise.all([collections(opening.date, from), outflows(opening.date, from)]);
        openingBalance = r2(openingBalance + sumBy(c0, x => x.acc === a.key) - sumBy(o0, x => x.acc === a.key));
      }
    } else {
      // no opening entered: show what happened before the range so the balance still adds up
      const epoch = new Date(2000, 0, 1);
      const [c0, o0] = await Promise.all([collections(epoch, from), outflows(epoch, from)]);
      openingBalance = r2(sumBy(c0, x => x.acc === a.key) - sumBy(o0, x => x.acc === a.key));
    }
    const collection = sumBy(coll, x => x.acc === a.key);
    const withdrawn = sumBy(outs, x => x.acc === a.key && x.kind === 'Withdrawal');
    const expenses = sumBy(outs, x => x.acc === a.key && x.kind === 'Expense');
    rows.push({
      key: a.key, label: a.label, mode: a.mode, isActive: a.isActive, hasOpening: !!opening, openingAsOn,
      opening: openingBalance, collection, withdrawn, expenses, balance: r2(openingBalance + collection - withdrawn - expenses),
    });
  }
  const unassigned = (!only || only === 'none') ? sumBy(coll, x => x.acc === 'none') : 0;
  const visible = rows.filter(r => r.isActive || r.opening || r.collection || r.withdrawn || r.expenses);
  const sum = k => r2(visible.reduce((s, r) => s + r[k], 0));
  const labelOf = new Map(keys.map(k => [k.key, k.label]));
  const daily = coll
    .filter(x => !only || only === x.acc)
    .map(x => ({ date: x.day, accountKey: x.acc, account: x.acc === 'none' ? 'No account recorded' : (labelOf.get(x.acc) || 'Unknown account'), collection: x.total, count: x.count }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.account.localeCompare(b.account));
  return {
    from: dayStr(from), to: dayStr(new Date(toExcl.getTime() - 86400000)),
    rows: visible, unassignedCollection: unassigned, daily,
    totals: { opening: sum('opening'), collection: sum('collection'), withdrawn: sum('withdrawn'), expenses: sum('expenses'), balance: sum('balance') },
  };
}

exports.bankBook = asyncHandler(async (req, res) => res.json(await buildBankBook(req.query)));

exports.exportBankBook = asyncHandler(async (req, res) => {
  const d = await buildBankBook(req.query);
  const range = `${d.from} to ${d.to}`;
  sendCsv(res, `bank-book-${stamp()}.csv`,
    [['ACCOUNT', 'DATE RANGE', 'OPENING BALANCE AS ON DATE', 'TOTAL COLLECTION DATE WISE', 'WITHDRAWN', 'EXPENSES PAID', 'ACCOUNT BALANCE (OPENING + COLLECTION - WITHDRAWN - EXPENSES)'],
      ...d.rows.map(r => [r.label, range, r.opening, r.collection, r.withdrawn, r.expenses, r.balance]),
      ['TOTAL', range, d.totals.opening, d.totals.collection, d.totals.withdrawn, d.totals.expenses, d.totals.balance],
      ...(d.unassignedCollection ? [['Collections with no account recorded (not in balances)', range, '', d.unassignedCollection, '', '', '']] : [])],
    [['DATE', 'ACCOUNT', 'COLLECTION', 'NO. OF PAYMENTS'], ...d.daily.map(x => [x.date, x.account, x.collection, x.count])]);
});

// ── Entries: opening / withdrawal / expense ──────────────────
async function cleanEntry(b) {
  const kind = ['Opening', 'Withdrawal', 'Expense'].includes(b.kind) ? b.kind : null;
  if (!kind) throw fail('Choose the entry type');
  const amount = r2(num(b.amount));
  if (!Number.isFinite(amount) || amount < 0) throw fail('Enter a valid amount');
  if (kind !== 'Opening' && amount <= 0) throw fail('Amount must be greater than zero');
  const date = parseYmd(b.date, 'Date');
  const mode = b.mode === 'Cash' ? 'Cash' : 'Bank';
  let account;
  if (mode === 'Bank') {
    if (!isId(b.accountId)) throw fail('Choose the bank account');
    if (!(await PaymentAccount.exists({ _id: b.accountId }))) throw fail('Account not found', 404);
    account = b.accountId;
  }
  let head;
  if (kind === 'Expense') {
    head = String(b.head || '').trim();
    if (!EXPENSE_HEADS.includes(head)) throw fail('Choose an expense head');
  }
  return { kind, amount, date, mode, account, head, note: String(b.note || '').trim() };
}

async function entriesFor(q) {
  const { from, toExcl } = parseRange(q);
  const filter = { date: { $gte: from, $lt: toExcl } };
  filter.kind = ['Opening', 'Withdrawal', 'Expense'].includes(q.kind) ? q.kind : { $in: ['Withdrawal', 'Expense'] };
  if (isId(q.accountId)) filter.account = q.accountId;
  if (q.accountId === 'cash') { delete filter.account; filter.mode = 'Cash'; }
  if (q.head) filter.head = q.head;
  const entries = await AccountEntry.find(filter).populate('account', 'label').populate('createdBy', 'name').sort('-date -createdAt').lean();
  return { entries, from, toExcl };
}

exports.listEntries = asyncHandler(async (req, res) => {
  const { entries, from, toExcl } = await entriesFor(req.query);
  const byHead = {};
  let expenses = 0, withdrawals = 0;
  entries.forEach(e => {
    if (e.kind === 'Expense') { byHead[e.head] = r2((byHead[e.head] || 0) + e.amount); expenses = r2(expenses + e.amount); }
    if (e.kind === 'Withdrawal') withdrawals = r2(withdrawals + e.amount);
  });
  const coll = await collections(from, toExcl);
  const collection = r2(coll.reduce((s, x) => s + x.total, 0));
  res.json({ entries, byHead, totals: { collection, expenses, withdrawals, net: r2(collection - expenses - withdrawals) } });
});

exports.createEntry = asyncHandler(async (req, res) => {
  const clean = await cleanEntry(req.body);
  const entry = await AccountEntry.create({ ...clean, createdBy: req.user._id });
  await audit('payment_desk_entry_added', 'AccountEntry', entry._id, req.user, clean,
    `${clean.kind}${clean.head ? ` - ${clean.head}` : ''} ₹${clean.amount} (${clean.mode}) added`);
  res.status(201).json(entry);
});

exports.updateEntry = asyncHandler(async (req, res) => {
  const entry = await AccountEntry.findById(req.params.id);
  if (!entry) throw fail('Entry not found', 404);
  const clean = await cleanEntry({ ...req.body, kind: entry.kind });
  const before = entry.toObject();
  Object.assign(entry, { ...clean, updatedBy: req.user._id });
  if (clean.mode === 'Cash') entry.account = undefined;
  if (clean.kind !== 'Expense') entry.head = undefined;
  await entry.save();
  await audit('payment_desk_entry_edited', 'AccountEntry', entry._id, req.user, { before: { amount: before.amount, date: before.date, head: before.head, mode: before.mode }, after: clean },
    `${entry.kind} entry edited: ₹${before.amount} → ₹${clean.amount}`);
  res.json(entry);
});

exports.deleteEntry = asyncHandler(async (req, res) => {
  const entry = await AccountEntry.findById(req.params.id);
  if (!entry) throw fail('Entry not found', 404);
  await AccountEntry.deleteOne({ _id: entry._id });
  await audit('payment_desk_entry_deleted', 'AccountEntry', entry._id, req.user, entry.toObject(),
    `${entry.kind}${entry.head ? ` - ${entry.head}` : ''} ₹${entry.amount} (${ist(entry.date)}) deleted`);
  res.status(204).end();
});

exports.exportEntries = asyncHandler(async (req, res) => {
  const { entries, from, toExcl } = await entriesFor(req.query);
  const coll = await collections(from, toExcl);
  const collection = r2(coll.reduce((s, x) => s + x.total, 0));
  sendCsv(res, `income-expenses-${stamp()}.csv`, [
    ['DATE', 'PARTICULARS', 'PAID', 'CASH / BANK', 'ACCOUNT NAME', 'ENTRY TYPE', 'NOTE'],
    ['', 'TOTAL COLLECTION (from verified payments)', collection, '', '', '', ''],
    ...entries.map(e => [ist(e.date), e.head || e.kind.toUpperCase(), e.amount, e.mode === 'Cash' ? 'CASH' : 'BANK', e.account?.label || '', e.kind, e.note || '']),
  ]);
});

// ── University bill ──────────────────────────────────────────
const rowCalc = r => {
  const payable = r2((r.totalFee || 0) - (r.discount || 0) - (r.oldAdjust || 0));
  return { payable, totalOutstanding: r2(payable + (r.prevOutstanding || 0)) };
};
const lastHist = (doc, status) => [...(doc.statusHistory || [])].reverse().find(h => h.status === status)?.at || null;
const firstHist = (doc, status) => (doc.statusHistory || []).find(h => h.status === status)?.at || null;

exports.billFetch = asyncHandler(async (req, res) => {
  const { universityId } = req.body;
  if (!isId(universityId)) throw fail('Choose a university');
  const uni = await University.findById(universityId).select('name').lean();
  if (!uni) throw fail('University not found', 404);
  const { from, toExcl } = parseRange(req.body);
  const inRange = d => d && d >= from && d < toExcl;

  const [students, docs, bills] = await Promise.all([
    Student.find({ university: uni._id, applicationStatus: 'Enrolled' })
      .select('name enrollmentNumber courseName courseYear statusHistory updatedAt').lean(),
    StudentDocument.find({ university: uni._id, origin: { $ne: 'Inventory' } })
      .populate('student', 'name enrollmentNumber courseName courseYear').lean(),
    UniversityBill.find({ university: uni._id }).select('title rows.kind rows.student rows.document').lean(),
  ]);
  const payments = await Payment.find({ student: { $in: students.map(s => s._id) } }).select('student totalFee discount').lean();
  const feeBy = new Map(payments.map(p => [String(p.student), Math.max(0, r2((p.totalFee || 0) - (p.discount || 0)))]));
  const billed = new Map();
  bills.forEach(b => b.rows.forEach(r => billed.set(`${r.kind}:${r.kind === 'Student' ? r.student : r.document}`, { id: b._id, title: b.title })));

  const rows = [];
  students.forEach(s => {
    const date = lastHist(s, 'Enrolled') || s.updatedAt;
    if (!inRange(date)) return;
    rows.push({
      kind: 'Student', student: s._id, document: null, date, enrollment: s.enrollmentNumber || '', name: s.name,
      course: `${s.courseName || ''} ${s.courseYear || ''}`.trim(), docType: 'ADMISSION', totalFee: feeBy.get(String(s._id)) || 0,
      discount: 0, oldAdjust: 0, prevOutstanding: 0, billed: billed.get(`Student:${s._id}`) || null,
    });
  });
  docs.forEach(d => {
    const date = firstHist(d, 'Sent_To_University') || firstHist(d, 'Fee_Approved');
    if (!inRange(date) || !d.student) return;
    rows.push({
      kind: 'Document', student: d.student._id, document: d._id, date, enrollment: d.student.enrollmentNumber || '', name: d.student.name,
      course: `${d.student.courseName || ''} ${d.student.courseYear || ''}`.trim(), docType: d.name, totalFee: d.chargeFee || 0,
      discount: 0, oldAdjust: 0, prevOutstanding: 0, billed: billed.get(`Document:${d._id}`) || null,
    });
  });
  rows.sort((a, b) => new Date(a.date) - new Date(b.date) || a.name.localeCompare(b.name));
  res.json({ university: uni, rows });
});

function cleanBill(b) {
  const title = String(b.title || '').trim();
  if (!title) throw fail('Give the bill a title (e.g. "October 2026")');
  if (!Array.isArray(b.rows)) throw fail('Bill rows are required');
  if (b.rows.length > 5000) throw fail('Too many rows in one bill');
  const rows = b.rows.map((r, i) => {
    if (!['Student', 'Document'].includes(r.kind)) throw fail(`Row ${i + 1}: invalid type`);
    const o = { kind: r.kind, enrollment: String(r.enrollment || ''), name: String(r.name || ''), course: String(r.course || ''), docType: String(r.docType || '') };
    if (isId(r.student)) o.student = r.student;
    if (isId(r.document)) o.document = r.document;
    if (r.date && !Number.isNaN(new Date(r.date).getTime())) o.date = new Date(r.date);
    for (const f of ['totalFee', 'discount', 'oldAdjust', 'prevOutstanding']) {
      const v = r[f] === '' || r[f] === undefined || r[f] === null ? 0 : r2(num(r[f]));
      if (!Number.isFinite(v) || v < 0) throw fail(`Row ${i + 1} (${o.name}): ${f} must be a number, 0 or more`);
      o[f] = v;
    }
    return o;
  });
  const data = { title, note: String(b.note || '').trim(), rows };
  if (b.from) data.from = parseYmd(b.from, 'From date');
  if (b.to) data.to = parseYmd(b.to, 'To date');
  return data;
}

const billTotals = rows => rows.reduce((t, r) => {
  const c = rowCalc(r);
  return {
    totalFee: r2(t.totalFee + r.totalFee), discount: r2(t.discount + r.discount), oldAdjust: r2(t.oldAdjust + r.oldAdjust),
    prevOutstanding: r2(t.prevOutstanding + r.prevOutstanding), payable: r2(t.payable + c.payable), totalOutstanding: r2(t.totalOutstanding + c.totalOutstanding),
  };
}, { totalFee: 0, discount: 0, oldAdjust: 0, prevOutstanding: 0, payable: 0, totalOutstanding: 0 });

exports.listBills = asyncHandler(async (req, res) => {
  const filter = isId(req.query.universityId) ? { university: req.query.universityId } : {};
  const bills = await UniversityBill.find(filter).populate('university', 'name').sort('-createdAt').lean();
  res.json(bills.map(b => ({
    _id: b._id, title: b.title, university: b.university, status: b.status, from: b.from, to: b.to, rowCount: b.rows.length,
    totals: billTotals(b.rows), createdAt: b.createdAt,
  })));
});

exports.getBill = asyncHandler(async (req, res) => {
  const bill = await UniversityBill.findById(req.params.id).populate('university', 'name').lean();
  if (!bill) throw fail('Bill not found', 404);
  res.json({ ...bill, totals: billTotals(bill.rows) });
});

exports.createBill = asyncHandler(async (req, res) => {
  if (!isId(req.body.universityId)) throw fail('Choose a university');
  if (!(await University.exists({ _id: req.body.universityId }))) throw fail('University not found', 404);
  const data = cleanBill(req.body);
  const bill = await UniversityBill.create({ ...data, university: req.body.universityId, createdBy: req.user._id });
  await audit('university_bill_created', 'UniversityBill', bill._id, req.user, { title: data.title, rows: data.rows.length }, `University bill "${data.title}" created (${data.rows.length} rows)`);
  res.status(201).json({ ...bill.toObject(), totals: billTotals(bill.rows) });
});

exports.updateBill = asyncHandler(async (req, res) => {
  const bill = await UniversityBill.findById(req.params.id);
  if (!bill) throw fail('Bill not found', 404);
  // Status can be flipped by anyone with access; the rows of a Final bill are locked unless it is re-opened first.
  if (req.body.status && ['Draft', 'Final'].includes(req.body.status) && req.body.status !== bill.status) {
    bill.status = req.body.status;
    bill.updatedBy = req.user._id;
    await bill.save();
    await audit('university_bill_status', 'UniversityBill', bill._id, req.user, { status: bill.status }, `University bill "${bill.title}" marked ${bill.status}`);
    return res.json({ ...bill.toObject(), totals: billTotals(bill.rows) });
  }
  if (bill.status === 'Final') throw fail('This bill is final. Re-open it to make changes.', 409);
  const data = cleanBill({ ...req.body, title: req.body.title ?? bill.title });
  Object.assign(bill, data, { updatedBy: req.user._id });
  await bill.save();
  await audit('university_bill_updated', 'UniversityBill', bill._id, req.user, { title: data.title, rows: data.rows.length }, `University bill "${bill.title}" saved (${data.rows.length} rows)`);
  res.json({ ...bill.toObject(), totals: billTotals(bill.rows) });
});

exports.deleteBill = asyncHandler(async (req, res) => {
  const bill = await UniversityBill.findById(req.params.id);
  if (!bill) throw fail('Bill not found', 404);
  if (bill.status === 'Final' && req.user.role !== 'Admin') throw fail('Only Admin can delete a final bill', 403);
  await UniversityBill.deleteOne({ _id: bill._id });
  await audit('university_bill_deleted', 'UniversityBill', bill._id, req.user, { title: bill.title, rows: bill.rows.length }, `University bill "${bill.title}" deleted`);
  res.status(204).end();
});

exports.exportBill = asyncHandler(async (req, res) => {
  const bill = await UniversityBill.findById(req.params.id).populate('university', 'name').lean();
  if (!bill) throw fail('Bill not found', 404);
  const t = billTotals(bill.rows);
  sendCsv(res, `university-bill-${bill.title}-${stamp()}.csv`, [
    ['UNIVERSITY BILL', bill.university?.name || '', bill.title, bill.status],
    ['DATE OF TRANSACTION', 'ENROLLMENT', 'NAME OF STUDENT', 'COURSE NAME', 'TYPE OF DOCUMENTS', 'TOTAL FEE', 'DISCOUNT', 'OLD ADJUST',
      'OUTSTANDING OF PREVIOUS AMOUNT', 'PAYABLE (FEE - DISCOUNT - OLD ADJUST)', 'TOTAL OUTSTANDING (PAYABLE + PREVIOUS)'],
    ...bill.rows.map(r => { const c = rowCalc(r); return [ist(r.date), r.enrollment, r.name, r.course, r.docType, r.totalFee, r.discount, r.oldAdjust, r.prevOutstanding, c.payable, c.totalOutstanding]; }),
    ['TOTAL', '', `${bill.rows.length} rows`, '', '', t.totalFee, t.discount, t.oldAdjust, t.prevOutstanding, t.payable, t.totalOutstanding],
  ]);
});

exports._internals = { buildBankBook, collections, rowCalc };

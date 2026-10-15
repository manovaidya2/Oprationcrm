// ============================================================
// controllers/accountsBook.controller.js
// Payment Desk (roles: Payment, Admin) — Day Book, Ledger, Document Status,
// student autofill and write-back edits.
//
// Nothing here keeps a second copy of the data: every table is built live from
// Student / Payment / StudentDocument, and every edit is written to the real record
// (with a reason and an Activity Log entry).
// ============================================================
const asyncHandler = require('express-async-handler');
const Center          = require('../models/Center');
const Student         = require('../models/Student');
const Payment         = require('../models/Payment');
const StudentDocument = require('../models/StudentDocument');
const PaymentAccount  = require('../models/PaymentAccount');
const University      = require('../models/University');
const CenterSettlement = require('../models/CenterSettlement');
const Counselor       = require('../models/Counselor');
const User            = require('../models/User');
const { audit, notify, notifyRole } = require('../utils/helpers');
const { findDuplicateUtrMatches, normalizeUtr } = require('../utils/utrDuplicate');
const {
  EPS, COUNTED, PENDING, fail, r2, num, isId, esc, parseRange, ist, sendCsv, stamp,
} = require('../utils/accountsUtil');

const EXPENSE_HEADS = [
  'UNIVERSITY PAYMENT OF THE MONTH', 'SALARY OF UNIVERSITY STAFF', 'SALARY OF DELHI OFFICE',
  'SALARY OF NOIDA OFFICE', 'SALARY OF DUBAI OFFICE', 'CRM MAINTENANCE', 'SALES & MARKETING EXP',
  'TOUR & TRAVEL EXP.', 'COURIER & DISPATCH', 'TRANSPORTATION', 'OTHER EXPENSES',
];
const MAX_EXPORT_ROWS = 20000;
const centerName = c => c?.name || c?.organisationName || '';

// The Viewer Counselor of a centre = the active ViewerCounselor login whose counselor record lists that centre.
async function viewerCounselorsByCenter(centerIds) {
  const ids = [...new Set(centerIds.filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const viewers = await User.find({ role: 'ViewerCounselor', isActive: true, counselorId: { $exists: true, $ne: null } }).select('name counselorId').lean();
  const records = await Counselor.find({ _id: { $in: viewers.map(v => v.counselorId) }, centers: { $in: ids } }).select('centers').lean();
  const byCounselor = new Map(records.map(c => [String(c._id), c.centers.map(String)]));
  const out = new Map();
  for (const v of viewers) {
    for (const cid of byCounselor.get(String(v.counselorId)) || []) {
      out.set(cid, out.has(cid) ? `${out.get(cid)}, ${v.name}` : v.name);
    }
  }
  return out;
}

// ── Fee timeline ──────────────────────────────────────────────
// "Payment adjustment" = a settlement: one centre payment (one UTR) spread over many students, made in Centre Billing
// or on the Payment Desk. Only verified amounts exist here; ordinary payments leave it empty.
const ADJUSTMENT_SOURCES = ['Center Monthly Settlement'];
const isAdjustmentTx = tx => ADJUSTMENT_SOURCES.includes(tx.source);
const keyOf = (tx, i) => [new Date(tx.paidAt || tx.createdAt || 0).getTime(), new Date(tx.createdAt || tx.paidAt || 0).getTime(), i];
const cmpKey = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const netFeeOf = p => Math.max(0, r2((p?.totalFee || 0) - (p?.discount || 0)));

function feeTimeline(payment) {
  const net = netFeeOf(payment);
  const items = (payment.transactions || [])
    .map((tx, i) => ({ tx, key: keyOf(tx, i) }))
    .filter(x => (x.tx.type || 'Fee') === 'Fee')
    .sort((a, b) => cmpKey(a.key, b.key));
  const out = new Map();
  let cum = 0, prev = null;
  for (const { tx } of items) {
    const counted = COUNTED.includes(tx.verificationStatus || 'not_required');
    out.set(String(tx._id), {
      net, prev,
      balance: Math.max(0, r2(net - cum - (tx.amount || 0))),
    });
    if (counted) {
      cum = r2(cum + (tx.amount || 0));
      prev = { tx, balance: Math.max(0, r2(net - cum)) };
    }
  }
  return { out, net, paid: cum, last: prev };
}

function docTimeline(doc) {
  const items = (doc.payments || [])
    .map((p, i) => ({ p, key: keyOf(p, i) }))
    .sort((a, b) => cmpKey(a.key, b.key));
  const fee = Math.max(0, r2(doc.chargeFee || 0));
  const out = new Map();
  let cum = 0, prev = null;
  for (const { p } of items) {
    out.set(String(p._id), { net: fee, prev, balance: Math.max(0, r2(fee - cum - (p.amount || 0))) });
    if (p.verified) { cum = r2(cum + (p.amount || 0)); prev = { tx: p, balance: Math.max(0, r2(fee - cum)) }; }
  }
  return out;
}

// Everything the student has paid, from every source (own payments, settlements, desk entries), plus what is still unverified.
function feePaymentList(payment) {
  const items = (payment.transactions || []).map((tx, i) => ({ tx, key: keyOf(tx, i) }))
    .filter(x => (x.tx.type || 'Fee') === 'Fee').sort((a, b) => cmpKey(a.key, b.key));
  const view = tx => ({ txId: tx._id, amount: tx.amount || 0, paidAt: tx.paidAt, utrRef: tx.utrRef || '', accountName: tx.paidToAccountLabel || '', mode: tx.mode || '', isAdjustment: isAdjustmentTx(tx), status: tx.verificationStatus || 'not_required' });
  const verified = items.filter(x => COUNTED.includes(x.tx.verificationStatus || 'not_required')).map(x => view(x.tx));
  const unverified = items.filter(x => PENDING.includes(x.tx.verificationStatus)).map(x => view(x.tx));
  return {
    payments: verified, unverified,
    verifiedTotal: r2(verified.reduce((a, v) => a + v.amount, 0)),
    unverifiedAmount: r2(unverified.reduce((a, v) => a + v.amount, 0)),
  };
}
function docPaymentList(doc) {
  const items = (doc.payments || []).map((p, i) => ({ p, key: keyOf(p, i) })).sort((a, b) => cmpKey(a.key, b.key));
  const view = p => ({ txId: p._id, amount: p.amount || 0, paidAt: p.paidAt, utrRef: p.utrRef || '', accountName: p.paidToAccountLabel || '', mode: p.mode || '', isAdjustment: false, status: p.verified ? 'verified' : 'pending' });
  const verified = items.filter(x => x.p.verified).map(x => view(x.p));
  const unverified = items.filter(x => !x.p.verified).map(x => view(x.p));
  return { payments: verified, unverified, verifiedTotal: r2(verified.reduce((a, v) => a + v.amount, 0)), unverifiedAmount: r2(unverified.reduce((a, v) => a + v.amount, 0)) };
}

// One line per payment (verified, unverified and rejected), oldest first, each with the balance left after it.
function feeLines(payment, tl) {
  return (payment.transactions || []).map((tx, i) => ({ tx, key: keyOf(tx, i) }))
    .filter(x => (x.tx.type || 'Fee') === 'Fee').sort((a, b) => cmpKey(a.key, b.key))
    .map(({ tx }) => ({
      txId: tx._id, status: verificationOf(tx), amount: tx.amount || 0, paidAt: tx.paidAt, entryDate: tx.createdAt || tx.paidAt,
      utrRef: tx.utrRef || '', accountName: tx.paidToAccountLabel || '', accountId: tx.paidToAccount || null, mode: tx.mode || '',
      isAdjustment: isAdjustmentTx(tx), source: tx.source || 'Manual', settlementId: tx.centerSettlement || null,
      screenshot: tx.paymentScreenshot || '', note: tx.note || '', balance: tl.out.get(String(tx._id))?.balance ?? 0,
    }));
}
function docLines(doc, tl) {
  return (doc.payments || []).map((pay, i) => ({ pay, key: keyOf(pay, i) })).sort((a, b) => cmpKey(a.key, b.key))
    .map(({ pay }) => ({
      txId: pay._id, status: pay.verified ? 'verified' : 'pending', amount: pay.amount || 0, paidAt: pay.paidAt, entryDate: pay.createdAt || pay.paidAt,
      utrRef: pay.utrRef || '', accountName: pay.paidToAccountLabel || '', accountId: pay.paidToAccount || null, mode: pay.mode || '',
      isAdjustment: false, source: 'Manual', settlementId: null, screenshot: pay.paymentScreenshot || '', note: pay.note || '',
      balance: tl.get(String(pay._id))?.balance ?? 0,
    }));
}

const isOldAdmission = s => (s.statusHistory || []).some(h => h.note === 'Backfilled by Admin');
const verificationOf = tx => {
  const st = tx.verificationStatus || 'not_required';
  return COUNTED.includes(st) ? 'verified' : PENDING.includes(st) ? 'pending' : 'rejected';
};
const STUDENT_FIELDS = 'name enrollmentNumber courseName courseYear applicationStatus rejectionReason statusHistory counselor center createdAt';

function reasonText(s) {
  if (s.enrollmentNumber) return s.enrollmentNumber;
  if (['Rejected', 'Cancelled', 'Accountant_Rejected', 'University_Rejected'].includes(s.applicationStatus)) {
    return `${s.applicationStatus.replace(/_/g, ' ')}${s.rejectionReason ? `: ${s.rejectionReason}` : ''}`;
  }
  return '';
}

const prevView = (prev, accLabel) => prev ? {
  isAdjustment: isAdjustmentTx(prev.tx), entryDate: prev.tx.createdAt || prev.tx.paidAt, utrDate: prev.tx.paidAt, utrRef: prev.tx.utrRef || '',
  accountName: prev.tx.paidToAccountLabel || accLabel || '', balance: prev.balance, amount: prev.tx.amount || 0,
} : null;

// ── Day Book ─────────────────────────────────────────────────
async function buildDayBook(q, { all = false } = {}) {
  const { from, toExcl } = parseRange(q);
  const basis = q.dateBasis === 'paidAt' ? 'paidAt' : 'createdAt';
  const studentBasis = q.dateBasis === 'studentAt';            // filter by when the student was added, not by the payment dates
  const ver = ['pending', 'rejected', 'all'].includes(q.ver) ? q.ver : 'verified';
  const typeF = ['new', 'old', 'document'].includes(q.type) ? q.type : 'all';
  const accountF = q.accountId || '';
  const search = String(q.search || '').trim().toLowerCase();
  const rows = [];
  const unverified = { count: 0, amount: 0 };
  const inRange = d => studentBasis || (d && d >= from && d < toExcl);   // with the student basis the student was already picked by date, so all their payments count
  let studentIds = null;
  if (studentBasis) {
    const sf = { createdAt: { $gte: from, $lt: toExcl } };
    if (isId(q.centerId)) sf.center = q.centerId;
    studentIds = (await Student.find(sf).select('_id').lean()).map(x => x._id);
  }
  const accountOk = id => !accountF || (accountF === 'none' ? !id : String(id || '') === accountF);

  if (typeF !== 'document') {
    const filter = studentBasis ? { student: { $in: studentIds }, 'transactions.0': { $exists: true } } : { transactions: { $elemMatch: { type: 'Fee', [basis]: { $gte: from, $lt: toExcl } } } };
    if (isId(q.centerId)) filter.center = q.centerId;
    const payments = await Payment.find(filter)
      .populate({ path: 'student', select: STUDENT_FIELDS, populate: { path: 'counselor', select: 'name' } })
      .populate('center', 'name organisationName').lean();
    for (const p of payments) {
      if (!p.student) continue;
      const old = isOldAdmission(p.student);
      if ((typeF === 'new' && old) || (typeF === 'old' && !old)) continue;
      const tl = feeTimeline(p);
      const all = feePaymentList(p);
      const lines = feeLines(p, tl);
      for (const tx of p.transactions) {
        if ((tx.type || 'Fee') !== 'Fee' || !inRange(tx[basis])) continue;
        const v = verificationOf(tx);
        if (!accountOk(tx.paidToAccount)) continue;
        if (v === 'pending') { unverified.count += 1; unverified.amount = r2(unverified.amount + (tx.amount || 0)); }
        if (ver !== 'all' && v !== ver) continue;
        const t = tl.out.get(String(tx._id));
        rows.push({
          key: `fee:${p._id}:${tx._id}`, groupKey: `fee:${p._id}`, _lines: lines, kind: 'fee', parentId: p._id, txId: tx._id,
          studentId: p.student._id, type: old ? 'OLD ADMISSION' : 'NEW ADMISSION',
          entryDate: tx.createdAt || tx.paidAt, utrDate: tx.paidAt, sortDate: studentBasis ? p.student.createdAt : tx[basis], studentAddedAt: p.student.createdAt,
          student: p.student.name, enrollmentNumber: p.student.enrollmentNumber || '', course: `${p.student.courseName || ''} ${p.student.courseYear || ''}`.trim(),
          totalFee: t.net, paid: isAdjustmentTx(tx) ? 0 : (tx.amount || 0), adjustment: isAdjustmentTx(tx) ? (tx.amount || 0) : 0,
          isAdjustment: isAdjustmentTx(tx), source: tx.source || 'Manual', settlementId: tx.centerSettlement || null, balance: t.balance, ...all,
          utrRef: tx.utrRef || '', mode: tx.mode || '', accountId: tx.paidToAccount || null, accountName: tx.paidToAccountLabel || '',
          reason: reasonText(p.student), applicationStatus: p.student.applicationStatus,
          prev: prevView(t.prev), counselor: p.student.counselor?.name || '', center: centerName(p.center), centerId: p.center?._id,
          docStatus: '', verification: v, note: tx.note || '', screenshot: tx.paymentScreenshot || '',
        });
      }
    }
  }

  if (typeF === 'all' || typeF === 'document') {
    const filter = studentBasis ? { origin: { $ne: 'Inventory' }, student: { $in: studentIds }, 'payments.0': { $exists: true } } : { origin: { $ne: 'Inventory' }, payments: { $elemMatch: { [basis]: { $gte: from, $lt: toExcl } } } };
    if (isId(q.centerId)) filter.center = q.centerId;
    const docs = await StudentDocument.find(filter)
      .populate({ path: 'student', select: STUDENT_FIELDS })
      .populate('counselor', 'name').populate('center', 'name organisationName').lean();
    for (const d of docs) {
      const tl = docTimeline(d);
      const all = docPaymentList(d);
      const lines = docLines(d, tl);
      for (const p of d.payments || []) {
        if (!inRange(p[basis])) continue;
        const v = p.verified ? 'verified' : 'pending';
        if (!accountOk(p.paidToAccount)) continue;
        if (v === 'pending') { unverified.count += 1; unverified.amount = r2(unverified.amount + (p.amount || 0)); }
        if (ver !== 'all' && v !== ver) continue;
        const t = tl.get(String(p._id));
        rows.push({
          key: `doc:${d._id}:${p._id}`, groupKey: `doc:${d._id}`, _lines: lines, kind: 'doc', parentId: d._id, txId: p._id,
          studentId: d.student?._id, type: 'OTHER DOCUMENT',
          entryDate: p.createdAt || p.paidAt, utrDate: p.paidAt, sortDate: studentBasis ? (d.student?.createdAt || p[basis]) : p[basis], studentAddedAt: d.student?.createdAt || null,
          student: d.student?.name || '', enrollmentNumber: d.student?.enrollmentNumber || '', course: d.name,
          totalFee: t.net, paid: p.amount || 0, adjustment: 0, isAdjustment: false, source: 'Manual', balance: t.balance, ...all,
          utrRef: p.utrRef || '', mode: p.mode || '', accountId: p.paidToAccount || null, accountName: p.paidToAccountLabel || '',
          reason: d.student ? reasonText(d.student) : '', applicationStatus: d.student?.applicationStatus || '',
          prev: prevView(t.prev), counselor: d.counselor?.name || '', center: centerName(d.center), centerId: d.center?._id,
          docStatus: d.status, verification: v, note: p.note || '', screenshot: p.paymentScreenshot || '',
        });
      }
    }
  }

  const settlementIds = [...new Set(rows.map(r => r.settlementId).filter(Boolean).map(String))];
  if (settlementIds.length) {
    const found = await CenterSettlement.find({ _id: { $in: settlementIds } }).select('studentCount amount via utrRef').lean();
    const byId = new Map(found.map(x => [String(x._id), x]));
    rows.forEach(r => { const s = byId.get(String(r.settlementId)); if (s) r.settlement = { studentCount: s.studentCount, amount: s.amount, via: s.via || 'Centre Billing' }; });
  }
  const viewers = await viewerCounselorsByCenter(rows.map(r => r.centerId));
  rows.forEach(r => { r.viewerCounselor = viewers.get(String(r.centerId)) || ''; });

  const filtered = search ? rows.filter(r =>
    [r.student, r.enrollmentNumber, r.utrRef, r.center, r.counselor, r.viewerCounselor, r.course, r.accountName].some(x => String(x || '').toLowerCase().includes(search))
  ) : rows;
  filtered.sort((a, b) => new Date(a.sortDate) - new Date(b.sortDate) || new Date(a.entryDate) - new Date(b.entryDate));

  const totals = {
    unverified,
    count: filtered.length,                       // payments
    students: new Set(filtered.map(r => r.groupKey)).size,
    paid: r2(filtered.filter(r => r.verification === 'verified').reduce((x, r) => x + r.paid, 0)),
    adjusted: r2(filtered.filter(r => r.verification === 'verified').reduce((x, r) => x + r.adjustment, 0)),
    byType: filtered.filter(r => r.verification === 'verified').reduce((acc, r) => { acc[r.type] = r2((acc[r.type] || 0) + r.paid); return acc; }, {}),
  };
  if (all) return { rows: filtered.slice(0, MAX_EXPORT_ROWS).map(({ _lines, ...rest }) => rest), totals };

  // One entry per student (or document): every payment of theirs in one place
  const byGroup = new Map();
  for (const r of filtered) {
    let g = byGroup.get(r.groupKey);
    if (!g) {
      g = { key: r.groupKey, kind: r.kind, parentId: r.parentId, studentId: r.studentId, type: r.type, student: r.student, enrollmentNumber: r.enrollmentNumber,
        course: r.course, studentAddedAt: r.studentAddedAt, totalFee: r.totalFee, reason: r.reason, applicationStatus: r.applicationStatus, counselor: r.counselor, viewerCounselor: r.viewerCounselor,
        center: r.center, centerId: r.centerId, docStatus: r.docStatus, lines: r._lines, shownTx: new Set() };
      byGroup.set(r.groupKey, g);
    }
    g.shownTx.add(String(r.txId));
  }
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(q.limit, 10) || 50));
  const allGroups = [...byGroup.values()];
  const pageGroups = allGroups.slice((page - 1) * limit, page * limit);

  const lineSettlementIds = [...new Set(pageGroups.flatMap(g => g.lines.map(l => l.settlementId)).filter(Boolean).map(String))];
  const settlements = new Map();
  if (lineSettlementIds.length) (await CenterSettlement.find({ _id: { $in: lineSettlementIds } }).select('studentCount amount via').lean()).forEach(x => settlements.set(String(x._id), x));
  for (const g of pageGroups) {
    g.lines = g.lines.map(l => ({ ...l, shown: g.shownTx.has(String(l.txId)), settlement: l.settlementId && settlements.get(String(l.settlementId)) ? { studentCount: settlements.get(String(l.settlementId)).studentCount, amount: settlements.get(String(l.settlementId)).amount } : null }));
    const verified = g.lines.filter(l => l.status === 'verified');
    g.verifiedTotal = r2(verified.reduce((x, l) => x + l.amount, 0));
    g.adjustmentTotal = r2(verified.filter(l => l.isAdjustment).reduce((x, l) => x + l.amount, 0));
    g.paidTotal = r2(g.verifiedTotal - g.adjustmentTotal);
    g.unverifiedAmount = r2(g.lines.filter(l => l.status === 'pending').reduce((x, l) => x + l.amount, 0));
    g.balance = Math.max(0, r2(g.totalFee - g.verifiedTotal));
    delete g.shownTx;
  }
  const pageKeys = new Set(pageGroups.map(g => g.key));
  return { groups: pageGroups, rows: filtered.filter(r => pageKeys.has(r.groupKey)).map(({ _lines, ...rest }) => rest), totals, page, pages: Math.ceil(allGroups.length / limit) || 1 };
}

exports.dayBook = asyncHandler(async (req, res) => res.json(await buildDayBook(req.query)));

exports.exportDayBook = asyncHandler(async (req, res) => {
  const { rows } = await buildDayBook(req.query, { all: true });
  const header = ['STATUS OF TRANSACTION', 'DATE OF TRANSACTION', 'STUDENT NAME', 'COURSE NAME / OTHER DOCUMENTS', 'TOTAL FEE', 'PAID',
    'PAYMENT ADJUSTMENT', 'DATE OF UTR', 'UTR REF', 'ACCOUNT NAME', 'BALANCE', 'ENROLLMENT / REJECTION / HOLD REASON',
    'DATE OF PREVIOUS PAYMENT', 'PREVIOUS DATE OF UTR', 'PREVIOUS UTR REF', 'PREVIOUS ACCOUNT NAME', 'PREVIOUS BALANCE',
    'COUNSELLOR', 'VIEWER COUNSELLOR', 'CENTRE NAME', 'STATUS OF DOCUMENT', 'VERIFICATION', 'TOTAL VERIFIED PAID (ALL PAYMENTS)', 'UNVERIFIED AMOUNT'];
  sendCsv(res, `day-book-${stamp()}.csv`, [header, ...rows.map(r => [
    r.isAdjustment ? `${r.type} - ADJUSTMENT` : r.type, ist(r.entryDate), r.student, r.course, r.totalFee, r.isAdjustment ? '' : r.paid, r.isAdjustment ? r.adjustment : '', ist(r.utrDate), r.utrRef, r.accountName, r.balance,
    r.reason, r.prev ? ist(r.prev.entryDate) : '', r.prev ? ist(r.prev.utrDate) : '', r.prev?.utrRef || '', r.prev?.accountName || '',
    r.prev ? r.prev.balance : '', r.counselor, r.viewerCounselor, r.center, r.docStatus.replace(/_/g, ' '), r.verification, r.verifiedTotal, r.unverifiedAmount || '',
  ])]);
});

// ── Meta (dropdown data) ─────────────────────────────────────
exports.meta = asyncHandler(async (_req, res) => {
  const [centers, accounts, universities] = await Promise.all([
    Center.find().select('name organisationName city').sort('name').lean(),
    PaymentAccount.find().select('label mode upiId bankName accountNumber isActive').sort('label').lean(),
    University.find().select('name shortName isActive').sort('name').lean(),
  ]);
  res.json({ centers, accounts, universities, expenseHeads: EXPENSE_HEADS });
});

// ── Student autofill ─────────────────────────────────────────
function summaryOf(student, payment) {
  const tl = payment ? feeTimeline(payment) : { net: 0, paid: 0, last: null };
  const netFee = payment ? tl.net : 0;
  return {
    studentId: student._id, name: student.name, enrollmentNumber: student.enrollmentNumber || '',
    course: `${student.courseName || ''} ${student.courseYear || ''}`.trim(),
    courseName: student.courseName || '', courseYear: student.courseYear || '',
    university: student.university?.name || student.universityName || '',
    center: centerName(student.center), centerId: student.center?._id || student.center,
    counselor: student.counselor?.name || '', applicationStatus: student.applicationStatus,
    totalFee: r2(payment?.totalFee), discount: r2(payment?.discount), netFee, paid: tl.paid,
    due: Math.max(0, r2(netFee - tl.paid)),
    installmentCount: (payment?.installments || []).length,
    installmentTotal: r2((payment?.installments || []).reduce((s, i) => s + (i.amount || 0), 0)),
    pendingCount: (payment?.transactions || []).filter(t => (t.type || 'Fee') === 'Fee' && PENDING.includes(t.verificationStatus)).length,
    lastPayment: tl.last ? {
      entryDate: tl.last.tx.createdAt || tl.last.tx.paidAt, utrDate: tl.last.tx.paidAt, utrRef: tl.last.tx.utrRef || '',
      accountName: tl.last.tx.paidToAccountLabel || '', accountId: tl.last.tx.paidToAccount || null, mode: tl.last.tx.mode || '',
      amount: tl.last.tx.amount || 0, balance: tl.last.balance,
    } : null,
  };
}

exports.searchStudents = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const rx = new RegExp(esc(q), 'i');
  const filter = { $or: [{ name: rx }, { enrollmentNumber: rx }, { phone: rx }] };
  if (isId(req.query.centerId)) filter.center = req.query.centerId;
  const students = await Student.find(filter)
    .select('name enrollmentNumber courseName courseYear applicationStatus center counselor university universityName')
    .populate('center', 'name organisationName').populate('counselor', 'name').populate('university', 'name')
    .sort('name').limit(15).lean();
  const payments = await Payment.find({ student: { $in: students.map(s => s._id) } }).lean();
  const byStudent = new Map(payments.map(p => [String(p.student), p]));
  res.json(students.map(s => summaryOf(s, byStudent.get(String(s._id)))));
});

async function summaryFor(studentId) {
  const student = await Student.findById(studentId)
    .select('name enrollmentNumber courseName courseYear applicationStatus center counselor university universityName')
    .populate('center', 'name organisationName').populate('counselor', 'name').populate('university', 'name').lean();
  if (!student) throw fail('Student not found', 404);
  return summaryOf(student, await Payment.findOne({ student: studentId }).lean());
}
exports.studentSummary = asyncHandler(async (req, res) => res.json(await summaryFor(req.params.id)));

// ── Add a payment (for money that went straight to the bank) ─
async function accountFor(accountId) {
  if (!accountId) return null;
  if (!isId(accountId)) throw fail('Invalid account');
  const acc = await PaymentAccount.findById(accountId).lean();
  if (!acc) throw fail('Account not found', 404);
  return acc;
}

exports.addPayment = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!isId(b.studentId)) throw fail('Choose a student');
  const amount = r2(num(b.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw fail('Enter a valid amount');
  const mode = b.mode === 'Bank Transfer' ? 'Bank Transfer' : b.mode === 'UPI' ? 'UPI' : null;
  if (!mode) throw fail('Select a payment mode');
  const utrRef = String(b.utrRef || '').trim();
  if (!utrRef) throw fail('UTR / reference number is required');
  const paidAt = b.paidAt ? new Date(b.paidAt) : null;
  if (!paidAt || Number.isNaN(paidAt.getTime())) throw fail('Enter a valid payment date');

  const student = await Student.findById(b.studentId).select('name center applicationStatus').lean();
  if (!student) throw fail('Student not found', 404);
  if (['Draft', 'Cancelled', 'Rejected'].includes(student.applicationStatus)) {
    throw fail(`${student.name} is ${student.applicationStatus}; a payment cannot be added`);
  }
  const payment = await Payment.findOne({ student: student._id });
  if (!payment) throw fail('This student has no fee set. Correct the fee first.');
  const net = netFeeOf(payment);
  if (net <= 0) throw fail('This student has no fee set. Correct the fee first.');
  const tl = feeTimeline(payment);
  const due = Math.max(0, r2(net - tl.paid));
  if (amount > due + EPS) throw fail(`Amount is more than the balance due of ₹${due}. Correct the student's fee first if it is wrong.`);

  const matches = await findDuplicateUtrMatches(utrRef);
  if (matches.length && !(b.confirmDuplicate === true || b.confirmDuplicate === 'true')) {
    throw fail('This UTR already exists on other payments', 409, { duplicateMatches: matches });
  }
  const acc = await accountFor(b.accountId);
  payment.transactions.push({
    amount, mode, utrRef, paidAt, note: String(b.note || '').trim(),
    upiId: acc?.upiId || '', bankName: acc?.bankName || '', accountHolder: acc?.accountHolder || '',
    accountNumber: acc?.accountNumber || '', ifscCode: acc?.ifscCode || '',
    paidToAccount: acc?._id, paidToAccountLabel: acc?.label || '',
    paymentScreenshot: req.file ? `/uploads/${req.file.filename}` : '',
    type: 'Fee', verificationStatus: 'verified', verificationNote: 'Added by Payment desk',
    recordedBy: req.user._id, verifiedBy: req.user._id, verifiedAt: new Date(),
  });
  payment.lastUpdatedBy = req.user._id;
  payment.lastUpdatedAt = new Date();
  await payment.save();
  await audit('payment_desk_payment_added', 'Payment', payment._id, req.user, { amount, utrRef, accountId: acc?._id, paidAt },
    `Payment desk added ₹${amount} (${utrRef}) for ${student.name}`);
  await tellCentre(student.center, `A fee payment of ₹${amount} for ${student.name} has been recorded and verified.`, student._id);
  res.status(201).json(await summaryFor(student._id));
});

// ── Verify / reject unverified payments straight from the Day Book ──
// Uses the same status fields the Counselor and Accountant screens read, so a payment verified here
// disappears from their pending queues and counts as paid everywhere.
async function tellCentre(centerId, message, studentId) {
  if (!centerId) return;
  const users = await User.find({ role: 'Center', centerId, isActive: true }).select('_id').lean();
  await notify(users.map(u => u._id), { message, type: 'payment_verified', role: 'Center', studentId });
}
async function tellCounselor(counselorId, message, extra = {}) {
  if (!counselorId) return;
  const u = await User.findOne({ counselorId, role: 'Counselor', isActive: true }).select('_id').lean();
  if (u) await notify(u._id, { message, type: 'payment_verified', role: 'Counselor', ...extra });
}

exports.reviewPayments = asyncHandler(async (req, res) => {
  const action = ['verify', 'reject'].includes(req.body.action) ? req.body.action : null;
  if (!action) throw fail('Choose verify or reject');
  const note = String(req.body.note || '').trim();
  if (action === 'reject' && !note) throw fail('A reason is required to reject');
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) throw fail('Select at least one payment');
  if (items.length > 500) throw fail('Select 500 payments or fewer at a time');

  const feeBy = new Map(), docBy = new Map();
  for (const it of items) {
    if (!isId(it.parentId) || !isId(it.txId)) throw fail('Invalid payment selected');
    const m = it.kind === 'doc' ? docBy : feeBy;
    if (!m.has(String(it.parentId))) m.set(String(it.parentId), new Set());
    m.get(String(it.parentId)).add(String(it.txId));
  }
  if (action === 'reject' && docBy.size) throw fail('Document payments can only be verified here, not rejected');

  let done = 0;
  const skipped = [];
  const verb = action === 'verify' ? 'verified' : 'rejected';

  for (const [paymentId, txIds] of feeBy) {
    const payment = await Payment.findById(paymentId).populate('student', 'name center counselor');
    if (!payment) { txIds.forEach(txId => skipped.push({ txId, reason: 'Payment record not found' })); continue; }
    const changed = [];
    for (const txId of txIds) {
      const tx = payment.transactions.id(txId);
      if (!tx || (tx.type || 'Fee') !== 'Fee') { skipped.push({ txId, reason: 'Payment not found' }); continue; }
      if (!PENDING.includes(tx.verificationStatus)) { skipped.push({ txId, reason: tx.verificationStatus === 'rejected' ? 'Already rejected' : 'Already verified' }); continue; }
      const prev = tx.verificationStatus;
      tx.verificationStatus = action === 'verify' ? 'verified' : 'rejected';
      tx.verificationNote = note || (prev === 'pending_counselor' ? 'Verified by Payment desk (counselor step skipped)' : 'Verified by Payment desk');
      tx.verifiedBy = req.user._id;
      tx.verifiedAt = new Date();
      changed.push({ tx, prev });
    }
    if (!changed.length) continue;
    payment.lastUpdatedBy = req.user._id;
    payment.lastUpdatedAt = new Date();
    await payment.save();          // recalculates paid / due and installment status
    const name = payment.student?.name || 'student';
    for (const { tx, prev } of changed) {
      await audit(`payment_desk_${verb}`, 'Payment', payment._id, req.user, { txId: tx._id, amount: tx.amount, utrRef: tx.utrRef, prevStatus: prev, note },
        `Payment desk ${verb} ₹${tx.amount} (${tx.utrRef || 'no UTR'}) for ${name}${note ? `: ${note}` : ''}`);
      const msg = action === 'verify'
        ? `Fee payment of ₹${tx.amount} for ${name} has been verified ✓`
        : `Fee payment of ₹${tx.amount} for ${name} was rejected: ${note}. Please correct and resubmit.`;
      await tellCentre(payment.student?.center, msg, payment.student?._id);
      await tellCounselor(payment.student?.counselor, msg, { studentId: payment.student?._id });
      done += 1;
    }
  }

  for (const [docId, payIds] of docBy) {
    const doc = await StudentDocument.findById(docId).populate('student', 'name');
    if (!doc) { payIds.forEach(txId => skipped.push({ txId, reason: 'Document not found' })); continue; }
    let changed = 0, amount = 0;
    for (const pid of payIds) {
      const p = doc.payments.id(pid);
      if (!p) { skipped.push({ txId: pid, reason: 'Payment not found' }); continue; }
      if (p.verified) { skipped.push({ txId: pid, reason: 'Already verified' }); continue; }
      p.verified = true; p.verifiedBy = req.user._id; p.verifiedAt = new Date();
      changed += 1; amount = r2(amount + (p.amount || 0));
    }
    if (!changed) continue;
    // A document waiting on payment verification moves on once all its payments are verified
    let advanced = false;
    if (doc.status === 'Payment_Submitted' && doc.payments.every(p => p.verified)) {
      doc.statusHistory.push({ status: 'Payment_Verified', changedBy: req.user._id, at: new Date(), note: note || 'Payment verified by Payment desk' });
      doc.status = 'Payment_Verified';
      advanced = true;
    }
    doc.lastUpdatedBy = req.user._id;
    doc.lastUpdatedAt = new Date();
    await doc.save();
    await audit('payment_desk_verified', 'StudentDocument', doc._id, req.user, { amount, count: changed, advanced },
      `Payment desk verified ₹${amount} for document "${doc.name}" (${doc.student?.name || 'student'})${advanced ? ' — sent on to dispatch' : ''}`);
    if (advanced) {
      await notifyRole('Dispatch', { message: `Payment verified - send courier to center for: "${doc.name}" - ${doc.student?.name}`, type: 'payment_verified', documentId: doc._id, role: 'Dispatch' });
      await tellCounselor(doc.counselor, `Doc payment verified for "${doc.name}" - Dispatch will courier to center`, { documentId: doc._id });
    }
    await tellCentre(doc.center, `Your payment of ₹${amount} for document "${doc.name}" has been verified ✓`, doc.student?._id);
    done += changed;
  }
  res.json({ done, skipped });
});

// ── Edit a payment (write-back to the real transaction) ──────
function txPatch(body, current) {
  const patch = {};
  if (body.amount !== undefined) {
    const a = r2(num(body.amount));
    if (!Number.isFinite(a) || a <= 0) throw fail('Enter a valid amount');
    patch.amount = a;
  }
  if (body.mode !== undefined) {
    if (!['UPI', 'Bank Transfer'].includes(body.mode)) throw fail('Select a valid payment mode');
    patch.mode = body.mode;
  }
  if (body.utrRef !== undefined) {
    const u = String(body.utrRef).trim();
    if (!u) throw fail('UTR / reference number cannot be empty');
    patch.utrRef = u;
  }
  if (body.paidAt !== undefined) {
    const d = new Date(body.paidAt);
    if (Number.isNaN(d.getTime())) throw fail('Enter a valid payment date');
    patch.paidAt = d;
  }
  if (body.note !== undefined) patch.note = String(body.note).trim();
  const diff = Object.entries(patch)
    .filter(([k, v]) => String(current[k] instanceof Date ? current[k].toISOString() : current[k] ?? '') !== String(v instanceof Date ? v.toISOString() : v))
    .map(([k, v]) => ({ field: k, before: current[k] ?? '', after: v }));
  return { patch, diff };
}

async function applyEdit(req, target, parentLabel, exclude, saveFn, auditEntity, auditId) {
  const reason = String(req.body.reason || '').trim() || 'Edited from Payment Desk';
  const { patch, diff } = txPatch(req.body, target);
  let accountChange = null;
  if (req.body.accountId !== undefined) {
    const acc = await accountFor(req.body.accountId || null);
    const before = target.paidToAccountLabel || '';
    if (String(target.paidToAccount || '') !== String(acc?._id || '')) {
      accountChange = { acc, before };
      diff.push({ field: 'account', before, after: acc?.label || '' });
    }
  }
  if (req.file) diff.push({ field: 'screenshot', before: target.paymentScreenshot ? 'uploaded' : 'none', after: 'uploaded' });
  if (!diff.length) throw fail('Nothing was changed');
  if (patch.utrRef && normalizeUtr(patch.utrRef) !== normalizeUtr(target.utrRef)) {
    const matches = await findDuplicateUtrMatches(patch.utrRef, exclude);
    if (matches.length && !(req.body.confirmDuplicate === true || req.body.confirmDuplicate === 'true')) {
      throw fail('This UTR already exists on other payments', 409, { duplicateMatches: matches });
    }
  }
  Object.assign(target, patch);
  if (req.file) target.paymentScreenshot = `/uploads/${req.file.filename}`;
  if (accountChange) {
    target.paidToAccount = accountChange.acc?._id;
    target.paidToAccountLabel = accountChange.acc?.label || '';
    if (accountChange.acc) {
      target.upiId = accountChange.acc.upiId || target.upiId;
      target.bankName = accountChange.acc.bankName || target.bankName;
    }
  }
  target.lastUpdatedBy = req.user._id;
  target.lastUpdatedAt = new Date();
  await saveFn();
  await audit('payment_desk_payment_edited', auditEntity, auditId, req.user, { reason, changes: diff, payment: String(target._id) },
    `Payment desk edited a payment for ${parentLabel}: ${diff.map(d => `${d.field} ${d.before} → ${d.after}`).join('; ')} (${reason})`);
}

exports.editFeePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.parentId).populate('student', 'name');
  const tx = payment?.transactions.id(req.params.txId);
  if (!tx || (tx.type || 'Fee') !== 'Fee') throw fail('Payment not found', 404);
  if (tx.source === 'Center Monthly Settlement') throw fail('This is a settlement (payment adjustment). Edit or reverse the whole settlement from its row.');
  await applyEdit(req, tx, payment.student?.name || 'student', { paymentId: payment._id, txId: tx._id }, () => payment.save(), 'Payment', payment._id);
  res.json(await summaryFor(payment.student._id));
});

exports.editDocPayment = asyncHandler(async (req, res) => {
  const doc = await StudentDocument.findById(req.params.parentId).populate('student', 'name');
  const pay = doc?.payments.id(req.params.txId);
  if (!pay) throw fail('Payment not found', 404);
  await applyEdit(req, pay, `${doc.student?.name || 'student'} / ${doc.name}`, { documentId: doc._id, docPaymentId: pay._id }, () => doc.save(), 'StudentDocument', doc._id);
  res.json({ ok: true });
});

// ── Edit student details + fee (write-back to Student / Payment) ──
exports.editStudent = asyncHandler(async (req, res) => {
  const b = req.body;
  const reason = String(b.reason || '').trim() || 'Edited from Payment Desk';
  const student = await Student.findById(req.params.id).select('name courseName courseYear enrollmentNumber applicationStatus center').lean();
  if (!student) throw fail('Student not found', 404);

  const set = {};
  const diff = [];
  const take = (field, value) => {
    if (value === undefined) return;
    const next = String(value).trim();
    if (String(student[field] || '') !== next) { set[field] = next; diff.push({ field, before: student[field] || '', after: next }); }
  };
  if (b.name !== undefined && !String(b.name).trim()) throw fail('Student name cannot be empty');
  take('name', b.name);
  take('courseName', b.courseName === undefined ? undefined : String(b.courseName).toUpperCase());
  take('courseYear', b.courseYear === undefined ? undefined : String(b.courseYear).toUpperCase());
  take('enrollmentNumber', b.enrollmentNumber);

  let payment = null, feeChange = null;
  if (b.totalFee !== undefined || b.discount !== undefined) {
    payment = await Payment.findOne({ student: student._id });
    if (!payment) payment = new Payment({ student: student._id, center: student.center });
    const totalFee = b.totalFee === undefined ? payment.totalFee || 0 : r2(num(b.totalFee));
    const discount = b.discount === undefined ? payment.discount || 0 : r2(num(b.discount));
    if (!Number.isFinite(totalFee) || totalFee < 0) throw fail('Enter a valid total fee');
    if (!Number.isFinite(discount) || discount < 0) throw fail('Enter a valid discount');
    if (discount > totalFee) throw fail('Discount cannot be more than the total fee');
    if (totalFee !== (payment.totalFee || 0)) { diff.push({ field: 'totalFee', before: payment.totalFee || 0, after: totalFee }); feeChange = true; }
    if (discount !== (payment.discount || 0)) { diff.push({ field: 'discount', before: payment.discount || 0, after: discount }); feeChange = true; }
    if (feeChange) { payment.totalFee = totalFee; payment.discount = discount; }
  }
  if (!diff.length) throw fail('Nothing was changed');

  if (set.enrollmentNumber !== undefined) {
    set.enrollmentNumberChecked = false;
    set.enrollmentNumberCheckedAt = undefined;
    set.enrollmentNumberCheckedBy = undefined;
  }
  if (Object.keys(set).length) {
    set.lastUpdatedBy = req.user._id; set.lastUpdatedAt = new Date();
    await Student.updateOne({ _id: student._id }, { $set: set });
  }
  if (feeChange) {
    payment.lastUpdatedBy = req.user._id; payment.lastUpdatedAt = new Date();
    await payment.save();
  }
  await audit('payment_desk_student_edited', 'Student', student._id, req.user, { reason, changes: diff },
    `Payment desk edited ${student.name}: ${diff.map(d => `${d.field} ${d.before} → ${d.after}`).join('; ')} (${reason})`);
  res.json(await summaryFor(student._id));
});

// ── Ledger (center-wise / student-wise) ──────────────────────
async function buildLedger(q) {
  const { from, toExcl } = parseRange(q);
  const view = q.view === 'student' ? 'student' : 'center';
  const filter = { createdAt: { $gte: from, $lt: toExcl }, applicationStatus: { $ne: 'Draft' } };
  if (isId(q.centerId)) filter.center = q.centerId;
  const students = await Student.find(filter)
    .select('name enrollmentNumber courseName courseYear applicationStatus rejectionReason center createdAt')
    .populate('center', 'name organisationName').sort('name').lean();
  const ids = students.map(s => s._id);
  const [payments, docs] = await Promise.all([
    Payment.find({ student: { $in: ids } }).select('student totalFee discount transactions').lean(),
    StudentDocument.find({ student: { $in: ids }, origin: { $ne: 'Inventory' } }).select('student status').lean(),
  ]);
  const payBy = new Map(payments.map(p => [String(p.student), p]));
  const docBy = new Map();
  docs.forEach(d => {
    const e = docBy.get(String(d.student)) || { total: 0, delivered: 0 };
    e.total += 1; if (d.status === 'Delivered') e.delivered += 1;
    docBy.set(String(d.student), e);
  });

  const rows = students.map(s => {
    const p = payBy.get(String(s._id));
    const net = netFeeOf(p);
    const paid = r2((p?.transactions || [])
      .filter(t => (t.type || 'Fee') === 'Fee' && COUNTED.includes(t.verificationStatus || 'not_required'))
      .reduce((a, t) => a + (t.amount || 0), 0));
    const d = docBy.get(String(s._id)) || { total: 0, delivered: 0 };
    return {
      studentId: s._id, centerId: s.center?._id, center: centerName(s.center), name: s.name, enrollmentNumber: s.enrollmentNumber || '',
      course: `${s.courseName || ''} ${s.courseYear || ''}`.trim(), status: s.applicationStatus, reason: reasonText(s),
      total: net, paid, balance: Math.max(0, r2(net - paid)), docsTotal: d.total, docsDelivered: d.delivered,
    };
  });

  const range = { from: from.toISOString().slice(0, 10), to: new Date(toExcl.getTime() - 86400000).toISOString().slice(0, 10) };
  if (view === 'student') {
    return { view, ...range, rows, totals: { students: rows.length, total: r2(rows.reduce((a, r) => a + r.total, 0)), paid: r2(rows.reduce((a, r) => a + r.paid, 0)), balance: r2(rows.reduce((a, r) => a + r.balance, 0)) } };
  }
  const byCenter = new Map();
  rows.forEach(r => {
    const e = byCenter.get(String(r.centerId)) || { centerId: r.centerId, center: r.center, students: 0, enrolled: 0, rejected: 0, total: 0, paid: 0, balance: 0, docsTotal: 0, docsDelivered: 0 };
    e.students += 1;
    if (r.status === 'Enrolled') e.enrolled += 1;
    if (['Rejected', 'Cancelled'].includes(r.status)) e.rejected += 1;
    e.total = r2(e.total + r.total); e.paid = r2(e.paid + r.paid); e.balance = r2(e.balance + r.balance);
    e.docsTotal += r.docsTotal; e.docsDelivered += r.docsDelivered;
    byCenter.set(String(r.centerId), e);
  });
  const list = [...byCenter.values()].sort((a, b) => a.center.localeCompare(b.center));
  const sum = k => r2(list.reduce((a, r) => a + r[k], 0));
  return { view, ...range, rows: list, totals: { students: sum('students'), enrolled: sum('enrolled'), rejected: sum('rejected'), total: sum('total'), paid: sum('paid'), balance: sum('balance') } };
}

exports.ledger = asyncHandler(async (req, res) => res.json(await buildLedger(req.query)));

exports.exportLedger = asyncHandler(async (req, res) => {
  const data = await buildLedger(req.query);
  const rangeText = `${data.from} to ${data.to}`;
  if (data.view === 'student') {
    sendCsv(res, `ledger-student-wise-${stamp()}.csv`, [
      ['NAME OF CENTRE', 'DATE RANGE', 'STUDENT NAME', 'ENROLLMENT', 'COURSE', 'STATUS', 'TOTAL AMOUNT', 'PAID', 'BALANCE', 'STATUS OF DOCUMENT', 'REASON'],
      ...data.rows.map(r => [r.center, rangeText, r.name, r.enrollmentNumber, r.course, r.status.replace(/_/g, ' '), r.total, r.paid, r.balance,
        r.docsTotal ? `${r.docsDelivered} of ${r.docsTotal} delivered` : '', r.reason]),
      ['TOTAL', '', `${data.totals.students} students`, '', '', '', data.totals.total, data.totals.paid, data.totals.balance, '', ''],
    ]);
    return;
  }
  sendCsv(res, `ledger-center-wise-${stamp()}.csv`, [
    ['NAME OF CENTRE', 'DATE RANGE', 'TOTAL STUDENTS', 'ENROLLED', 'REJECTED / CANCELLED', 'TOTAL AMOUNT', 'PAID', 'BALANCE', 'STATUS OF DOCUMENT'],
    ...data.rows.map(r => [r.center, rangeText, r.students, r.enrolled, r.rejected, r.total, r.paid, r.balance, r.docsTotal ? `${r.docsDelivered} of ${r.docsTotal} delivered` : '']),
    ['TOTAL', rangeText, data.totals.students, data.totals.enrolled, data.totals.rejected, data.totals.total, data.totals.paid, data.totals.balance, ''],
  ]);
});

// ── Document status ──────────────────────────────────────────
const AT_CENTRE = ['Dispatch_Received', 'Scanned', 'Accountant_Received', 'Counselor_Received', 'Center_Notified', 'Payment_Submitted', 'Payment_Verified'];
function docStage(status) {
  if (status === 'Delivered') return 'Delivered - confirmed by centre';
  if (status === 'Dispatched') return 'Dispatched to centre';
  if (AT_CENTRE.includes(status)) return 'At resource centre';
  if (['Fee_Rejected', 'Changes_Requested'].includes(status)) return 'Rejected / changes requested';
  if (['Requested', 'Forwarded', 'Fee_Pending'].includes(status)) return 'Request in review';
  return 'Yet to come from university';
}
const histAt = (doc, status, last = false) => {
  const hits = (doc.statusHistory || []).filter(h => h.status === status);
  return (last ? hits[hits.length - 1] : hits[0])?.at || null;
};
function docFeeStatus(doc) {
  const fee = doc.chargeFee || 0;
  const all = (doc.payments || []).reduce((a, p) => a + (p.amount || 0), 0);
  const verified = (doc.payments || []).filter(p => p.verified).reduce((a, p) => a + (p.amount || 0), 0);
  if (fee <= 0) return 'No charge';
  if (verified >= fee) return 'Paid';
  if (all >= fee) return 'Paid - not verified';
  if (all > 0) return 'Partly paid';
  return 'Due';
}

async function buildDocStatus(q, { all = false } = {}) {
  const { from, toExcl } = parseRange(q);
  const filter = { createdAt: { $gte: from, $lt: toExcl } };
  if (isId(q.centerId)) filter.center = q.centerId;
  if (q.origin === 'Inventory' || q.origin === 'Request') filter.origin = q.origin;
  const docs = await StudentDocument.find(filter)
    .populate('student', 'name enrollmentNumber courseName courseYear').populate('center', 'name organisationName')
    .populate('university', 'name').sort('-createdAt').lean();
  const search = String(q.search || '').trim().toLowerCase();
  let rows = docs.map(d => ({
    docId: d._id, studentId: d.student?._id, student: d.student?.name || '', enrollmentNumber: d.student?.enrollmentNumber || '',
    center: centerName(d.center), university: d.university?.name || '', docType: d.name, origin: d.origin, requestType: d.requestType,
    appliedOn: d.createdAt, feeStatus: docFeeStatus(d), chargeFee: d.chargeFee || 0,
    appliedInUniversity: histAt(d, 'Sent_To_University') || histAt(d, 'Fee_Approved'),
    receivedFromUniversity: histAt(d, 'Dispatch_Received'),
    rejection: ['Fee_Rejected', 'Changes_Requested'].includes(d.status) ? ((d.statusHistory || []).slice().reverse().find(h => h.status === d.status)?.note || d.status.replace(/_/g, ' ')) : '',
    status: d.status, stage: docStage(d.status),
    dispatchedOn: d.centerCourierInfo?.dispatchDate || histAt(d, 'Dispatched', true),
    tracking: [d.centerCourierInfo?.company, d.centerCourierInfo?.trackingNo].filter(Boolean).join(' - '),
    deliveredOn: histAt(d, 'Delivered', true),
  }));
  if (q.stage) rows = rows.filter(r => r.stage === q.stage);
  if (search) rows = rows.filter(r => [r.student, r.enrollmentNumber, r.docType, r.center, r.tracking].some(x => String(x || '').toLowerCase().includes(search)));
  const stages = rows.reduce((a, r) => { a[r.stage] = (a[r.stage] || 0) + 1; return a; }, {});
  if (all) return { rows: rows.slice(0, MAX_EXPORT_ROWS), stages };
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(q.limit, 10) || 50));
  return { rows: rows.slice((page - 1) * limit, page * limit), total: rows.length, stages, page, pages: Math.ceil(rows.length / limit) || 1 };
}

exports.docStatus = asyncHandler(async (req, res) => res.json(await buildDocStatus(req.query)));

exports.exportDocStatus = asyncHandler(async (req, res) => {
  const { rows } = await buildDocStatus(req.query, { all: true });
  sendCsv(res, `document-status-${stamp()}.csv`, [
    ['STUDENT NAME', 'ENROLLMENT', 'CENTRE', 'DATE OF APPLICATION / ADMISSION', 'DOCUMENT TYPE', 'STATUS OF FEE', 'DATE OF APPLY IN UNIVERSITY',
      'DATE OF RECD FROM UNIVERSITY', 'REJECTION BY UNIVERSITY (REASON)', 'STATUS OF DOCUMENT', 'DATE OF DISPATCHING', 'TRACKING ID', 'CONFIRMATION BY CENTRE (DATE)'],
    ...rows.map(r => [r.student, r.enrollmentNumber, r.center, ist(r.appliedOn), r.docType, r.feeStatus, ist(r.appliedInUniversity),
      ist(r.receivedFromUniversity), r.rejection, r.stage, ist(r.dispatchedOn), r.tracking, ist(r.deliveredOn)]),
  ]);
});

exports._internals = { feeTimeline, buildDayBook };
exports.EXPENSE_HEADS = EXPENSE_HEADS;

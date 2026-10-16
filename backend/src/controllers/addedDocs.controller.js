// ============================================================
// controllers/addedDocs.controller.js
// "Documents" list on a student (degree, marksheets, other documents) with a fee and payments against each one.
// Counsellors keep it from the student page; the Payment Desk can edit the same list.
// These are ordinary StudentDocument records (origin 'Added'), so their payments appear in the Day Book,
// can be verified / edited there, and the Day Book "Doc status" column lists them with what was paid.
// ============================================================
const asyncHandler = require('express-async-handler');
const Student         = require('../models/Student');
const StudentDocument = require('../models/StudentDocument');
const Counselor       = require('../models/Counselor');
const PaymentAccount  = require('../models/PaymentAccount');
const { audit } = require('../utils/helpers');
const { EPS, fail, r2, num, isId, esc } = require('../utils/accountsUtil');

const DESK = ['Admin', 'Payment', 'Accountant'];

async function loadStudent(req) {
  if (!isId(req.params.id)) throw fail('Invalid student');
  const s = await Student.findById(req.params.id).select('name enrollmentNumber center counselor university').lean();
  if (!s) throw fail('Student not found', 404);
  if (req.user.role === 'Center' && String(s.center) !== String(req.user.centerId || '')) throw fail('Forbidden', 403);
  if (req.user.role === 'Counselor') {
    const c = await Counselor.findById(req.user.counselorId).select('centers').lean();
    const own = String(s.counselor || '') === String(req.user.counselorId || '');
    const centre = (c?.centers || []).some(id => String(id) === String(s.center));
    if (!own && !centre) throw fail('Forbidden', 403);
  }
  return s;
}
const catOf = v => (v === 'Marksheet' ? 'Marksheet' : 'Other');
const docView = d => {
  const pays = (d.payments || []).map(p => ({
    _id: p._id, amount: p.amount || 0, mode: p.mode || '', utrRef: p.utrRef || '', paidAt: p.paidAt, accountName: p.paidToAccountLabel || '',
    verified: !!p.verified, note: p.note || '', screenshot: p.paymentScreenshot || '',
  }));
  const paid = r2(pays.reduce((a, p) => a + p.amount, 0));
  const verifiedPaid = r2(pays.filter(p => p.verified).reduce((a, p) => a + p.amount, 0));
  return { _id: d._id, category: catOf(d.category), fileUrl: d.fileUrl || '', fileName: d.scannedName || '', visibleToCenter: !!d.visibleToCenter, name: d.name, chargeFee: d.chargeFee || 0, note: d.note || '', addedAt: d.createdAt, payments: pays, paid, verifiedPaid, due: Math.max(0, r2((d.chargeFee || 0) - paid)) };
};
// category: 'Other' | 'Marksheet' (anything else = both); centreOnly: only the documents the centre was shown
const listFor = async (studentId, category, centreOnly = false) => {
  const f = { student: studentId, origin: 'Added' };
  if (category === 'Marksheet') f.category = 'Marksheet'; else if (category === 'Other') f.category = { $ne: 'Marksheet' };
  if (centreOnly) f.visibleToCenter = true;
  const docs = (await StudentDocument.find(f).sort('createdAt').lean()).map(docView);
  return [...docs.filter(x => x.category === 'Marksheet'), ...docs.filter(x => x.category !== 'Marksheet')];   // marksheets first
};
const loadDoc = async (req, s) => {
  if (!isId(req.params.docId)) throw fail('Invalid document');
  const d = await StudentDocument.findOne({ _id: req.params.docId, student: s._id, origin: 'Added' });
  if (!d) throw fail('Document not found', 404);
  return d;
};

// GET /students/:id/added-docs
exports.list = asyncHandler(async (req, res) => { const s = await loadStudent(req); res.json(await listFor(s._id, req.query.category, req.user.role === 'Center' || req.query.asCentre === '1')); });   // asCentre: a counsellor who switched into the centre sees only what the centre sees

// POST /students/:id/added-docs   { name, chargeFee?, note? }
exports.add = asyncHandler(async (req, res) => {
  const s = await loadStudent(req);
  const name = String(req.body.name || '').trim();
  if (!name) throw fail('Enter the document name');
  if (name.length > 120) throw fail('Document name is too long');
  const fee = r2(num(req.body.chargeFee || 0));
  if (!Number.isFinite(fee) || fee < 0) throw fail('Enter a valid fee');
  if (!s.counselor) throw fail('This student has no counsellor assigned');
  const dup = await StudentDocument.findOne({ student: s._id, origin: 'Added', name: new RegExp(`^${esc(name)}$`, 'i') }).select('_id').lean();
  if (dup) throw fail(`"${name}" is already in the list`);
  await StudentDocument.create({
    student: s._id, center: s.center, counselor: s.counselor, university: s.university, name, origin: 'Added', category: catOf(req.body.category), status: 'Delivered',
    chargeFee: fee, note: String(req.body.note || '').trim(), uploadedBy: req.user._id,
    statusHistory: [{ status: 'Delivered', note: 'Added to the student document list', changedBy: req.user._id }],
  });
  await audit('added_doc_created', 'Student', s._id, req.user, { name, fee, category: catOf(req.body.category) }, `${s.name}: ${catOf(req.body.category) === 'Marksheet' ? 'marksheet' : 'document'} added - ${name}${fee ? ` (fee ${fee})` : ''}`);
  res.status(201).json(await listFor(s._id, catOf(req.body.category)));
});

// PATCH /students/:id/added-docs/:docId   { chargeFee }
exports.update = asyncHandler(async (req, res) => {
  const s = await loadStudent(req);
  const d = await loadDoc(req, s);
  const fee = r2(num(req.body.chargeFee));
  if (!Number.isFinite(fee) || fee < 0) throw fail('Enter a valid fee');
  const paid = (d.payments || []).reduce((a, p) => a + (p.amount || 0), 0);
  if (fee + EPS < paid) throw fail(`₹${paid} is already paid for this document; the fee cannot be lower`);
  const before = d.chargeFee;
  d.chargeFee = fee; d.lastUpdatedBy = req.user._id; d.lastUpdatedAt = new Date();
  await d.save();
  await audit('added_doc_fee_changed', 'StudentDocument', d._id, req.user, { before, after: fee }, `${s.name} / ${d.name}: fee ${before} → ${fee}`);
  res.json(await listFor(s._id, catOf(d.category)));
});

// DELETE /students/:id/added-docs/:docId   (only while nothing is paid against it)
exports.remove = asyncHandler(async (req, res) => {
  const s = await loadStudent(req);
  const d = await loadDoc(req, s);
  const n = (d.payments || []).length;
  if (n && req.user.role !== 'Admin') throw fail('This document has payments. Only an Admin can delete it.', 403);
  const total = (d.payments || []).reduce((a, p) => a + (p.amount || 0), 0);
  await d.deleteOne();
  await audit('added_doc_removed', 'Student', s._id, req.user, { name: d.name, payments: n, amount: total }, `${s.name}: document removed - ${d.name}${n ? ` (with ${n} payment${n === 1 ? '' : 's'}, ₹${total})` : ''}`);
  res.json(await listFor(s._id, catOf(d.category)));
});

// DELETE /students/:id/added-docs/:docId/payments/:payId   (Admin only)
exports.removePayment = asyncHandler(async (req, res) => {
  if (req.user.role !== 'Admin') throw fail('Only an Admin can delete a payment', 403);
  const s = await loadStudent(req);
  const d = await loadDoc(req, s);
  const p = d.payments.id(req.params.payId);
  if (!p) throw fail('Payment not found', 404);
  const info = { amount: p.amount, utrRef: p.utrRef, verified: p.verified };
  p.deleteOne();
  d.lastUpdatedBy = req.user._id; d.lastUpdatedAt = new Date();
  await d.save();
  await audit('added_doc_payment_deleted', 'StudentDocument', d._id, req.user, info, `${s.name} / ${d.name}: payment ₹${info.amount} (${info.utrRef}) deleted`);
  res.json(await listFor(s._id, catOf(d.category)));
});

// POST /students/:id/added-docs/:docId/payments   (multipart, optional paymentScreenshot)
// A counsellor's payment waits for the Payment Desk to verify it; a desk user's is verified straight away.
exports.addPayment = asyncHandler(async (req, res) => {
  const s = await loadStudent(req);
  const d = await loadDoc(req, s);
  const b = req.body;
  const amount = r2(num(b.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw fail('Enter the amount paid');
  if (!(d.chargeFee > 0)) throw fail('Set the fee for this document first');
  const paid = (d.payments || []).reduce((a, p) => a + (p.amount || 0), 0);
  if (amount > r2(d.chargeFee - paid) + EPS) throw fail(`More than the balance of ₹${r2(d.chargeFee - paid)}`);
  const mode = b.mode === 'Bank Transfer' ? 'Bank Transfer' : 'UPI';
  const utrRef = String(b.utrRef || '').trim();
  if (!utrRef) throw fail('UTR / reference number is required');
  const paidAt = b.paidAt ? new Date(b.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime())) throw fail('Enter a valid payment date');
  let acc = null;
  if (b.accountId) { if (!isId(b.accountId)) throw fail('Invalid account'); acc = await PaymentAccount.findById(b.accountId).lean(); if (!acc) throw fail('Account not found', 404); }
  const desk = DESK.includes(req.user.role);
  d.payments.push({
    amount, mode, utrRef, paidAt, note: String(b.note || '').trim(), recordedBy: req.user._id,
    upiId: acc?.upiId || '', bankName: acc?.bankName || '', accountHolder: acc?.accountHolder || '', accountNumber: acc?.accountNumber || '', ifscCode: acc?.ifscCode || '',
    paidToAccount: acc?._id, paidToAccountLabel: acc?.label || '', paymentScreenshot: req.file ? `/uploads/${req.file.filename}` : '',
    verified: desk, ...(desk ? { verifiedBy: req.user._id, verifiedAt: new Date() } : {}),
  });
  d.lastUpdatedBy = req.user._id; d.lastUpdatedAt = new Date();
  await d.save();
  await audit('added_doc_payment', 'StudentDocument', d._id, req.user, { amount, utrRef, verified: desk }, `${s.name} / ${d.name}: payment ₹${amount} (${utrRef})${desk ? '' : ' - waiting for verification'}`);
  res.status(201).json(await listFor(s._id, catOf(d.category)));
});

// GET /payment-desk/added-docs?search=   students that have documents in this list
exports.deskList = asyncHandler(async (req, res) => {
  const docs = await StudentDocument.find({ origin: 'Added' }).populate('student', 'name enrollmentNumber').populate('center', 'name organisationName').sort('-createdAt').limit(1000).lean();
  const q = String(req.query.search || '').trim().toLowerCase();
  const by = new Map();
  for (const d of docs.sort((a, b) => (b.category === 'Marksheet') - (a.category === 'Marksheet'))) {
    if (!d.student) continue;
    const k = String(d.student._id);
    if (!by.has(k)) by.set(k, { studentId: d.student._id, student: d.student.name, enrollmentNumber: d.student.enrollmentNumber || '', center: d.center?.name || d.center?.organisationName || '', docs: [] });
    by.get(k).docs.push(docView(d));
  }
  let rows = [...by.values()];
  if (q) rows = rows.filter(r => [r.student, r.enrollmentNumber, ...r.docs.map(x => x.name)].some(x => String(x).toLowerCase().includes(q)));
  res.json(rows.slice(0, 300));
});

// POST /students/:id/added-docs/:docId/file   (multipart: file)  - the document itself (scan / screenshot)
exports.uploadFile = asyncHandler(async (req, res) => {
  const s = await loadStudent(req);
  const d = await loadDoc(req, s);
  if (!req.file) throw fail('Choose a file to upload');
  d.fileUrl = `/uploads/${req.file.filename}`; d.scannedName = req.file.originalname || ''; d.sizeKb = Math.round((req.file.size || 0) / 1024);
  d.lastUpdatedBy = req.user._id; d.lastUpdatedAt = new Date();
  await d.save();
  await audit('added_doc_file', 'StudentDocument', d._id, req.user, { name: d.name }, `${s.name} / ${d.name}: document file uploaded`);
  res.json(await listFor(s._id, catOf(d.category)));
});

// PATCH /students/:id/added-docs/:docId/visibility   { visible }   - show / hide this document to the centre
exports.setVisibility = asyncHandler(async (req, res) => {
  const s = await loadStudent(req);
  const d = await loadDoc(req, s);
  const visible = req.body.visible === true || req.body.visible === 'true';
  if (visible === !!d.visibleToCenter) return res.json(await listFor(s._id, catOf(d.category)));
  d.visibleToCenter = visible; d.sharedAt = visible ? new Date() : undefined; d.sharedBy = visible ? req.user._id : undefined;
  d.lastUpdatedBy = req.user._id; d.lastUpdatedAt = new Date();
  await d.save();
  await audit(visible ? 'added_doc_shown' : 'added_doc_hidden', 'StudentDocument', d._id, req.user, { name: d.name }, `${s.name} / ${d.name}: ${visible ? 'shown to' : 'hidden from'} the centre`);
  res.json(await listFor(s._id, catOf(d.category)));
});
